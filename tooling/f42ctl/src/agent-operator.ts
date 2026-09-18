import { readFile, writeFile, open, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { parse, modify, applyEdits, type ParseError } from 'jsonc-parser'
import { portableInstanceIdSchema } from '@fellowship42/management-protocol'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
export function wranglerEntryPoint() {
  return path.join(
    path.dirname(require.resolve('wrangler/package.json')),
    'bin',
    'wrangler.js',
  )
}
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function validConfig(value: unknown): value is Config {
  const c = record(value)
  return (
    Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    (c.vars === undefined ||
      (c.vars !== null &&
        typeof c.vars === 'object' &&
        !Array.isArray(c.vars))) &&
    (c.compatibility_flags === undefined ||
      (Array.isArray(c.compatibility_flags) &&
        c.compatibility_flags.every((v) => typeof v === 'string'))) &&
    ['kv_namespaces', 'd1_databases'].every(
      (key) =>
        c[key] === undefined ||
        (Array.isArray(c[key]) &&
          c[key].every((v) => {
            const r = record(v)
            return (
              typeof r.binding === 'string' &&
              (key === 'kv_namespaces'
                ? typeof r.id === 'string'
                : typeof r.database_name === 'string' &&
                  typeof r.database_id === 'string')
            )
          })),
    )
  )
}
type Config = {
  account_id?: string
  vars?: Record<string, unknown>
  compatibility_flags?: string[]
  kv_namespaces?: Array<{ binding: string; id: string }>
  d1_databases?: Array<{
    binding: string
    database_name: string
    database_id: string
  }>
  assets?: { run_worker_first?: string[] | boolean }
}
type Check = {
  id: string
  status: 'pass' | 'fail' | 'skipped'
  message: string
}
export type AgentDoctorReport = {
  origin: string
  ok: boolean
  checks: Check[]
  evidence: 'configuration-only' | 'unauthenticated-discovery'
}
const failure = (message: string): never => {
  throw new Error(message)
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
function originFor(value: string, local: boolean) {
  try {
    const url = new URL(value)
    if (
      url.origin === value &&
      (url.protocol === 'https:' ||
        (local &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      return value
  } catch {
    /* bounded diagnostic below */
  }
  return failure(
    'Use one canonical HTTPS origin; local mode also allows HTTP loopback.',
  )
}
export async function loadAgentConfig(
  file: string,
): Promise<{ text: string; config: Config }> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return failure('Unable to read the Wrangler configuration.')
  }
  const errors: ParseError[] = []
  const parsed: unknown = parse(text, errors)
  if (errors.length || !validConfig(parsed) || 'env' in record(parsed))
    return failure('Invalid Wrangler configuration.')
  return { text, config: parsed }
}
async function boundedJson(response: Response) {
  if (!response.ok || !response.body) throw new Error()
  const reader = response.body.getReader()
  let size = 0
  const pieces: Uint8Array[] = []
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > 64 * 1024) throw new Error()
      pieces.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const piece of pieces) {
    bytes.set(piece, offset)
    offset += piece.length
  }
  return record(JSON.parse(new TextDecoder().decode(bytes)))
}
export async function diagnoseAgents(
  config: Config,
  originInput: string,
  {
    local = false,
    offline = false,
    fetcher = fetch,
  }: { local?: boolean; offline?: boolean; fetcher?: typeof fetch } = {},
): Promise<AgentDoctorReport> {
  const origin = originFor(originInput, local),
    checks: Check[] = []
  const check = (id: string, pass: boolean, message: string) =>
    checks.push({ id, status: pass ? 'pass' : 'fail', message })
  const vars = config.vars ?? {}
  check(
    'canonical_origin',
    vars.MCP_ORIGIN === origin,
    'MCP_ORIGIN must equal the exact church origin.',
  )
  check(
    'staff_sign_in',
    vars.SIGN_IN_ORIGIN === origin ||
      Boolean(vars.ACCESS_TEAM_DOMAIN && vars.ACCESS_AUD),
    'Configure instance-owned sign-in at this origin or the optional Access adapter.',
  )
  check(
    'public_fetch',
    config.compatibility_flags?.includes('global_fetch_strictly_public') ===
      true,
    'Keep public-network-only fetch for client metadata.',
  )
  const kv = config.kv_namespaces?.find((v) => v.binding === 'OAUTH_KV')
  check(
    'oauth_namespace',
    Boolean(
      kv && /^[a-f0-9]{32}$/i.test(kv.id) && (local || !/^0+$/.test(kv.id)),
    ),
    'Bind a dedicated OAUTH_KV namespace; production placeholders are invalid.',
  )
  const db = config.d1_databases?.find((v) => v.binding === 'DB')
  check(
    'database',
    Boolean(
      db &&
      /^[a-z0-9][a-z0-9_-]{0,62}$/i.test(db.database_name) &&
      uuid.test(db.database_id) &&
      (local || !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id)),
    ),
    'Bind the exact instance DB; production placeholders are invalid.',
  )
  const paths = config.assets?.run_worker_first
  check(
    'worker_routes',
    paths === true ||
      (Array.isArray(paths) &&
        ['/api/*', '/mcp', '/oauth/*', '/.well-known/*'].every((p) =>
          paths.includes(p),
        )),
    'Route staff APIs, MCP, OAuth and discovery through the Worker.',
  )
  if (offline)
    checks.push({
      id: 'discovery',
      status: 'skipped',
      message: 'Offline: deployment and client interoperability are unproven.',
    })
  else {
    try {
      const get = (url: string) =>
        fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
      const unauth = await get(`${origin}/mcp`)
      const challenge = unauth.headers.get('www-authenticate') ?? ''
      check(
        'bearer_challenge',
        unauth.status === 401 &&
          /\bBearer\b/i.test(challenge) &&
          /resource_metadata="([^"]+)"/.exec(challenge)?.[1] ===
            `${origin}/.well-known/oauth-protected-resource/mcp`,
        'Unauthenticated MCP must return a Bearer challenge for this instance.',
      )
      await unauth.body?.cancel()
      const resource = await boundedJson(
        await get(`${origin}/.well-known/oauth-protected-resource/mcp`),
      )
      check(
        'resource_audience',
        resource.resource === `${origin}/mcp` &&
          Array.isArray(resource.authorization_servers) &&
          resource.authorization_servers.length === 1 &&
          resource.authorization_servers[0] === origin,
        'Resource discovery must identify only this instance and its exact MCP audience.',
      )
      const authorization = await boundedJson(
        await get(`${origin}/.well-known/oauth-authorization-server`),
      )
      check(
        'authorization_server',
        authorization.issuer === origin &&
          authorization.authorization_endpoint ===
            `${origin}/oauth/authorize` &&
          authorization.token_endpoint === `${origin}/oauth/token` &&
          Array.isArray(authorization.code_challenge_methods_supported) &&
          authorization.code_challenge_methods_supported.includes('S256'),
        'Authorization discovery must pin the same issuer/endpoints and support S256 PKCE.',
      )
    } catch {
      checks.push({
        id: 'discovery_unavailable',
        status: 'fail',
        message:
          'Discovery failed, redirected, or exceeded its limits. Check deployment, routing and authentication gates.',
      })
    }
  }
  return {
    origin,
    ok: checks.every((c) => c.status !== 'fail'),
    checks,
    evidence: offline ? 'configuration-only' : 'unauthenticated-discovery',
  }
}

