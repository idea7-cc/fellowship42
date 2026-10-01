import {
  createChurchSource,
  normalizeInstanceOrigin,
  type ChurchSource,
  type ContractFetch,
  type SourceResult,
} from '@fellowship42/website-contract'
import { isPrivateHost } from './hosts'

/** Plugin id for the trusted npm integration; routes mount under it. */
export const PLUGIN_ID = 'fellowship42'

/**
 * Deployment environment variables. The website's deployment authority, not
 * an editor, decides what they pin:
 *
 * - `FELLOWSHIP42_URL` pins the address. Plugin settings are then not read.
 * - `FELLOWSHIP42_INSTANCE_SHA256` pins the church identity whenever it is
 *   set, even when the address comes from plugin settings.
 * - `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` lets an address from plugin
 *   settings name a local or private host (local evaluation only).
 * - The `FELLOWSHIP42` service binding carries requests only for an address
 *   the deployment pins.
 */
export const CONNECTION_ENV = {
  url: 'FELLOWSHIP42_URL',
  instance: 'FELLOWSHIP42_INSTANCE_SHA256',
  allowPrivateHosts: 'FELLOWSHIP42_ALLOW_PRIVATE_HOSTS',
  /** Optional Cloudflare service binding to the instance Worker. */
  binding: 'FELLOWSHIP42',
} as const

/** Plugin settings used for whatever the deployment does not pin. */
export const CONNECTION_SETTINGS = {
  url: 'instanceUrl',
  instance: 'instanceSha256',
} as const

/** Why a connection is refused before any request is made. */
export type ConnectionIssue =
  'settings-unreadable' | 'private-host' | 'invalid-identity-pin'

export interface ConnectionConfig {
  url: string | null
  /** Lowercased identity pin as entered; see `issue` for a malformed one. */
  expectedInstanceSha256: string | null
  /** True when the deployment pins the address (`FELLOWSHIP42_URL`). */
  pinned: boolean
  /** Who set the identity pin, when there is one. */
  identityPinnedBy: 'deployment' | 'settings' | null
  issue: ConnectionIssue | null
}

export interface ConnectionOptions {
  /** `astro dev`: an address from settings may name a private host. */
  development?: boolean
}

type Env = Record<string, string | undefined>

const SHA256 = /^[0-9a-f]{64}$/

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** Problems with a connection, worded for the Administrator. */
export const CONNECTION_ISSUE_MESSAGES: Record<ConnectionIssue, string> = {
  'settings-unreadable':
    'The website could not read its Fellowship42 connection settings. Church blocks show the unavailable notice until it can.',
  'private-host': `The Fellowship42 address in plugin settings is a local or private network address, which the website does not connect to. Enter the instance's public address. For local evaluation, the website deployment can set ${CONNECTION_ENV.allowPrivateHosts}=true or pin the address with ${CONNECTION_ENV.url}.`,
  'invalid-identity-pin':
    'The church identity must be the full 64-character digest. Visitors see the unavailable notice until it is corrected or cleared.',
}

function privateHostsAllowed(env: Env, options: ConnectionOptions) {
  return (
    options.development === true ||
    text(env[CONNECTION_ENV.allowPrivateHosts])?.toLowerCase() === 'true'
  )
}

/**
 * Resolves the connection from the deployment environment and the plugin
 * settings already read. The deployment's values win field by field.
 */
export function resolveConnectionConfig(
  env: Env,
  settings: Record<string, unknown>,
  options: ConnectionOptions = {},
): ConnectionConfig {
  const pinnedUrl = text(env[CONNECTION_ENV.url])
  const pinnedIdentity = text(env[CONNECTION_ENV.instance])
  const url = pinnedUrl ?? text(settings[CONNECTION_SETTINGS.url])
  // Settings are not consulted at all once the deployment pins the address.
  const settingsIdentity = pinnedUrl
    ? null
    : text(settings[CONNECTION_SETTINGS.instance])
  const expected = (pinnedIdentity ?? settingsIdentity)?.toLowerCase() ?? null
  const origin = normalizeInstanceOrigin(url)
  let issue: ConnectionIssue | null = null
  if (
    !pinnedUrl &&
    origin &&
    !privateHostsAllowed(env, options) &&
    isPrivateHost(new URL(origin).hostname)
  )
    issue = 'private-host'
  else if (expected !== null && !SHA256.test(expected))
    issue = 'invalid-identity-pin'
  return {
    url,
    expectedInstanceSha256: expected,
    pinned: Boolean(pinnedUrl),
    identityPinnedBy: pinnedIdentity
      ? 'deployment'
      : settingsIdentity
        ? 'settings'
        : null,
    issue,
  }
}

/**
 * Reads plugin settings only for what the deployment leaves open, then
 * resolves the connection. A failed read becomes the `settings-unreadable`
 * issue and a log line; it never throws into a page render.
 */
export async function readConnectionConfig(
  env: Env,
  readSetting: (key: string) => Promise<unknown>,
  options: ConnectionOptions = {},
): Promise<ConnectionConfig> {
  if (text(env[CONNECTION_ENV.url]))
    return resolveConnectionConfig(env, {}, options)
  const identityPinned = Boolean(text(env[CONNECTION_ENV.instance]))
  try {
    const [url, instance] = await Promise.all([
      readSetting(CONNECTION_SETTINGS.url),
      identityPinned ? null : readSetting(CONNECTION_SETTINGS.instance),
    ])
    return resolveConnectionConfig(
      env,
      {
        [CONNECTION_SETTINGS.url]: url,
        [CONNECTION_SETTINGS.instance]: instance,
      },
      options,
    )
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message: 'fellowship42.settings_unreadable',
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          200,
        ),
      }),
    )
    return {
      ...resolveConnectionConfig(env, {}, options),
      issue: 'settings-unreadable',
    }
  }
}

/** Environment strings from `process.env` where the runtime provides it. */
export function processEnv(): Env {
  const env = (globalThis as { process?: { env?: Env } }).process?.env
  return env ?? {}
}

/**
 * The church source for a connection. A connection with an issue makes no
 * request: every read answers `unavailable`, so visitors see the
 * unavailable notice, and the status page names the issue.
 */
export function sourceFor(
  config: ConnectionConfig,
  fetch: ContractFetch,
): ChurchSource {
  if (config.issue) {
    const message = CONNECTION_ISSUE_MESSAGES[config.issue]
    const refuse = <T>(): Promise<SourceResult<T>> =>
      Promise.resolve({ ok: false, state: 'unavailable', message })
    return { origin: null, describe: refuse, church: refuse, list: refuse }
  }
  return createChurchSource({
    url: config.url,
    expectedInstanceSha256: config.expectedInstanceSha256,
    fetch,
  })
}
