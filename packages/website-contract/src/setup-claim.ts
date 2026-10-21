/**
 * Website setup claims for a Fellowship42-generated installation.
 *
 * The instance mints a short-lived claim for a signed-in owner; the website it
 * installed accepts EmDash's first-administrator setup only from a browser
 * holding a valid claim. Both Workers share `WEBSITE_SETUP_SECRET`, which is
 * removed after setup. The claim authorizes nothing else.
 */

export const SETUP_CLAIM_PREFIX = 'f42ws1'
export const SETUP_CLAIM_TTL_SECONDS = 600
export const SETUP_SECRET_MIN_LENGTH = 32
const CLOCK_SKEW_SECONDS = 60

export interface SetupClaim {
  /** Website origin the claim is valid for. */
  aud: string
  /** Fellowship42 user who requested the claim. */
  sub: string
  iat: number
  exp: number
  nonce: string
}

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function fromBase64url(value: string) {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function key(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )
}

export function isUsableSetupSecret(secret: string | null | undefined) {
  return (secret?.trim().length ?? 0) >= SETUP_SECRET_MIN_LENGTH
}

function origin(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new TypeError('Setup claims require an http(s) website origin')
  return url.origin
}

export async function createSetupClaim(
  secret: string,
  input: {
    audience: string
    subject: string
    now?: number
    ttlSeconds?: number
  },
): Promise<{ token: string; claim: SetupClaim }> {
  if (!isUsableSetupSecret(secret))
    throw new TypeError('The website setup secret is too short')
  const iat = Math.floor((input.now ?? Date.now()) / 1000)
  const nonce = new Uint8Array(16)
  crypto.getRandomValues(nonce)
  const claim: SetupClaim = {
    aud: origin(input.audience),
    sub: input.subject,
    iat,
    exp:
      iat +
      Math.min(
        input.ttlSeconds ?? SETUP_CLAIM_TTL_SECONDS,
        SETUP_CLAIM_TTL_SECONDS,
      ),
    nonce: base64url(nonce),
  }
  const body = `${SETUP_CLAIM_PREFIX}.${base64url(encoder.encode(JSON.stringify(claim)))}`
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await key(secret.trim(), 'sign'),
      encoder.encode(body),
    ),
  )
  return { token: `${body}.${base64url(signature)}`, claim }
}

/** Returns the claim when the token is authentic, current, and for `audience`. */
export async function verifySetupClaim(
  secret: string | null | undefined,
  token: string | null | undefined,
  input: { audience: string; now?: number },
): Promise<SetupClaim | null> {
  if (!isUsableSetupSecret(secret) || !token || token.length > 1_024)
    return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== SETUP_CLAIM_PREFIX) return null
  const [prefix, payload, signature] = parts as [string, string, string]
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature))
    return null
  let valid = false
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret!.trim(), 'verify'),
      fromBase64url(signature),
      encoder.encode(`${prefix}.${payload}`),
    )
  } catch {
    return null
  }
  if (!valid) return null
  let claim: SetupClaim
  try {
    claim = JSON.parse(
      new TextDecoder().decode(fromBase64url(payload)),
    ) as SetupClaim
  } catch {
    return null
  }
  const now = Math.floor((input.now ?? Date.now()) / 1000)
  let audience: string
  try {
    audience = origin(input.audience)
  } catch {
    return null
  }
  if (
    typeof claim !== 'object' ||
    claim === null ||
    claim.aud !== audience ||
    typeof claim.sub !== 'string' ||
    !Number.isInteger(claim.iat) ||
    !Number.isInteger(claim.exp) ||
    claim.iat > now + CLOCK_SKEW_SECONDS ||
    claim.exp <= now ||
    claim.exp - claim.iat > SETUP_CLAIM_TTL_SECONDS
  )
    return null
  return claim
}
