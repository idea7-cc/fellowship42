import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { INSTANCE_TOPOLOGY } from '@fellowship42/management-protocol'
import { resolveAccessIdentity, type AccessIdentity } from './lib/auth'
import { AppError } from './lib/errors'
import { churchRoutes } from './routes/churches'
import { mediaRoutes } from './routes/media'
import { peopleRoutes } from './routes/people'
import { householdRoutes } from './routes/households'
import { sessionRoutes } from './routes/session'
import { bootstrapRoutes } from './routes/bootstrap'

export { ChurchRoom } from './realtime'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: AccessIdentity | null
    requestId: string
  }
}

const app = new Hono<AppEnv>()

app.use('*', secureHeaders())
app.use('/api/*', bodyLimit({ maxSize: 64 * 1024 }))

app.use('*', async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID()
  const startedAt = Date.now()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)
  c.set('identity', await resolveAccessIdentity(c.req.raw, c.env))

  await next()

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'request.completed',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    }),
  )
})

app.onError((error, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID()
  const status = error instanceof HTTPException ? error.status : 500
  const code = error instanceof AppError ? error.code : 'internal_error'
  const publicMessage = error instanceof HTTPException ? error.message : 'Internal server error'

  console.error(
    JSON.stringify({
      level: 'error',
      message: 'request.failed',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      code,
      error: error instanceof Error ? error.message : String(error),
    }),
  )

  return c.json(
    {
      error: {
        code,
        message: publicMessage,
        requestId,
      },
    },
    status,
  )
})

app.get('/api/health', async (c) => {
  await c.env.DB.prepare('SELECT 1 AS ready').first<{ ready: number }>()
  return c.json({
    status: 'ok',
    service: 'fellowship42-instance',
    topology: INSTANCE_TOPOLOGY,
    storage: 'd1',
  })
})

app.route('/api/session', sessionRoutes)
app.route('/api/bootstrap', bootstrapRoutes)
app.route('/api/churches', churchRoutes)
app.route('/api/people', peopleRoutes)
app.route('/api/households', householdRoutes)
app.route('/media', mediaRoutes)

app.all('/api/*', (c) => {
  throw new AppError(404, 'route_not_found', 'API route not found')
})

export default app
