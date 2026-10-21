import type { DeploymentManifest } from '@fellowship42/management-protocol'

export interface WebsiteOrigins {
  /** `EMDASH_SITE_URL`, the instance's `WEBSITE_ORIGIN`, and the setup-claim audience. */
  website: string
  /** `FELLOWSHIP42_URL`, the instance origin the website connects to. */
  instance: string
}

/**
 * The canonical public origins of an installation with a website: the first
 * declared domain of each Worker. The website's setup gate accepts only
 * claims whose audience is `EMDASH_SITE_URL`, and the instance mints them for
 * `WEBSITE_ORIGIN`, so both name this one website origin. Returns null for an
 * instance-only manifest. Worker-safe: no Node built-ins.
 */
export function websiteOriginsFor(
  manifest: DeploymentManifest,
): WebsiteOrigins | null {
  if (!manifest.website) return null
  const [website] = manifest.website.worker.domains
  const [instance] = manifest.worker.domains
  // The manifest schema requires both whenever a website is declared.
  if (!website || !instance) {
    throw new Error('A website requires website and instance domains')
  }
  return { website: `https://${website}`, instance: `https://${instance}` }
}