type Run = (args: string[], env: NodeJS.ProcessEnv) => Promise<string>
const wrangler: Run = async (args, env) => {
  try {
    return (
      await exec(process.execPath, [wranglerEntryPoint(), ...args], {
        env,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      })
    ).stdout
  } catch {
    return failure(
      'The provider operation failed. Credentials may already be revoked; inspect the exact target before retrying.',
    )
  }
}
function rows(text: string): Array<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error()
    return parsed.flatMap((v) => {
      const r = record(v)
      return Array.isArray(r.results) ? r.results.map(record) : []
    })
  } catch {
    return failure('The provider returned an invalid verification result.')
  }
}
export async function resetAgentCredentials(
  input: {
    configPath: string
    outputConfig: string
    origin: string
    freshKvId: string
    instanceId: string
    accountId?: string
    local?: boolean
  },
  run: Run = wrangler,
) {
  const local = input.local === true,
    origin = originFor(input.origin, local)
  const { text, config } = await loadAgentConfig(input.configPath)
  const instanceId = portableInstanceIdSchema.parse(input.instanceId)
  const kvIndex =
    config.kv_namespaces?.findIndex((v) => v.binding === 'OAUTH_KV') ?? -1
  const db = config.d1_databases?.find((v) => v.binding === 'DB')
  if (
    !db ||
    !uuid.test(db.database_id) ||
    (!local && /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id)) ||
    !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(db.database_name) ||
    kvIndex < 0 ||
    !/^[a-f0-9]{32}$/i.test(input.freshKvId) ||
    /^0+$/.test(input.freshKvId) ||
    config.kv_namespaces![kvIndex].id === input.freshKvId
  )
    return failure(
      'Choose the instance DB and a different, fresh OAuth namespace.',
    )
  if (typeof config.vars?.MCP_ORIGIN !== 'string' || !config.vars.MCP_ORIGIN)
    return failure(
      'Credential reset requires an already-configured MCP origin.',
    )
  if (config.vars?.F42_PORTABLE_INSTANCE_ID !== instanceId)
    return failure(
      'The portable instance confirmation does not match this configuration.',
    )
  if (
    !local &&
    (!input.accountId ||
      !/^[a-f0-9]{32}$/i.test(input.accountId) ||
      config.account_id !== input.accountId)
  )
    return failure(
      'Remote reset requires an explicit account ID matching account_id in the configuration.',
    )
  const source = path.resolve(input.configPath),
    destination = path.resolve(input.outputConfig)
  if (
    source === destination ||
    path.dirname(source) !== path.dirname(destination)
  )
    return failure(
      'Write the new configuration to a new sibling file, preserving all relative paths.',
    )
  const namespaceEdits = modify(
    text,
    ['kv_namespaces', kvIndex, 'id'],
    input.freshKvId,
    { formattingOptions: { insertSpaces: true, tabSize: 2 } },
  )
  let next = applyEdits(text, namespaceEdits)
  next = applyEdits(
    next,
    modify(next, ['vars', 'MCP_ORIGIN'], origin, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  )
  if (
    typeof config.vars?.SIGN_IN_ORIGIN === 'string' &&
    config.vars.SIGN_IN_ORIGIN
  )
    next = applyEdits(
      next,
      modify(next, ['vars', 'SIGN_IN_ORIGIN'], origin, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      }),
    )
  const environment = {
    ...process.env,
    ...(!local ? { CLOUDFLARE_ACCOUNT_ID: input.accountId } : {}),
  }
  const common = ['--config', source, local ? '--local' : '--remote']
  const query = async (sql: string) =>
    rows(
      await run(
        [
          'd1',
          'execute',
          db.database_name,
          ...common,
          '--command',
          sql,
          '--json',
        ],
        environment,
      ),
    )
  const identity = await query(
    'SELECT instance_id FROM instance_metadata WHERE singleton=1',
  )
  if (identity.length !== 1 || identity[0].instance_id !== instanceId)
    return failure(
      'The target database does not have the confirmed portable instance identity.',
    )
  let keys: unknown
  try {
    keys = JSON.parse(
      await run(
        ['kv', 'key', 'list', '--namespace-id', input.freshKvId, ...common],
        environment,
      ),
    )
  } catch {
    return failure('Unable to verify the fresh OAuth namespace.')
  }
  if (!Array.isArray(keys) || keys.length !== 0)
    return failure(
      'The replacement OAuth namespace must be empty. No keys were deleted.',
    )
  let reserved = false,
    directory: string | undefined
  try {
    const file = await open(destination, 'wx', 0o600)
    await file.close()
    reserved = true
    directory = await mkdtemp(path.join(tmpdir(), 'f42-agent-reset-'))
    const operation = randomUUID(),
      now = Date.now()
    const gate = `EXISTS (SELECT 1 FROM instance_metadata WHERE singleton=1 AND instance_id='${instanceId}')`
    const sql = `DELETE FROM agent_consent_requests WHERE ${gate};
UPDATE agent_connections SET revoked_at=COALESCE(revoked_at,${now}),provider_grant_id=NULL WHERE ${gate};
DELETE FROM local_auth_sessions WHERE ${gate};
DELETE FROM local_auth_challenges WHERE ${gate};
DELETE FROM local_auth_enrollments WHERE ${gate};
INSERT INTO audit_events(id,church_id,actor_user_id,action,entity_type,entity_id,request_id,occurred_at) SELECT '${operation}',primary_church_id,NULL,'agent.credentials_reset','instance',instance_id,'${operation}',${now} FROM instance_metadata WHERE singleton=1 AND instance_id='${instanceId}';`
    const sqlPath = path.join(directory, 'reset.sql')
    await writeFile(sqlPath, sql, { mode: 0o600 })
    await run(
      [
        'd1',
        'execute',
        db.database_name,
        ...common,
        '--file',
        sqlPath,
        '--yes',
        '--json',
      ],
      environment,
    )
    const verified = await query(
      `SELECT count(*) AS reset_count FROM audit_events WHERE id='${operation}' AND action='agent.credentials_reset'`,
    )
    if (verified[0]?.reset_count !== 1)
      return failure(
        'Credential reset was not verified. Inspect the exact target before retrying.',
      )
    await writeFile(destination, next, { mode: 0o600 })
    return {
      origin,
      instanceId,
      credentialsRevoked: true,
      configurationWritten: true,
      deploymentRequired: true,
      passkeysPreserved: true,
    }
  } catch (error) {
    if (reserved) await rm(destination, { force: true })
    if (
      error instanceof Error &&
      /^(Credential reset|The provider)/.test(error.message)
    )
      throw error
    return failure(
      'Reset did not complete. Inspect the target before retrying; credentials may already be revoked. The original configuration is unchanged.',
    )
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}

