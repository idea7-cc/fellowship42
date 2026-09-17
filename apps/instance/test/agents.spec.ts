import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import type { AgentConsent } from '../contracts/agents'
import type { ChurchSettings } from '../contracts/church-settings'
import { agentRoutes } from '../worker/features/agents/routes'
import { agentFetch } from '../worker/features/agents/oauth'
import {
  churchSettingsRoutes,
  siteRoutes,
} from '../worker/features/church/routes'
import { readSettings } from '../worker/features/church/read'
import { mutateChurch } from '../worker/features/church/service'
import type { AccessIdentity } from '../worker/lib/auth'
import { AppError } from '../worker/lib/errors'

const origin = 'https://example.test'
const owner: AccessIdentity = {
  provider: 'cloudflare-access',
  subject: 'agent-owner',
  email: 'owner@example.test',
  firstName: 'Demo',
  lastName: 'Owner',
}
const verifier = 'fellowship42-test-pkce-verifier-at-least-43-characters-long'
const redirectUri = 'https://agent.example.test/callback'

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET status = 'active' WHERE id = 'user_demo_owner'",
    ),
    env.DB.prepare(
      "UPDATE church_memberships SET status = 'active' WHERE user_id = 'user_demo_owner'",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO membership_roles (church_id,membership_id,role_id,assigned_at) SELECT cm.church_id,cm.id,r.id,1 FROM church_memberships cm JOIN roles r ON r.church_id=cm.church_id AND r.key='owner' WHERE cm.user_id='user_demo_owner'",
    ),
    env.DB.prepare('DELETE FROM agent_connections'),
    env.DB.prepare('DELETE FROM agent_consent_requests'),
  ])
  await env.DB.prepare(
    `INSERT OR IGNORE INTO auth_identities (id,user_id,provider,subject,email_at_provider,created_at,updated_at) VALUES ('agent-owner','user_demo_owner',?,?,?,1,1)`,
  )
    .bind(owner.provider, owner.subject, owner.email)
    .run()
})

