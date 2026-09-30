import { normalizeInstanceOrigin } from '@fellowship42/website-contract'

/** The church website's origin when one is configured for this installation. */
export function websiteOrigin(env: Env): string | null {
  return normalizeInstanceOrigin(env.WEBSITE_ORIGIN)
}
