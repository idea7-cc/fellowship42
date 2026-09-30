import { Hono, type Context } from 'hono'
import {
  DEFAULT_PAGE_LIMIT,
  LIST_RESOURCES,
  MAX_PAGE_LIMIT,
  type ChurchResponse,
  type ContractEnvelope,
  type ContractErrorResponse,
  type ListResource,
  type PageResponse,
  type WebsiteDescriptor,
} from '@fellowship42/website-contract'
import type { AccessIdentity } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import {
  readWebsiteChurch,
  readWebsiteList,
  readWebsiteSite,
  type WebsiteSite,
} from './read'

type AppEnv = {
  Bindings: Env
  Variables: { identity: AccessIdentity | null; requestId: string }
}

/**
 * Public website contract v1. Anonymous, identity-independent, published-only.
 * Responses are never cached so a withdrawal is visible on the next request,
 * and any origin may read them because they carry no credentials.
 */
export const websiteContractRoutes = new Hono<AppEnv>()

websiteContractRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Accept')
  c.header('Access-Control-Max-Age', '86400')
})

websiteContractRoutes.options('*', (c) => c.body(null, 204))

function contractError(
  c: Context<AppEnv>,
  envelope: ContractEnvelope,
  status: 400 | 404,
  code: string,
  message: string,
) {
  const body: ContractErrorResponse = { ...envelope, error: { code, message } }
  return c.json(body, status)
}

const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin

async function publishedSite(c: Context<AppEnv>) {
  const site = await readWebsiteSite(c.env)
  return site
}

function unpublished(c: Context<AppEnv>, site: WebsiteSite) {
  return contractError(
    c,
    site.envelope,
    404,
    'site_unpublished',
    'This church website is not published',
  )
}

websiteContractRoutes.get('/', async (c) => {
  const site = await publishedSite(c)
  const body: WebsiteDescriptor = {
    ...site.envelope,
    site: { status: site.published ? 'published' : 'unpublished' },
    church: site.church,
    origin: origin(c),
  }
  return c.json(body)
})

websiteContractRoutes.get('/church', async (c) => {
  const site = await publishedSite(c)
  if (!site.published || !site.churchId) return unpublished(c, site)
  try {
    const body: ChurchResponse = {
      ...site.envelope,
      church: await readWebsiteChurch(c.env.DB, site.churchId, origin(c)),
    }
    return c.json(body)
  } catch (error) {
    // Unpublished between the two reads.
    if (error instanceof AppError && error.code === 'site_unpublished')
      return unpublished(c, site)
    throw error
  }
})

function parseLimit(value: string | undefined) {
  if (value === undefined) return DEFAULT_PAGE_LIMIT
  if (!/^\d{1,3}$/.test(value)) return null
  const limit = Number(value)
  return limit >= 1 && limit <= MAX_PAGE_LIMIT ? limit : null
}

for (const resource of LIST_RESOURCES) {
  websiteContractRoutes.get(`/${resource}`, async (c) => {
    const site = await publishedSite(c)
    const limit = parseLimit(c.req.query('limit'))
    if (limit === null)
      return contractError(
        c,
        site.envelope,
        400,
        'invalid_limit',
        `Limit must be between 1 and ${MAX_PAGE_LIMIT}`,
      )
    if (!site.published || !site.churchId) return unpublished(c, site)
    try {
      const page = await readWebsiteList(c.env.DB, resource as ListResource, {
        churchId: site.churchId,
        origin: origin(c),
        cursor: c.req.query('cursor') ?? null,
        limit,
        now: Date.now(),
      })
      const body: PageResponse<unknown> = { ...site.envelope, ...page }
      return c.json(body)
    } catch (error) {
      if (error instanceof AppError && error.code === 'invalid_cursor')
        return contractError(
          c,
          site.envelope,
          400,
          'invalid_cursor',
          error.message,
        )
      throw error
    }
  })
}

websiteContractRoutes.all('*', async (c) => {
  const site = await publishedSite(c)
  return c.json(
    {
      ...site.envelope,
      error: { code: 'route_not_found', message: 'Contract route not found' },
    },
    404,
  )
})
