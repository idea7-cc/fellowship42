import { Hono } from 'hono'

type Env = {
  Bindings: {
    CONVEX_URL: string
  }
}

export const churchRoutes = new Hono<Env>()

// GET /api/churches - List published churches
churchRoutes.get('/', async (c) => {
  // TODO: Fetch from Convex HTTP API
  // const convexUrl = c.env.CONVEX_URL
  // const response = await fetch(`${convexUrl}/api/query`, { ... })
  return c.json({
    churches: [],
    message: 'Connect Convex to populate church data',
  })
})

// GET /api/churches/:slug - Get church by slug
churchRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  // TODO: Fetch from Convex HTTP API
  return c.json({
    church: null,
    slug,
    message: 'Connect Convex to populate church data',
  })
})

// GET /api/churches/:slug/ministries - List ministries
churchRoutes.get('/:slug/ministries', async (c) => {
  const slug = c.req.param('slug')
  return c.json({
    ministries: [],
    churchSlug: slug,
  })
})

// GET /api/churches/:slug/groups - List groups
churchRoutes.get('/:slug/groups', async (c) => {
  const slug = c.req.param('slug')
  return c.json({
    groups: [],
    churchSlug: slug,
  })
})

// GET /api/churches/:slug/events - List upcoming events
churchRoutes.get('/:slug/events', async (c) => {
  const slug = c.req.param('slug')
  return c.json({
    events: [],
    churchSlug: slug,
  })
})

// GET /api/churches/:slug/sermons - List recent sermons
churchRoutes.get('/:slug/sermons', async (c) => {
  const slug = c.req.param('slug')
  return c.json({
    sermons: [],
    churchSlug: slug,
  })
})
