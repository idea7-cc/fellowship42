import { Hono } from 'hono'

type Env = {
  Bindings: {
    CONVEX_URL: string
    CLERK_WEBHOOK_SECRET?: string
    STRIPE_WEBHOOK_SECRET?: string
  }
}

export const webhookRoutes = new Hono<Env>()

function notImplemented(provider: 'Clerk' | 'Stripe') {
  return {
    error: `${provider} webhook handling is not implemented in this worker yet`,
  }
}

// POST /api/webhooks/clerk - Clerk auth webhooks
webhookRoutes.post('/clerk', async (c) => {
  return c.json(notImplemented('Clerk'), 501)
})

// POST /api/webhooks/stripe - Stripe payment webhooks
webhookRoutes.post('/stripe', async (c) => {
  return c.json(notImplemented('Stripe'), 501)
})
