import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  diagnoseAgents,
  resetAgentCredentials,
  wranglerEntryPoint,
  loadAgentConfig,
} from './agent-operator.js'
it('resolves the installed provider CLI through its exported manifest', async () => {
  expect((await readFile(wranglerEntryPoint(), 'utf8')).length).toBeGreaterThan(
    0,
  )
})
it('rejects inherited environments and malformed binding arrays without echoing config', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'f42-config-test-'))
  const file = path.join(directory, 'wrangler.json')
  try {
    for (const value of [
      { env: { production: { vars: { SECRET: 'private' } } } },
      { kv_namespaces: 'private' },
    ]) {
      await writeFile(file, JSON.stringify(value))
      await expect(loadAgentConfig(file)).rejects.toThrow(
        'Invalid Wrangler configuration.',
      )
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
const origin = 'https://church.example'
const instanceId = 'instance_42424242-1234-5678-9abc-123456789abc'
const config = {
  account_id: 'a'.repeat(32),
  vars: {
    MCP_ORIGIN: origin,
    SIGN_IN_ORIGIN: origin,
    F42_PORTABLE_INSTANCE_ID: instanceId,
    SECRET_MARKER: 'never-in-report',
  },
  compatibility_flags: ['global_fetch_strictly_public'],
  kv_namespaces: [{ binding: 'OAUTH_KV', id: 'b'.repeat(32) }],
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'church',
      database_id: '42424242-1234-5678-9abc-123456789abc',
    },
  ],
  assets: {
    run_worker_first: ['/api/*', '/mcp', '/oauth/*', '/.well-known/*'],
  },
}
const metadata = {
  issuer: origin,
  authorization_endpoint: origin + '/oauth/authorize',
  token_endpoint: origin + '/oauth/token',
  code_challenge_methods_supported: ['S256'],
}
const fetcher: typeof fetch = async (input) => {
  const url = String(input)
  if (url.endsWith('/mcp') && !url.includes('well-known'))
    return new Response(null, {
      status: 401,
      headers: {
        'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
      },
    })
  if (url.includes('oauth-protected-resource'))
    return Response.json({
      resource: origin + '/mcp',
      authorization_servers: [origin],
    })
  return Response.json(metadata)
}
it('diagnoses exact discovery and configuration without exposing values or claiming client proof', async () => {
  const result = await diagnoseAgents(config, origin, { fetcher })
  expect(result.ok).toBe(true)
  expect(result.evidence).toBe('unauthenticated-discovery')
  expect(JSON.stringify(result)).not.toContain('never-in-report')
  const offline = await diagnoseAgents(config, origin, {
    offline: true,
    fetcher: async () => {
      throw new Error('must not fetch')
    },
  })
  expect(offline.ok).toBe(true)
  expect(offline.evidence).toBe('configuration-only')
})
it('rejects mismatched audiences, missing bindings, oversized discovery and provider error payloads', async () => {
  const wrong = await diagnoseAgents({ ...config, kv_namespaces: [] }, origin, {
    fetcher: async (input) =>
      String(input).includes('oauth-protected-resource')
        ? Response.json({
            resource: 'https://other.example/mcp',
            authorization_servers: [origin],
          })
        : fetcher(input),
  })
  expect(wrong.ok).toBe(false)
  expect(
    wrong.checks.filter((c) => c.status === 'fail').map((c) => c.id),
  ).toContain('resource_audience')
  const large = await diagnoseAgents(config, origin, {
    fetcher: async () => Response.json({ secret: 'x'.repeat(100_000) }),
  })
  expect(large.ok).toBe(false)
  expect(JSON.stringify(large)).not.toContain('xxxxx')
  const failed = await diagnoseAgents(config, origin, {
    fetcher: async () => {
      throw new Error('private-provider-token')
    },
  })
  expect(JSON.stringify(failed)).not.toContain('private-provider-token')
})
describe('credential reset', () => {
  async function fixture(
    run: (data: {
      input: Parameters<typeof resetAgentCredentials>[0]
      calls: string[][]
      configPath: string
      output: string
      invoke: NonNullable<Parameters<typeof resetAgentCredentials>[1]>
    }) => Promise<void>,
  ) {
    const directory = await mkdtemp(path.join(tmpdir(), 'f42-reset-test-'))
    const configPath = path.join(directory, 'wrangler.jsonc'),
      output = path.join(directory, 'wrangler.restored.jsonc')
    const calls: string[][] = []
    await writeFile(configPath, JSON.stringify(config))
    const invoke: NonNullable<
      Parameters<typeof resetAgentCredentials>[1]
    > = async (args, env) => {
      calls.push(args)
      expect(env.CLOUDFLARE_ACCOUNT_ID).toBe(config.account_id)
      if (args[0] === 'kv') return '[]'
      if (args.includes('--file')) {
        const sql = await readFile(args[args.indexOf('--file') + 1], 'utf8')
        expect(sql).toContain('DELETE FROM local_auth_sessions')
        expect(sql).not.toContain('DELETE FROM local_auth_passkeys')
        expect(sql).toContain(instanceId)
        return JSON.stringify([{ results: [{ 'Total queries executed': 6 }] }])
      }
      return JSON.stringify([
        {
          results: [
            args[args.indexOf('--command') + 1].includes('reset_count')
              ? { reset_count: 1 }
              : { instance_id: instanceId },
          ],
        },
      ])
    }
    try {
      await run({
        input: {
          configPath,
          outputConfig: output,
          origin,
          freshKvId: 'c'.repeat(32),
          instanceId,
          accountId: config.account_id,
        },
        calls,
        configPath,
        output,
        invoke,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  it('verifies identity and fresh namespace before revocation, confirms remote import separately, and preserves source config', () =>
    fixture(async ({ input, calls, configPath, output, invoke }) => {
      const result = await resetAgentCredentials(input, invoke)
      expect(result.deploymentRequired).toBe(true)
      expect(calls.map((a) => a[0])).toEqual(['d1', 'kv', 'd1', 'd1'])
      expect(calls[2]).toContain('--file')
      expect(calls[3]).toContain('--command')
      expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual(config)
      expect(
        JSON.parse(await readFile(output, 'utf8')).kv_namespaces[0].id,
      ).toBe('c'.repeat(32))
      expect((await stat(output)).mode & 0o777).toBe(0o600)
    }))
  it('refuses wrong identity, reused namespaces, nonempty namespaces and existing output before a mutation', () =>
    fixture(async ({ input, calls, output, invoke }) => {
      await expect(
        resetAgentCredentials(
          {
            ...input,
            instanceId: 'instance_11111111-1234-5678-9abc-123456789abc',
          },
          invoke,
        ),
      ).rejects.toThrow('confirmation')
      await expect(
        resetAgentCredentials({ ...input, freshKvId: 'b'.repeat(32) }, invoke),
      ).rejects.toThrow('different')
      await expect(
        resetAgentCredentials(input, async (args, env) =>
          args[0] === 'kv' ? '[{"name":"private-key"}]' : invoke(args, env),
        ),
      ).rejects.toThrow('empty')
      await writeFile(output, 'preserve')
      await expect(resetAgentCredentials(input, invoke)).rejects.toThrow(
        'original configuration',
      )
      expect(await readFile(output, 'utf8')).toBe('preserve')
      expect(calls.some((a) => a.includes('--file'))).toBe(false)
    }))
  it('never leaves a ready-to-deploy file after an unverified reset', () =>
    fixture(async ({ input, output, invoke }) => {
      await expect(
        resetAgentCredentials(input, async (args, env) =>
          args.includes('--command') &&
          args.some((v) => v.includes('reset_count'))
            ? '[{"results":[{"reset_count":0}]}]'
            : invoke(args, env),
        ),
      ).rejects.toThrow('not verified')
      await expect(stat(output)).rejects.toThrow()
    }))
})
