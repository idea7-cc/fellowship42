import type { AccessIdentity } from '../../lib/auth'
import { AppError } from '../../lib/errors'

export type SignInEnv = Env & {
  BOOTSTRAP_OWNER_EMAIL?: string
  BOOTSTRAP_ENROLLMENT_TOKEN?: string
}
export const SESSION_SECONDS = 12 * 60 * 60
export const CHALLENGE_SECONDS = 5 * 60
export const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export function signInOrigin(env: Pick<SignInEnv, 'SIGN_IN_ORIGIN'>) {
  try {
    const url = new URL(env.SIGN_IN_ORIGIN)
    if (
      url.origin !== env.SIGN_IN_ORIGIN ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && url.hostname === 'localhost'))
    )
      throw new Error()
    return url
  } catch {
    throw new AppError(
      503,
      'sign_in_not_configured',
      'Sign-in is not configured.',
    )
  }
}
export function cookieName(origin: URL, kind: 'session' | 'challenge') {
  return `${origin.protocol === 'https:' ? '__Host-' : ''}f42-${kind}`
}
export function readCookie(request: Request, name: string) {
  const values = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`))
  // Duplicate cookies must not pick an attacker-controlled sibling value.
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined
}
export function cookie(
  origin: URL,
  kind: 'session' | 'challenge',
  value: string,
  maxAge: number,
) {
  return `${cookieName(origin, kind)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.protocol === 'https:' ? '; Secure' : ''}`
}
export async function resolveLocalIdentity(
  request: Request,
  env: SignInEnv,
): Promise<AccessIdentity | null> {
  if (!env.SIGN_IN_ORIGIN) return null
  const origin = signInOrigin(env)
  if (new URL(request.url).origin !== origin.origin) return null
  const session = readCookie(request, cookieName(origin, 'session'))
  if (!session || !/^[A-Za-z0-9_-]{43}$/.test(session)) return null
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name FROM local_auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`,
  )
    .bind(await digest(session), Date.now())
    .first<{
      id: string
      email: string
      first_name: string
      last_name: string
    }>()
  if (!row) return null
  return {
    provider: 'passkey',
    subject: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
  }
}
export async function cleanSignInState(db: D1Database) {
  const now = Date.now()
  await db.batch([
    db
      .prepare('DELETE FROM local_auth_challenges WHERE expires_at < ?')
      .bind(now),
    db
      .prepare('DELETE FROM local_auth_sessions WHERE expires_at < ?')
      .bind(now),
    // Keep the consumed bootstrap marker so the setup secret can never reopen enrollment.
    db
      .prepare(
        "DELETE FROM local_auth_enrollments WHERE id <> 'bootstrap' AND expires_at < ?",
      )
      .bind(now),
  ])
}
