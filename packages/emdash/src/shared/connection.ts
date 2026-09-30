import {
  createChurchSource,
  normalizeInstanceOrigin,
  type ChurchSource,
  type ContractFetch,
} from '@fellowship42/website-contract'

/** Plugin id for the trusted npm integration; routes mount under it. */
export const PLUGIN_ID = 'fellowship42'

/**
 * Deployment environment variables that pin the connection. When
 * `FELLOWSHIP42_URL` is set, plugin settings are ignored: the website's
 * deployment authority, not an editor, decides which church it shows.
 */
export const CONNECTION_ENV = {
  url: 'FELLOWSHIP42_URL',
  instance: 'FELLOWSHIP42_INSTANCE_SHA256',
  /** Optional Cloudflare service binding to the instance Worker. */
  binding: 'FELLOWSHIP42',
} as const

/** Plugin settings used when the deployment does not pin the connection. */
export const CONNECTION_SETTINGS = {
  url: 'instanceUrl',
  instance: 'instanceSha256',
} as const

export interface ConnectionConfig {
  url: string | null
  expectedInstanceSha256: string | null
  /** True when the deployment environment decides the connection. */
  pinned: boolean
}

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

export function resolveConnectionConfig(
  env: Record<string, string | undefined>,
  settings: Record<string, unknown>,
): ConnectionConfig {
  const pinnedUrl = text(env[CONNECTION_ENV.url])
  if (pinnedUrl)
    return {
      url: pinnedUrl,
      expectedInstanceSha256: text(env[CONNECTION_ENV.instance]),
      pinned: true,
    }
  return {
    url: text(settings[CONNECTION_SETTINGS.url]),
    expectedInstanceSha256: text(settings[CONNECTION_SETTINGS.instance]),
    pinned: false,
  }
}

/** Environment strings from `process.env` where the runtime provides it. */
export function processEnv(): Record<string, string | undefined> {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env
  return env ?? {}
}

export function sourceFor(
  config: ConnectionConfig,
  fetch: ContractFetch,
): ChurchSource {
  return createChurchSource({
    url: config.url,
    expectedInstanceSha256: config.expectedInstanceSha256,
    fetch,
  })
}

export function describeConnection(config: ConnectionConfig) {
  return {
    origin: normalizeInstanceOrigin(config.url),
    pinned: config.pinned,
    identityPinned: Boolean(config.expectedInstanceSha256),
  }
}
