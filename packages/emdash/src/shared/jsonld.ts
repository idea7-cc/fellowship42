import type { ChurchProfile } from '@fellowship42/website-contract'

/** schema.org structured data for the church, for the site's home page. */
export function churchJsonLd(church: ChurchProfile, siteUrl: string) {
  const address = church.address
  const graph: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Church',
    name: church.name,
    url: siteUrl,
  }
  if (church.summary) graph.description = church.summary.slice(0, 500)
  if (address.street || address.city)
    graph.address = {
      '@type': 'PostalAddress',
      streetAddress: address.street || undefined,
      addressLocality: address.city || undefined,
      addressRegion: address.region || undefined,
      postalCode: address.postalCode || undefined,
      addressCountry: address.countryCode || undefined,
    }
  if (church.contact.phone) graph.telephone = church.contact.phone
  if (church.contact.email) graph.email = church.contact.email
  if (church.logo) graph.logo = church.logo.url
  if (church.cover) graph.image = church.cover.url
  return graph
}

/** The metadata contribution: only the home page, only while published. */
export function isHomePage(path: string) {
  return path === '/' || path === ''
}
