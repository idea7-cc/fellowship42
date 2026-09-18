import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import worker from '../worker'
import {
  digest,
  token,
  cookieName,
  resolveLocalIdentity,
  type SignInEnv,
} from '../worker/features/sign-in/session'

const origin = 'https://example.test'
const bootstrapToken = 'A'.repeat(43)
let memberId: string, userId: string, email: string, ownerCookie: string
const bindings = {
  ...env,
  BOOTSTRAP_OWNER_EMAIL: 'first-local@example.test',
  BOOTSTRAP_ENROLLMENT_TOKEN: bootstrapToken,
  AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
} as SignInEnv
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
const from64 = (value: string) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (v) =>
    v.charCodeAt(0),
  )
const join = (...values: Uint8Array[]) => {
  const out = new Uint8Array(values.reduce((n, v) => n + v.length, 0))
  let i = 0
  for (const v of values) {
    out.set(v, i)
    i += v.length
  }
  return out
}
const hash = async (value: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value)))
const text = (value: string) => new TextEncoder().encode(value)
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .filter((v) => !v.includes('Max-Age=0'))
    .map((v) => v.split(';')[0])
    .join('; ')
}
async function request(
  path: string,
  body?: unknown,
  session = '',
  requestOrigin: string | undefined = origin,
) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(
    new Request(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(session ? { cookie: session } : {}),
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) as Request<unknown, IncomingRequestCfProperties>,
    bindings,
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

beforeEach(async () => {
  userId = crypto.randomUUID()
  memberId = crypto.randomUUID()
  email = `${userId}@example.test`
  const session = token()
  ownerCookie = `${cookieName(new URL(origin), 'session')}=${session}`
  await env.DB.batch([
    env.DB.prepare('DELETE FROM local_auth_sessions'),
    env.DB.prepare('DELETE FROM local_auth_challenges'),
    env.DB.prepare('DELETE FROM local_auth_enrollments'),
    env.DB.prepare('DELETE FROM local_auth_passkeys'),
    env.DB.prepare(
      "UPDATE users SET status='active' WHERE id='user_demo_owner'",
    ),
    env.DB.prepare(
      "UPDATE church_memberships SET status='active' WHERE user_id='user_demo_owner'",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO auth_identities (id,user_id,provider,subject,created_at,updated_at) VALUES ('local-owner','user_demo_owner','passkey','user_demo_owner',1,1)",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO instance_metadata (singleton,instance_id,topology,primary_church_id,created_at,updated_at) VALUES (1,'instance_42424242-1234-5678-9abc-123456789abc','single-church','church_demo',1,1)",
    ),
    env.DB.prepare(
      "INSERT INTO users (id,email,status,created_at,updated_at) VALUES (?,?,'invited',1,1)",
    ).bind(userId, email),
    env.DB.prepare(
      "INSERT INTO church_memberships (id,church_id,user_id,status,created_at,updated_at) VALUES (?,'church_demo',?,'active',1,1)",
    ).bind(memberId, userId),
    env.DB.prepare('INSERT INTO local_auth_sessions VALUES (?,?,?)').bind(
      await digest(session),
      'user_demo_owner',
      Date.now() + 60_000,
    ),
  ])
})
async function invite() {
  const response = await request(
    `/api/auth/invitations/church_demo/${memberId}`,
    { version: 1 },
    ownerCookie,
  )
  expect(response.status).toBe(200)
  const body = (await response.json()) as { url: string }
  return new URLSearchParams(new URL(body.url).hash.slice(1)).get('enroll')!
}
async function authenticator() {
  const keys = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const id = crypto.getRandomValues(new Uint8Array(32))
  const publicKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 3],
      [3, -257],
      [-1, from64(jwk.n!)],
      [-2, from64(jwk.e!)],
    ]),
  )
  return {
    async register(options: PublicKeyCredentialCreationOptionsJSON, uv = true) {
      const authData = join(
        await hash(text('example.test')),
        new Uint8Array([uv ? 0x45 : 0x41, 0, 0, 0, 0]),
        new Uint8Array(16),
        new Uint8Array([0, id.length]),
        id,
        publicKey,
      )
      const att = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, string>>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      )
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(
            text(
              JSON.stringify({
                type: 'webauthn.create',
                challenge: options.challenge,
                origin,
                crossOrigin: false,
              }),
            ),
          ),
          attestationObject: b64(att),
          transports: ['internal'],
        },
      }
    },
    async login(
      options: PublicKeyCredentialRequestOptionsJSON,
      handle: string,
      counter = 1,
      wrongOrigin = origin,
    ) {
      const client = text(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: options.challenge,
          origin: wrongOrigin,
          crossOrigin: false,
        }),
      )
      const data = join(
        await hash(text('example.test')),
        new Uint8Array([5, 0, 0, 0, counter]),
      )
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keys.privateKey,
        join(data, await hash(client)),
      )
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(client),
          authenticatorData: b64(data),
          signature: b64(new Uint8Array(signature)),
          userHandle: handle,
        },
      }
    },
  }
}
async function enroll(value: string, bootstrap = false) {
  const start = await request('/api/auth/enroll/start', {
    token: value,
    bootstrap,
  })
  expect(start.status).toBe(200)
  const options = (await start.json()) as PublicKeyCredentialCreationOptionsJSON
  const device = await authenticator()
  const body = await device.register(options)
  const response = await request(
    '/api/auth/enroll/finish',
    body,
    cookies(start),
  )
  return {
    device,
    response,
    handle: options.user.id,
    body,
    challengeCookie: cookies(start),
  }
}
it('enrolls an invited staff account and verifies real WebAuthn signatures, session and logout', async () => {
  const value = await invite()
  const { device, response, handle, body, challengeCookie } =
    await enroll(value)
  expect(response.status).toBe(200)
  expect(response.headers.get('set-cookie')).toContain(
    'HttpOnly; SameSite=Strict',
  )
  const session = cookies(response)
  expect(
    (
      (await (await request('/api/session', undefined, session)).json()) as {
        user: { id: string }
      }
    ).user.id,
  ).toBe(userId)
  expect(
    (await request('/api/auth/enroll/finish', body, challengeCookie)).status,
  ).toBe(400)
  expect(
    (await request('/api/auth/enroll/start', { token: value })).status,
  ).toBe(400)
  const start = await request('/api/auth/start', {})
  const options = (await start.json()) as PublicKeyCredentialRequestOptionsJSON
  const signed = await device.login(options, handle)
  const results = await Promise.all([
    request('/api/auth/finish', signed, cookies(start)),
    request('/api/auth/finish', signed, cookies(start)),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 400])
  const signedIn = cookies(results.find((r) => r.status === 200)!)
  expect((await request('/api/auth/logout', {}, signedIn)).status).toBe(200)
  expect(
    await (await request('/api/session', undefined, signedIn)).json(),
  ).toEqual({ user: null })
  const stored = await env.DB.prepare(
    'SELECT token_hash FROM local_auth_sessions WHERE user_id=?',
  )
    .bind(userId)
    .all<{ token_hash: string }>()
  expect(
    stored.results.every(
      (r) => r.token_hash.length === 64 && !session.includes(r.token_hash),
    ),
  ).toBe(true)
})
it('denies cross-origin cookie writes and expires or suspends sessions immediately', async () => {
  const { response } = await enroll(await invite())
  const session = cookies(response)
  expect(
    (
      await request(
        '/api/church-settings/church_demo/restore',
        { version: 1 },
        session,
        'https://evil.test',
      )
    ).status,
  ).toBe(403)
  await env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?")
    .bind(userId)
    .run()
  expect(
    await (await request('/api/session', undefined, session)).json(),
  ).toEqual({ user: null })
  await env.DB.prepare("UPDATE users SET status='active' WHERE id=?")
    .bind(userId)
    .run()
  await env.DB.prepare(
    'UPDATE local_auth_sessions SET expires_at=1 WHERE user_id=?',
  )
    .bind(userId)
    .run()
  expect(
    await resolveLocalIdentity(
      new Request(origin, { headers: { cookie: session } }),
      bindings,
    ),
  ).toBeNull()
})
it('rejects revoked invitations, stale issuing versions, and non-owner issuance without success audit', async () => {
  expect(
    (
      await request(
        `/api/auth/invitations/church_demo/${memberId}`,
        { version: 2 },
        ownerCookie,
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await request(`/api/auth/invitations/church_demo/${memberId}`, {
        version: 1,
      })
    ).status,
  ).toBe(401)
  const value = await invite()
  const start = await request('/api/auth/enroll/start', { token: value })
  const options = (await start.json()) as PublicKeyCredentialCreationOptionsJSON
  const device = await authenticator()
  await env.DB.prepare(
    "UPDATE church_memberships SET status='suspended' WHERE id=?",
  )
    .bind(memberId)
    .run()
  expect(
    (
      await request(
        '/api/auth/enroll/finish',
        await device.register(options),
        cookies(start),
      )
    ).status,
  ).toBe(400)
  expect(
    await env.DB.prepare('SELECT 1 FROM local_auth_passkeys WHERE user_id=?')
      .bind(userId)
      .first(),
  ).toBeNull()
  expect(
    await env.DB.prepare(
      "SELECT 1 FROM audit_events WHERE action='auth.passkey_enrolled' AND entity_id=?",
    )
      .bind(userId)
      .first(),
  ).toBeNull()
})
it('requires user verification and rejects forged origin, signature and challenge', async () => {
  const value = await invite()
  const start = await request('/api/auth/enroll/start', { token: value })
  const device = await authenticator()
  expect(
    (
      await request(
        '/api/auth/enroll/finish',
        await device.register(
          (await start.json()) as PublicKeyCredentialCreationOptionsJSON,
          false,
        ),
        cookies(start),
      )
    ).status,
  ).toBe(400)
  const enrolled = await enroll(value)
  for (const mode of ['origin', 'signature', 'challenge']) {
    const start = await request('/api/auth/start', {})
    const options =
      (await start.json()) as PublicKeyCredentialRequestOptionsJSON
    if (mode === 'challenge') options.challenge = 'wrong'
    const body = await enrolled.device.login(
      options,
      enrolled.handle,
      1,
      mode === 'origin' ? 'https://evil.test' : origin,
    )
    if (mode === 'signature') body.response.signature = b64(new Uint8Array(256))
    expect(
      (await request('/api/auth/finish', body, cookies(start))).status,
    ).toBe(400)
  }
})
it('expires challenges, replaces enrollment links and rechecks the issuing owner', async () => {
  const old = await invite()
  const value = await invite()
  expect((await request('/api/auth/enroll/start', { token: old })).status).toBe(
    400,
  )
  const start = await request('/api/auth/enroll/start', { token: value })
  const options = (await start.json()) as PublicKeyCredentialCreationOptionsJSON
  const device = await authenticator()
  await env.DB.prepare('UPDATE local_auth_challenges SET expires_at=1').run()
  expect(
    (
      await request(
        '/api/auth/enroll/finish',
        await device.register(options),
        cookies(start),
      )
    ).status,
  ).toBe(400)
  await env.DB.prepare(
    "UPDATE church_memberships SET status='suspended' WHERE user_id='user_demo_owner'",
  ).run()
  expect(
    (await request('/api/auth/enroll/start', { token: value })).status,
  ).toBe(400)
})
it('requires a setup secret before first-owner enrollment and consumes it once', async () => {
  expect(
    (
      await request('/api/auth/enroll/start', {
        token: bootstrapToken,
        bootstrap: true,
      })
    ).status,
  ).toBe(400)
  await env.DB.prepare('DELETE FROM instance_metadata').run()
  expect(
    (
      await request('/api/auth/enroll/start', {
        token: 'B'.repeat(43),
        bootstrap: true,
      })
    ).status,
  ).toBe(400)
  const enrolled = await enroll(bootstrapToken, true)
  expect(enrolled.response.status).toBe(200)
  expect(
    (
      await request('/api/auth/enroll/start', {
        token: bootstrapToken,
        bootstrap: true,
      })
    ).status,
  ).toBe(400)
  const setup = await request(
    '/api/bootstrap',
    {
      name: 'Local Church',
      slug: 'local-church',
      timezone: 'America/New_York',
      locale: 'en-US',
      countryCode: 'US',
    },
    cookies(enrolled.response),
  )
  expect(setup.status).toBe(201)
})
