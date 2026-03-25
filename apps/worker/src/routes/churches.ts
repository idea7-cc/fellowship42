import { Context, Hono } from 'hono'

import { convexQuery } from '@/lib/convex'

type Env = {
  Bindings: {
    CONVEX_URL: string
  }
}

type ChurchRecord = {
  _id: string
  slug: string
}

export const churchRoutes = new Hono<Env>()

function requireConvexUrl(c: Context<Env>): string {
  const convexUrl = c.env.CONVEX_URL?.trim()

  if (!convexUrl) {
    throw new Error('CONVEX_URL is not configured')
  }

  return convexUrl
}

async function getChurchBySlug(convexUrl: string, slug: string) {
  return convexQuery<ChurchRecord | null>(convexUrl, 'churches:getBySlug', {
    slug,
  })
}

// GET /api/churches - List published churches
churchRoutes.get('/', async (c) => {
  const convexUrl = requireConvexUrl(c)
  const churches = await convexQuery(convexUrl, 'churches:list')

  return c.json({
    churches,
  })
})

// GET /api/churches/:slug - Get church by slug
churchRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const convexUrl = requireConvexUrl(c)
  const church = await getChurchBySlug(convexUrl, slug)

  if (!church) {
    return c.json({ error: 'Church not found' }, 404)
  }

  return c.json({
    church,
  })
})

// GET /api/churches/:slug/ministries - List ministries
churchRoutes.get('/:slug/ministries', async (c) => {
  const slug = c.req.param('slug')
  const convexUrl = requireConvexUrl(c)
  const church = await getChurchBySlug(convexUrl, slug)

  if (!church) {
    return c.json({ error: 'Church not found' }, 404)
  }

  const ministries = await convexQuery(convexUrl, 'ministries:listByChurch', {
    churchId: church._id,
  })

  return c.json({
    ministries,
    churchSlug: slug,
  })
})

// GET /api/churches/:slug/groups - List groups
churchRoutes.get('/:slug/groups', async (c) => {
  const slug = c.req.param('slug')
  const convexUrl = requireConvexUrl(c)
  const church = await getChurchBySlug(convexUrl, slug)

  if (!church) {
    return c.json({ error: 'Church not found' }, 404)
  }

  const groups = await convexQuery(convexUrl, 'groups:listByChurch', {
    churchId: church._id,
  })

  return c.json({
    groups,
    churchSlug: slug,
  })
})

// GET /api/churches/:slug/events - List upcoming events
churchRoutes.get('/:slug/events', async (c) => {
  const slug = c.req.param('slug')
  const convexUrl = requireConvexUrl(c)
  const church = await getChurchBySlug(convexUrl, slug)

  if (!church) {
    return c.json({ error: 'Church not found' }, 404)
  }

  const events = await convexQuery(convexUrl, 'events:listByChurch', {
    churchId: church._id,
  })

  return c.json({
    events,
    churchSlug: slug,
  })
})

// GET /api/churches/:slug/sermons - List recent sermons
churchRoutes.get('/:slug/sermons', async (c) => {
  const slug = c.req.param('slug')
  const convexUrl = requireConvexUrl(c)
  const church = await getChurchBySlug(convexUrl, slug)

  if (!church) {
    return c.json({ error: 'Church not found' }, 404)
  }

  const sermons = await convexQuery(convexUrl, 'sermons:listByChurch', {
    churchId: church._id,
  })

  return c.json({
    sermons,
    churchSlug: slug,
  })
})
