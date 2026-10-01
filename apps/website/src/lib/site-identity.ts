import type { ChurchProfile } from '@fellowship42/website-contract'

/** The church identity shown in the header, hero, footer, and titles. */
export interface SiteIdentity {
  name: string
  tagline: string
  logo: { url: string; alt: string } | null
}

/** The EmDash site settings that can stand in for the church identity. */
export interface IdentitySettings {
  title?: string | null
  tagline?: string | null
  logo?: { url?: string | null; alt?: string | null } | null
}

export const DEFAULT_SITE_NAME = 'Our church'
export const DEFAULT_TITLE_SEPARATOR = ' — '

/**
 * Fellowship42 is authoritative for the church's name, tagline, and logo, so
 * renaming the church there renames the website. EmDash's own site title,
 * tagline, and logo are used only while church information is unavailable or
 * unpublished; they never override a connected church.
 */
export function siteIdentity(
  church: Pick<ChurchProfile, 'name' | 'tagline' | 'logo'> | null,
  settings: IdentitySettings | null | undefined,
): SiteIdentity {
  if (church) {
    const name = church.name.trim() || DEFAULT_SITE_NAME
    return {
      name,
      tagline: church.tagline.trim(),
      logo: church.logo
        ? { url: church.logo.url, alt: church.logo.alt || name }
        : null,
    }
  }
  const name = settings?.title?.trim() || DEFAULT_SITE_NAME
  const logoUrl = settings?.logo?.url
  return {
    name,
    tagline: settings?.tagline?.trim() ?? '',
    logo: logoUrl ? { url: logoUrl, alt: settings?.logo?.alt || name } : null,
  }
}

/**
 * The document title: the page's own title, then the site name. The home page
 * passes no page title. A page title that already names the site is used as
 * it is, so an SEO title such as "About Grace Church" is not suffixed again.
 */
export function composeTitle(
  pageTitle: string | null | undefined,
  siteName: string,
  separator: string | null | undefined = DEFAULT_TITLE_SEPARATOR,
) {
  const page = pageTitle?.trim()
  if (!page) return siteName
  if (page.toLowerCase().includes(siteName.toLowerCase())) return page
  return `${page}${separator || DEFAULT_TITLE_SEPARATOR}${siteName}`
}