export async function agentOperatorCommand(command: string, args: string[]) {
  const allowed = new Set(
    command === 'agents-doctor'
      ? ['--config', '--origin', '--mode', '--offline']
      : [
          '--config',
          '--origin',
          '--mode',
          '--fresh-kv-id',
          '--confirm-instance-id',
          '--account-id',
          '--output-config',
        ],
  )
  const values = new Map<string, string | true>()
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (!allowed.has(flag) || values.has(flag))
      return failure(
        'Invalid agent operator arguments. See docs/agent-operator.md.',
      )
    if (flag === '--offline') {
      values.set(flag, true)
      continue
    }
    const value = args[++i]
    if (!value || value.startsWith('--'))
      return failure('Missing agent operator argument.')
    values.set(flag, value)
  }
  const required = (flag: string) => {
    const value = values.get(flag)
    return typeof value === 'string' ? value : failure(`Missing ${flag}.`)
  }
  const mode = values.get('--mode') ?? 'remote'
  if (mode !== 'remote' && mode !== 'local')
    return failure('Mode must be local or remote.')
  if (command === 'agents-doctor') {
    const { config } = await loadAgentConfig(required('--config'))
    const report = await diagnoseAgents(config, required('--origin'), {
      local: mode === 'local',
      offline: values.has('--offline'),
    })
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    if (!report.ok) process.exitCode = 1
  } else {
    const report = await resetAgentCredentials({
      configPath: required('--config'),
      outputConfig: required('--output-config'),
      origin: required('--origin'),
      freshKvId: required('--fresh-kv-id'),
      instanceId: required('--confirm-instance-id'),
      accountId: values.get('--account-id') as string | undefined,
      local: mode === 'local',
    })
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  }
}
