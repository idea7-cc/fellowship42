import {
  processEnv,
  readConnectionConfig,
  type ConnectionConfig,
} from './shared/connection'

/**
 * `astro dev`. Vite replaces `import.meta.env` when it builds the site; where
 * nothing replaced it, this is a production runtime.
 */
export function astroDevelopment(): boolean {
  try {
    return (
      (import.meta as unknown as { env: { DEV?: unknown } }).env.DEV === true
    )
  } catch {
    return false
  }
}

/** The trusted plugin's connection: deployment environment, then settings. */
export function loadConnection(
  readSetting: (key: string) => Promise<unknown>,
): Promise<ConnectionConfig> {
  return readConnectionConfig(processEnv(), readSetting, {
    development: astroDevelopment(),
  })
}