async function send(request: Request, identity: AccessIdentity | null = owner) {
  const app = new Hono<{
    Bindings: Env
    Variables: { identity: AccessIdentity | null; requestId: string }
  }>()
  app.use('*', async (c, next) => {
    c.set('identity', identity)
    c.set('requestId', 'agent-test')
    await next()
  })
  app.onError((error, c) =>
    c.json(
      {
        error: {
          code: error instanceof AppError ? error.code : 'internal_error',
          message: error.message,
        },
      },
      error instanceof HTTPException ? error.status : 500,
    ),
  )
  app.route('/api/agents', agentRoutes)
  app.route('/api/church-settings', churchSettingsRoutes)
  app.route('/api/site', siteRoutes)
  const ctx = createExecutionContext()
  const response = await agentFetch(request, env, ctx, app.fetch)
  await waitOnExecutionContext(ctx)
  return response
}
async function api(
  path: string,
  body?: unknown,
  identity: AccessIdentity | null = owner,
  requestOrigin = origin,
) {
  return send(
    new Request(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    identity,
  )
}
async function authorization(scopes = 'church:read draft:read draft:write') {
  const registered = await send(
    new Request(`${origin}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test agent',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    }),
    null,
  )
  expect(registered.status).toBe(201)
  const { client_id: clientId } = await registered.json<{ client_id: string }>()
  const challengeBytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  )
  const challenge = btoa(String.fromCharCode(...challengeBytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: 'test-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: `${origin}/mcp`,
  })
  return { clientId, params }
}
async function consent(params: URLSearchParams) {
  const response = await api(`/api/agents/consent?${params}`)
  expect(response.status).toBe(200)
  return response.json<AgentConsent>()
}
async function exchange(
  clientId: string,
  code: string,
  codeVerifier = verifier,
  resource = `${origin}/mcp`,
) {
  return send(
    new Request(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        resource,
      }),
    }),
    null,
  )
}
async function connect(scopes?: string) {
  const { clientId, params } = await authorization(scopes)
  const request = await consent(params)
  const approval = await api('/api/agents/consent', {
    requestId: request.requestId,
    decision: 'allow',
  })
  expect(approval.status).toBe(200)
  const redirect = new URL(
    (await approval.json<{ redirectTo: string }>()).redirectTo,
  )
  expect(redirect.searchParams.get('state')).toBe('test-state')
  expect(redirect.searchParams.get('iss')).toBe(origin)
  const response = await exchange(clientId, redirect.searchParams.get('code')!)
  expect(response.status).toBe(200)
  const token = await response.json<{
    access_token: string
    refresh_token: string
  }>()
  const row = await env.DB.prepare(
    'SELECT id FROM agent_connections WHERE client_id = ?',
  )
    .bind(clientId)
    .first<{ id: string }>()
  return { ...token, clientId, id: row!.id }
}
function mcpRequest(
  token: string | null,
  method = 'tools/list',
  params: Record<string, unknown> = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Method': method,
    'MCP-Protocol-Version': '2026-07-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (typeof params.name === 'string') headers['Mcp-Name'] = params.name
  return new Request(`${origin}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
}
async function sdkClient(token: string) {
  const client = new Client(
    { name: 'f42-integration', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  )
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (input, init) => send(new Request(input, init), null),
    }),
  )
  return client
}
async function mutationEvidence() {
  return env.DB.prepare(
    "SELECT COUNT(*) AS total FROM audit_events WHERE action = 'church.draft_saved'",
  ).first<{ total: number }>()
}

describe('church-owned agent connections', () => {
  it('advertises resource-bound OAuth, CIMD and S256 without requiring Access for discovery', async () => {
    const challenge = await send(mcpRequest(null), null)
    expect(challenge.status).toBe(401)
    expect(challenge.headers.get('WWW-Authenticate')).toContain(
      '/.well-known/oauth-protected-resource/mcp',
    )
    const metadata = await send(
      new Request(`${origin}/.well-known/oauth-protected-resource/mcp`),
      null,
    )
    expect(await metadata.json()).toMatchObject({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
    })
    const server = await send(
      new Request(`${origin}/.well-known/oauth-authorization-server`),
      null,
    )
    expect(await server.json()).toMatchObject({
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
    })
    expect(server.headers.get('cache-control')).toBe('private, no-store')
  })

  it('authorizes a client ID metadata document without dynamic registration', async () => {
    const { params } = await authorization('church:read')
    const clientId = 'https://metadata-agent.example.test/client.json'
    params.set('client_id', clientId)
    const metadataFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        expect(String(input)).toBe(clientId)
        return Response.json({
          client_id: clientId,
          client_name: 'Metadata agent',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        })
      })
    try {
      const pending = await consent(params)
      expect(pending.clientName).toBe('Metadata agent')
      const approval = await api('/api/agents/consent', {
        requestId: pending.requestId,
        decision: 'allow',
      })
      expect(approval.status).toBe(200)
      const code = new URL(
        (await approval.json<{ redirectTo: string }>()).redirectTo,
      ).searchParams.get('code')!
      const token = await exchange(clientId, code)
      expect(token.status).toBe(200)
    } finally {
      metadataFetch.mockRestore()
    }
  })

  it('requires signed-in permission, exact redirect/resource, S256, scopes and same-origin consent', async () => {
    const { params } = await authorization()
    expect(
      (await api(`/api/agents/consent?${params}`, undefined, null)).status,
    ).toBe(401)
    for (const [key, value] of [
      ['redirect_uri', 'https://attacker.example/callback'],
      ['resource', 'https://other.example/mcp'],
      ['code_challenge_method', 'plain'],
      ['scope', 'people:read'],
      ['scope', 'draft:write'],
    ]) {
      const invalid = new URLSearchParams(params)
      invalid.set(key!, value!)
      expect((await api(`/api/agents/consent?${invalid}`)).status).toBe(400)
    }
    const pending = await consent(params)
    expect(
      (
        await api(
          '/api/agents/consent',
          { requestId: pending.requestId, decision: 'allow' },
          {
            ...owner,
            subject: 'other-agent-user',
            email: 'other@example.test',
          },
        )
      ).status,
    ).toBe(410)
    expect(
      (
        await api(
          '/api/agents/consent',
          { requestId: pending.requestId, decision: 'allow' },
          owner,
          'https://attacker.example',
        )
      ).status,
    ).toBe(403)
    const denied = await api('/api/agents/consent', {
      requestId: pending.requestId,
      decision: 'deny',
    })
    expect((await denied.json<{ redirectTo: string }>()).redirectTo).toContain(
      'error=access_denied',
    )
    expect(
      (
        await api('/api/agents/consent', {
          requestId: pending.requestId,
          decision: 'allow',
        })
      ).status,
    ).toBe(410)
    expect(
      (await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM agent_connections',
      ).first<{ total: number }>())!.total,
    ).toBe(0)
  })

  it('rejects incorrect PKCE and authorization-code replay', async () => {
    const { clientId, params } = await authorization()
    const pending = await consent(params)
    const approved = await api('/api/agents/consent', {
      requestId: pending.requestId,
      decision: 'allow',
    })
    const code = new URL(
      (await approved.json<{ redirectTo: string }>()).redirectTo,
    ).searchParams.get('code')!
    expect((await exchange(clientId, code, 'wrong-verifier')).status).toBe(400)
    expect((await exchange(clientId, code)).status).toBe(200)
    expect((await exchange(clientId, code)).status).toBe(400)
  })

  it('saves a private draft through the official SDK, shares app state and rejects stale edits atomically', async () => {
    const connected = await connect()
    const client = await sdkClient(connected.access_token)
    try {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        ['read_church', 'read_website_draft', 'save_website_draft'],
      )
      const before = await readSettings(env.DB, 'church_demo')
      const publishedBefore = await (await api('/api/site')).text()
      const result = await client.callTool({
        name: 'save_website_draft',
        arguments: {
          version: before.version,
          draft: { ...before.draft, summary: 'Private agent draft.' },
        },
      })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        data: {
          previewUrl: `${origin}/app/preview`,
          publicationChanged: false,
        },
      })
      const saved = await (
        await api('/api/church-settings/church_demo')
      ).json<ChurchSettings>()
      expect(saved.draft.summary).toBe('Private agent draft.')
      expect(await (await api('/api/site')).text()).toBe(publishedBefore)
      const count = await mutationEvidence()
      const stale = await client.callTool({
        name: 'save_website_draft',
        arguments: { version: before.version, draft: before.draft },
      })
      expect(stale.isError).toBe(true)
      expect(stale.structuredContent).toMatchObject({
        error: { code: 'version_conflict' },
      })
      expect(await mutationEvidence()).toEqual(count)
      const audit = await env.DB.prepare(
        "SELECT actor_user_id,metadata_json FROM audit_events WHERE action = 'church.draft_saved'",
      ).first<{ actor_user_id: string; metadata_json: string }>()
      expect(audit?.actor_user_id).toBe('user_demo_owner')
      expect(JSON.parse(audit!.metadata_json)).toEqual({
        connectionId: connected.id,
        clientId: connected.clientId,
      })
      expect(audit!.metadata_json).not.toContain('Private agent draft')
    } finally {
      await client.close()
    }
  })

  it('uses fresh stateless HTTP requests and bounds tools to the token scopes', async () => {
    const before = await readSettings(env.DB, 'church_demo')
    const connected = await connect('church:read')
    for (let i = 0; i < 2; i++) {
      const response = await send(mcpRequest(connected.access_token), null)
      expect(response.status).toBe(200)
      expect(response.headers.get('mcp-session-id')).toBeNull()
      expect(await response.json()).toMatchObject({
        result: { tools: [{ name: 'read_church' }] },
      })
    }
    const forbidden = await send(
      mcpRequest(connected.access_token, 'tools/call', {
        name: 'read_website_draft',
        arguments: {},
      }),
      null,
    )
    expect(JSON.stringify(await forbidden.json())).not.toContain('draft_json')
    const changed = await env.DB.prepare(
      'SELECT version FROM churches WHERE id = ?',
    )
      .bind('church_demo')
      .first<{ version: number }>()
    expect(changed?.version).toBe(before.version)
  })

  it('honors downscoped refresh tokens and does not let agent tokens authenticate the app API', async () => {
    const connected = await connect()
    const refreshed = await send(
      new Request(`${origin}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connected.refresh_token,
          client_id: connected.clientId,
          scope: 'church:read',
        }),
      }),
      null,
    )
    expect(refreshed.status).toBe(200)
    const token = await refreshed.json<{ access_token: string }>()
    const response = await send(mcpRequest(token.access_token), null)
    expect(await response.json()).toMatchObject({
      result: { tools: [{ name: 'read_church' }] },
    })
    const apiResponse = await send(
      new Request(`${origin}/api/church-settings/church_demo`, {
        headers: { Authorization: `Bearer ${connected.access_token}` },
      }),
      null,
    )
    expect(apiResponse.status).toBe(401)
    const settings = await readSettings(env.DB, 'church_demo')
    await expect(
      mutateChurch(
        env.DB,
        'church_demo',
        {
          userId: 'user_demo_owner',
          connectionId: connected.id,
          requestId: 'publish-denial',
        },
        'publish',
        settings.version,
      ),
    ).rejects.toMatchObject({ code: 'agent_publish_denied' })
  })

  it('revokes immediately in D1 and denies refresh, even with retained KV credentials', async () => {
    const connected = await connect()
    expect(
      (await api(`/api/agents/church_demo/${connected.id}/revoke`, {})).status,
    ).toBe(200)
    expect(
      (await send(mcpRequest(connected.access_token), null)).status,
    ).toBeGreaterThanOrEqual(400)
    const refresh = await send(
      new Request(`${origin}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: connected.refresh_token,
          client_id: connected.clientId,
        }),
      }),
      null,
    )
    expect(refresh.status).toBe(400)
    const before = await mutationEvidence()
    const settings = await readSettings(env.DB, 'church_demo')
    await expect(
      mutateChurch(
        env.DB,
        'church_demo',
        {
          userId: 'user_demo_owner',
          requestId: 'race',
          connectionId: connected.id,
          clientId: connected.clientId,
        },
        'save',
        settings.version,
        settings.draft,
      ),
    ).rejects.toMatchObject({ code: 'version_conflict' })
    expect(await mutationEvidence()).toEqual(before)
    expect(
      (await api(`/api/agents/church_demo/${connected.id}/revoke`, {})).status,
    ).toBe(200)
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM audit_events WHERE action='agent.revoked'",
        ).first<{ total: number }>()
      )?.total,
    ).toBe(1)
  })

  it('rechecks user suspension, membership and role removal independently of OAuth token lifetime', async () => {
    const connected = await connect()
    await env.DB.prepare(
      "UPDATE users SET status = 'suspended' WHERE id = 'user_demo_owner'",
    ).run()
    expect((await send(mcpRequest(connected.access_token), null)).status).toBe(
      403,
    )
    await env.DB.prepare(
      "UPDATE users SET status = 'active' WHERE id = 'user_demo_owner'",
    ).run()
    await env.DB.prepare(
      "UPDATE church_memberships SET status = 'left' WHERE user_id = 'user_demo_owner'",
    ).run()
    expect((await send(mcpRequest(connected.access_token), null)).status).toBe(
      403,
    )
    await env.DB.prepare(
      "UPDATE church_memberships SET status = 'active' WHERE user_id = 'user_demo_owner'",
    ).run()
    await env.DB.prepare(
      "DELETE FROM membership_roles WHERE membership_id IN (SELECT id FROM church_memberships WHERE user_id = 'user_demo_owner')",
    ).run()
    expect((await send(mcpRequest(connected.access_token), null)).status).toBe(
      403,
    )
  })

  it('keeps every active connection visible and bounds additional consent without success evidence', async () => {
    const { params } = await authorization()
    const pending = await consent(params)
    const now = Date.now()
    await env.DB.batch(
      Array.from({ length: 20 }, () =>
        env.DB.prepare(
          `INSERT INTO agent_connections (id,church_id,user_id,client_id,client_name,scopes_json,created_at,expires_at) VALUES (?,'church_demo','user_demo_owner','test-client','Agent','["church:read"]',?,?)`,
        ).bind(crypto.randomUUID(), now, now + 60000),
      ),
    )
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM audit_events WHERE action='agent.approved'",
    ).first()
    const response = await api('/api/agents/consent', {
      requestId: pending.requestId,
      decision: 'allow',
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'connection_limit' },
    })
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM audit_events WHERE action='agent.approved'",
      ).first(),
    ).toEqual(before)
    const listed = await api('/api/agents/church_demo')
    expect(
      (await listed.json<{ connections: unknown[] }>()).connections,
    ).toHaveLength(20)
  })

  it('fails closed for expired consent and grants, wrong targets, and cross-origin MCP requests', async () => {
    const { params } = await authorization()
    const pending = await consent(params)
    await env.DB.prepare(
      'UPDATE agent_consent_requests SET expires_at = 1 WHERE id = ?',
    )
      .bind(pending.requestId)
      .run()
    expect(
      (
        await api('/api/agents/consent', {
          requestId: pending.requestId,
          decision: 'allow',
        })
      ).status,
    ).toBe(410)
    const connected = await connect()
    expect(
      (await api(`/api/agents/other/${connected.id}/revoke`, {})).status,
    ).toBe(404)
    const request = mcpRequest(connected.access_token)
    request.headers.set('Origin', 'https://attacker.example')
    expect((await send(request, null)).status).toBe(403)
    await env.DB.prepare(
      'UPDATE agent_connections SET expires_at = 1 WHERE id = ?',
    )
      .bind(connected.id)
      .run()
    expect((await send(mcpRequest(connected.access_token), null)).status).toBe(
      403,
    )
  })
})
