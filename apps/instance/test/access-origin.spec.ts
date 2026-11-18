import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import worker from '../worker'

/*
 * A browser session authenticated by Cloudflare Access carries its assertion
 * on every request to the instance, including ones a foreign page triggers.
 * State-changing requests and WebSocket upgrades must come from the instance
 * itself when the browser says where they came from; callers that send no
 * Origin (scripts, service tokens) are unaffected.
 */

const instance = 'https://fellowship42.test'
const issuer = 'https://origin-test.cloudflareaccess.com'
const audience = 'origin-test-audience'
const bindings = {
  ...env,
  ACCESS_TEAM_DOMAIN: issuer,
  ACCESS_AUD: audience,
} as unknown as Env
let assertion: string

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: 'origin-test',
    alg: 'RS256',
  }
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    String(input instanceof Request ? input.url : input) ===
    `${issuer}/cdn-cgi/access/certs`
      ? Promise.resolve(Response.json({ keys: [jwk] }))
      : realFetch(input, init),
  )
  assertion = await new SignJWT({ email: 'owner@example.test' })
    .setProtectedHeader({ alg: 'RS256', kid: 'origin-test' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('demo-owner-access-subject')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  const now = Date.now()
  await env.DB.prepare(
    `
      INSERT OR IGNORE INTO auth_identities (
        id, user_id, provider, subject, email_at_provider, created_at, updated_at
      ) VALUES ('identity_demo_owner', 'user_demo_owner', 'cloudflare-access',
                'demo-owner-access-subject', 'owner@example.test', ?, ?)
    `,
  )
    .bind(now, now)
    .run()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function send(
  method: string,
  path: string,
  headers: Record<string, string> = {},
) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(
    new Request(`${instance}${path}`, {
      method,
      headers: {
        'cf-access-jwt-assertion': assertion,
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(method === 'GET'
        ? {}
        : { body: JSON.stringify({ firstName: 'Origin', lastName: 'Check' }) }),
    }) as Request<unknown, IncomingRequestCfProperties>,
    bindings,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

it('rejects Access-authenticated writes and upgrades from another origin', async () => {
  const foreign = await send('POST', '/api/people/church_demo', {
    Origin: 'https://evil.test',
  })
  expect(foreign.status).toBe(403)
  expect(
    ((await foreign.json()) as { error: { code: string } }).error.code,
  ).toBe('wrong_origin')

  const upgrade = await send('GET', '/api/churches/church_demo/live', {
    Upgrade: 'websocket',
    Origin: 'https://evil.test',
  })
  expect(upgrade.status).toBe(403)

  const people = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM people WHERE first_name = 'Origin' AND last_name = 'Check'",
  ).first<{ total: number }>()
  expect(people?.total).toBe(0)
})

it('accepts Access-authenticated writes from the instance or with no Origin', async () => {
  expect(
    (await send('POST', '/api/people/church_demo', { Origin: instance }))
      .status,
  ).toBe(201)
  expect((await send('POST', '/api/people/church_demo')).status).toBe(201)
  // Reads are not state-changing and stay available to any caller Access admits.
  expect(
    (
      await send('GET', '/api/people/church_demo', {
        Origin: 'https://evil.test',
      })
    ).status,
  ).toBe(200)
})
