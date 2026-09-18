import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { runProof } from '../apps/instance/scripts/agent-proof.mjs'

// This tests the proof runner's failure detection, not live interoperability.
async function fixture(options = {}) {
  const { ignoreRevoke = false } = options
  let challenge
  let latestRefresh = null
  let exchanges = 0
  let version = 1
  let draft = { tagline: 'Before' }
  let published = 'Before'
  let revoked = false
  let origin
  let saves = 0
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString()
    const json = (value, status = 200, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
      res.end(JSON.stringify(value))
    }
    if (req.url === '/.well-known/oauth-protected-resource/mcp')
      return json({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
      })
    if (req.url === '/.well-known/oauth-authorization-server')
      return json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
      })
    if (req.url === '/register') return json({ client_id: 'proof-client' }, 201)
    if (req.url === '/token') {
      const fields = new URLSearchParams(raw)
      assert.equal(fields.get('resource'), `${origin}/mcp`)
      if (fields.get('grant_type') === 'authorization_code') {
        assert.equal(
          createHash('sha256')
            .update(fields.get('code_verifier'))
            .digest('base64url'),
          challenge,
        )
      } else assert.equal(fields.get('refresh_token'), latestRefresh)
      if (revoked && !options.ignoreRefreshRevoke)
        return json({ error: 'invalid_grant' }, 400)
      latestRefresh = `fixture-refresh-${++exchanges}`
      return json({
        access_token: 'fixture-access',
        ...(options.missingRefresh ? {} : { refresh_token: latestRefresh }),
        expires_in: 900,
      })
    }
    if (req.url === '/api/site')
      return options.unpublished
        ? json({ error: { code: 'site_unpublished' } }, 404)
        : json({ church: { tagline: published } })
    if (req.url === '/mcp') {
      if (!req.headers.authorization)
        return json({}, 401, { 'WWW-Authenticate': 'Bearer' })
      assert.equal(req.headers.authorization, 'Bearer fixture-access')
      if (revoked && !ignoreRevoke)
        return json({ error: { code: 'agent_access_revoked' } }, 403)
      const rpc = JSON.parse(raw)
      const response = (result) =>
        json({
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            resultType: 'complete',
            ttlMs: 0,
            cacheScope: 'private',
            ...result,
          },
        })
      if (rpc.method === 'server/discover')
        return response({
          supportedVersions: ['2026-07-28'],
          capabilities: { tools: {} },
        })
      if (rpc.method === 'tools/list')
        return response({
          tools: [
            'read_church',
            'read_website_draft',
            'save_website_draft',
          ].map((name) => ({ name, inputSchema: { type: 'object' } })),
        })
      assert.equal(rpc.method, 'tools/call')
      const { name, arguments: args } = rpc.params
      let data = {}
      if (name === 'read_website_draft') data = { version, draft }
      if (name === 'save_website_draft') {
        if (args.version !== version && !options.acceptStale)
          return response({
            isError: true,
            content: [{ type: 'text', text: 'version_conflict' }],
            structuredContent: { error: { code: 'version_conflict' } },
          })
        draft = args.draft
        version++
        saves++
        if (options.savePublishes) published = draft.tagline
        data = {
          settings: { version, draft },
          publicationChanged: false,
          reviewUrl: `${origin}/app/settings`,
          previewUrl: `${origin}/app/preview`,
        }
      }
      return response({
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: { data },
      })
    }
    json({}, 404)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  const logs = []
  const pending = []
  return {
    origin,
    log(message) {
      logs.push(message)
      if (message.startsWith('Sign in')) {
        const auth = new URL(message.split('\n')[1])
        challenge = auth.searchParams.get('code_challenge')
        const callback = new URL(auth.searchParams.get('redirect_uri'))
        callback.search = new URLSearchParams({
          state: auth.searchParams.get('state'),
          iss: options.wrongIssuer ? 'https://wrong.example' : origin,
          ...(options.denyConsent
            ? { error: 'access_denied' }
            : { code: 'fixture-code' }),
        })
        pending.push(fetch(callback).then((response) => response.text()))
      }
    },
    async confirm(message) {
      if (message.startsWith('This') && options.cancel)
        throw new Error('fixture-access')
      if (message.startsWith('Review') && !options.skipPublish)
        published = draft.tagline
      if (message.startsWith('Disconnect')) revoked = true
    },
    logs,
    saves: () => saves,
    async close() {
      await Promise.all(pending)
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

test('proof runner reconciles a lost save response and verifies publication and revocation without leaking credentials', async () => {
  const f = await fixture()
  try {
    await runProof(f.origin, f.confirm, f.log)
    assert.equal(f.saves(), 1)
    const evidence = JSON.parse(f.logs.at(-1))
    assert.equal(evidence.result, 'passed')
    assert.equal(evidence.externalClientProven, false)
    assert.doesNotMatch(
      f.logs.join('\n'),
      /fixture-access|fixture-refresh|fixture-code/,
    )
  } finally {
    await f.close()
  }
})

test('proof runner refuses to report success when revoked access still works', async () => {
  const f = await fixture({ ignoreRevoke: true })
  try {
    await assert.rejects(
      runProof(f.origin, f.confirm, f.log),
      /Proof did not complete: revocation/,
    )
    assert.ok(!f.logs.some((line) => line.includes('"result":"passed"')))
  } finally {
    await f.close()
  }
})

for (const [option, stage] of [
  ['cancel', 'save'],
  ['ignoreRefreshRevoke', 'refresh_denial'],
  ['savePublishes', 'save'],
  ['acceptStale', 'retry'],
  ['skipPublish', 'publication'],
  ['denyConsent', 'consent'],
  ['wrongIssuer', 'consent'],
  ['missingRefresh', 'token_exchange'],
  ['unpublished', 'read'],
]) {
  test(`proof runner rejects ${option} without false evidence or credential output`, async () => {
    const f = await fixture({ [option]: true })
    try {
      await assert.rejects(runProof(f.origin, f.confirm, f.log), (error) => {
        assert.match(
          error.message,
          new RegExp(`Proof did not complete: ${stage}`),
        )
        assert.doesNotMatch(
          error.message,
          /fixture-access|fixture-refresh|fixture-code/,
        )
        return true
      })
      if (option === 'cancel') assert.equal(f.saves(), 0)
      assert.ok(!f.logs.some((line) => line.includes('"result":"passed"')))
    } finally {
      await f.close()
    }
  })
}

test('an expired observation window cannot count as revocation evidence', async (t) => {
  const f = await fixture()
  const realNow = Date.now.bind(Date)
  try {
    await assert.rejects(
      runProof(
        f.origin,
        async (message) => {
          await f.confirm(message)
          if (message.startsWith('Disconnect'))
            t.mock.method(Date, 'now', () => realNow() + 900_000)
        },
        f.log,
      ),
      /Proof did not complete: revocation/,
    )
    assert.ok(!f.logs.some((line) => line.includes('"result":"passed"')))
  } finally {
    t.mock.restoreAll()
    await f.close()
  }
})
