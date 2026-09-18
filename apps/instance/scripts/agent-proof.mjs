import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'

// Interactive, synthetic-data-only proof. Credentials live only in this process.
export class ProofFailure extends Error {
  constructor(step) {
    super(
      `Proof did not complete: ${step}. Disconnect the proof client before retrying.`,
    )
    this.name = 'ProofFailure'
  }
}
export async function runProof(origin, confirm, log = console.log) {
  const progress = { step: 'configuration', stages: [] }
  try {
    return await executeProof(origin, confirm, log, progress)
  } catch {
    throw new ProofFailure(progress.step)
  }
}
async function executeProof(origin, confirm, log, progress) {
  const begin = (step) => {
    progress.step = step
  }
  const complete = () => {
    progress.stages.push(progress.step)
    log(`ok: ${progress.step}`)
  }
  const validateTokens = (tokens) => {
    for (const field of ['access_token', 'refresh_token']) {
      assert.equal(typeof tokens[field], 'string')
      assert.ok(tokens[field].length > 0)
    }
    assert.ok(Number.isFinite(tokens.expires_in) && tokens.expires_in >= 60)
    return tokens
  }
  const base = new URL(origin)
  assert.equal(
    base.origin,
    origin,
    'Use an exact origin without a trailing slash',
  )
  assert.ok(
    base.protocol === 'https:' ||
      (base.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(base.hostname)),
    'HTTPS is required except on loopback',
  )
  const resource = `${origin}/mcp`
  const request = (path, options = {}) =>
    fetch(new URL(path, origin), {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  begin('discovery')
  const challenge = await request('/mcp')
  assert.equal(
    challenge.status,
    401,
    'MCP must challenge unauthenticated calls',
  )
  assert.match(challenge.headers.get('www-authenticate') ?? '', /Bearer/i)
  const protectedResponse = await request(
    '/.well-known/oauth-protected-resource/mcp',
  )
  assert.equal(protectedResponse.status, 200)
  const protectedMetadata = await protectedResponse.json()
  assert.equal(protectedMetadata.resource, resource)
  assert.deepEqual(protectedMetadata.authorization_servers, [origin])
  const metadataResponse = await request(
    '/.well-known/oauth-authorization-server',
  )
  assert.equal(metadataResponse.status, 200)
  const metadata = await metadataResponse.json()
  assert.equal(metadata.issuer, origin)
  for (const field of [
    'authorization_endpoint',
    'token_endpoint',
    'registration_endpoint',
  ])
    assert.equal(new URL(metadata[field]).origin, origin, `Unexpected ${field}`)

  complete()
  begin('consent')
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  let callbackResolve
  let callbackReject
  const callback = new Promise((resolve, reject) => {
    callbackResolve = resolve
    callbackReject = reject
  })
  // Attach rejection handling before the operator may spend time signing in.
  void callback.catch(() => {})
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (
      url.pathname !== '/callback' ||
      url.searchParams.get('state') !== state
    ) {
      res.writeHead(400).end('Invalid callback')
      return
    }
    if (
      url.searchParams.get('iss') !== origin ||
      !url.searchParams.get('code')
    ) {
      res.writeHead(400).end('Authorization failed')
      callbackReject(new Error('Authorization failed'))
      return
    }
    res
      .writeHead(200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      })
      .end('Connected. Return to the terminal.')
    callbackResolve(url.searchParams.get('code'))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const redirectUri = `http://127.0.0.1:${server.address().port}/callback`
  const timer = setTimeout(
    () => callbackReject(new Error('Consent timed out')),
    600_000,
  )
  let client
  try {
    const registration = await request(metadata.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Fellowship42 reference proof',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    })
    assert.equal(registration.status, 201, 'Client registration failed')
    const { client_id: clientId } = await registration.json()
    assert.equal(typeof clientId, 'string')
    assert.ok(clientId.length > 0)
    const authorization = new URL(metadata.authorization_endpoint)
    authorization.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'church:read draft:read draft:write',
      resource,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString()
    log(`Sign in and connect in your browser:\n${authorization}`)
    const code = await callback
    clearTimeout(timer)
    server.close()
    const exchange = async (fields) =>
      request(metadata.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, resource, ...fields }),
      })
    complete()
    begin('token_exchange')
    const tokenResponse = await exchange({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    })
    assert.equal(tokenResponse.status, 200, 'Code exchange failed')
    const initialTokens = validateTokens(await tokenResponse.json())
    complete()
    begin('refresh')
    const refreshResponse = await exchange({
      grant_type: 'refresh_token',
      refresh_token: initialTokens.refresh_token,
    })
    assert.equal(refreshResponse.status, 200, 'Granted refresh failed')
    const tokens = validateTokens(await refreshResponse.json())
    complete()
    begin('read')
    client = new Client(
      { name: 'fellowship42-reference-proof', version: '1.0.0' },
      {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      },
    )
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            redirect: 'error',
            signal: AbortSignal.timeout(30_000),
          }),
        requestInit: {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      }),
    )
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args })
      assert.ok(!result.isError, `${name} failed`)
      return result.structuredContent.data
    }
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'read_church',
      'read_website_draft',
      'save_website_draft',
    ])
    await call('read_church')
    const before = await call('read_website_draft')
    const publicRead = await request('/api/site')
    assert.equal(
      publicRead.status,
      200,
      'Publish the synthetic site before this proof',
    )
    const publicBefore = (await publicRead.json()).church
    complete()
    begin('save')
    await confirm(
      'This will replace the synthetic website draft welcome line. Continue',
    )
    const proposed = {
      ...before.draft,
      tagline: `Agent proof ${new Date().toISOString()}`,
    }
    const saved = await call('save_website_draft', {
      version: before.version,
      draft: proposed,
    })
    assert.equal(saved.publicationChanged, false)
    const afterSave = await request('/api/site')
    assert.equal(afterSave.status, 200)
    assert.deepEqual((await afterSave.json()).church, publicBefore)
    complete()
    begin('retry')
    const retry = await client.callTool({
      name: 'save_website_draft',
      arguments: { version: before.version, draft: proposed },
    })
    assert.equal(retry.isError, true)
    assert.equal(retry.structuredContent.error.code, 'version_conflict')
    const reread = await call('read_website_draft')
    assert.deepEqual(
      reread.draft,
      proposed,
      'Lost-response retry reconciliation failed',
    )
    assert.equal(
      reread.version,
      saved.settings.version,
      'Retry wrote a second version',
    )
    complete()
    begin('publication')
    log(`Review: ${saved.reviewUrl}\nPreview: ${saved.previewUrl}`)
    await confirm(
      'Review the draft and publish it in the church app, then continue',
    )
    const publicAfter = await request('/api/site')
    assert.equal(publicAfter.status, 200)
    assert.equal(
      (await publicAfter.json()).church.tagline,
      proposed.tagline,
      'Reviewed content was not published',
    )
    complete()
    begin('revocation_control')
    const freshResponse = await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    })
    assert.equal(freshResponse.status, 200)
    const fresh = validateTokens(await freshResponse.json())
    const issuedAt = Date.now()
    const probe = () =>
      request('/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fresh.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Mcp-Method': 'tools/list',
          'MCP-Protocol-Version': '2026-07-28',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      })
    const control = await probe()
    assert.equal(control.status, 200)
    const controlResult = await control.json()
    assert.ok(Array.isArray(controlResult.result?.tools))
    complete()
    begin('revocation')
    await confirm(
      `Disconnect Fellowship42 reference proof at ${origin}/app/agents, then continue`,
    )
    const denied = await probe()
    assert.ok(
      Date.now() - issuedAt < fresh.expires_in * 1000 - 30_000,
      'Revocation observation exceeded fresh-token window',
    )
    if (denied.status === 403) {
      assert.equal((await denied.json()).error?.code, 'agent_access_revoked')
    } else {
      assert.equal(denied.status, 401)
      assert.match(
        denied.headers.get('www-authenticate') ?? '',
        /invalid_token/,
      )
    }
    complete()
    begin('refresh_denial')
    const refreshDenied = await exchange({
      grant_type: 'refresh_token',
      refresh_token: fresh.refresh_token,
    })
    assert.equal(refreshDenied.status, 400)
    assert.equal((await refreshDenied.json()).error, 'invalid_grant')
    complete()
    log(
      JSON.stringify({
        result: 'passed',
        client: 'reference-sdk',
        protocol: '2026-07-28',
        observedAt: new Date().toISOString(),
        externalClientProven: false,
        stages: progress.stages,
      }),
    )
  } finally {
    clearTimeout(timer)
    server.closeAllConnections()
    server.close()
    await client?.close().catch(() => {})
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [origin, acknowledgement] = process.argv.slice(2)
  if (!origin || acknowledgement !== '--synthetic-data') {
    console.error(
      'Usage: pnpm --filter @fellowship42/instance agent:proof https://disposable.example --synthetic-data',
    )
    process.exitCode = 1
  } else {
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    try {
      await runProof(origin, async (message) => {
        assert.equal(
          await input.question(`${message} (type yes): `),
          'yes',
          'Proof cancelled',
        )
      })
    } catch (error) {
      // Do not print SDK/provider exceptions: they can contain credential material.
      console.error(
        error instanceof ProofFailure
          ? error.message
          : 'Proof failed. Disconnect the proof client in the app.',
      )
      process.exitCode = 1
    } finally {
      input.close()
    }
  }
}
