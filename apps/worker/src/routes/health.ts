import { Hono } from 'hono'

export const healthRoutes = new Hono()

healthRoutes.get('/', (c) => {
  return c.json({
    name: 'Fellowship42 Edge Worker',
    status: 'healthy',
    version: '0.1.0',
  })
})

healthRoutes.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})
