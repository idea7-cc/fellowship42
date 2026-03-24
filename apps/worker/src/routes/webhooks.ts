import { Hono } from 'hono'

type Env = {
  Bindings: {
    CONVEX_URL: string
    CLERK_WEBHOOK_SECRET?: string
    STRIPE_WEBHOOK_SECRET?: string
  }
}

export const webhookRoutes = new Hono<Env>()

// POST /api/webhooks/clerk - Clerk auth webhooks
webhookRoutes.post('/clerk', async (c) => {
  // TODO: Verify Clerk webhook signature
  // TODO: Handle user.created, user.updated, user.deleted events
  // TODO: Sync user data to Convex
  const body = await c.req.json()
  console.log('Clerk webhook received:', body.type)

  return c.json({ received: true })
})

// POST /api/webhooks/stripe - Stripe payment webhooks
webhookRoutes.post('/stripe', async (c) => {
  // TODO: Verify Stripe webhook signature
  // TODO: Handle payment_intent.succeeded, etc.
  // TODO: Record contributions in Convex
  const body = await c.req.json()
  console.log('Stripe webhook received:', body.type)

  return c.json({ received: true })
})
