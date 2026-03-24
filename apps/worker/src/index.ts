import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { churchRoutes } from './routes/churches'
import { webhookRoutes } from './routes/webhooks'
import { healthRoutes } from './routes/health'

type Env = {
  Bindings: {
    CONVEX_URL: string
    CLERK_WEBHOOK_SECRET?: string
    STRIPE_WEBHOOK_SECRET?: string
  }
}

const app = new Hono<Env>()

// Middleware
app.use('*', logger())
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'https://app.fellowship42.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// Routes
app.route('/api/churches', churchRoutes)
app.route('/api/webhooks', webhookRoutes)
app.route('/', healthRoutes)

export default app
