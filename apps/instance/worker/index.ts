import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { INSTANCE_TOPOLOGY } from '@fellowship42/management-protocol'
import { resolveAccessIdentity, type AccessIdentity } from './lib/auth'
import { AppError } from './lib/errors'
import {
  consumeOutbox,
  flushOutbox,
  recoverAndFlushOutbox,
  type OutboxQueueMessage,
} from './lib/outbox'
import { churchRoutes } from './routes/churches'
import { mediaManagementRoutes, mediaRoutes } from './routes/media'
import { peopleRoutes } from './routes/people'
import { householdRoutes } from './routes/households'
import { groupRoutes } from './routes/groups'
import { courseRoutes } from './routes/courses'
import { eventRoutes } from './routes/events'
import { sermonRoutes } from './routes/sermons'
import { sessionRoutes } from './routes/session'
import { bootstrapRoutes } from './routes/bootstrap'
import {
  contributionRoutes,
  paymentWebhookRoutes,
} from './routes/contributions'

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
const jsonBodyLimit = bodyLimit({ maxSize: 64 * 1024 })
const mediaBodyLimit = bodyLimit({ maxSize: 20 * 1024 * 1024 })
app.use('/api/*', (c, next) =>
  c.req.path.startsWith('/api/media/')
    ? mediaBodyLimit(c, next)
    : jsonBodyLimit(c, next),
)
app.use('/webhooks/*', jsonBodyLimit)

app.use('*', async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID()
  const startedAt = Date.now()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)
  c.set('identity', await resolveAccessIdentity(c.req.raw, c.env))

  await next()

  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
    c.res.status >= 200 &&
    c.res.status < 400
  ) {
    c.executionCtx.waitUntil(
      flushOutbox(c.env).catch(() => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'outbox.flush_failed',
            requestId,
          }),
        )
      }),
    )
  }

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
  const publicMessage =
    error instanceof HTTPException ? error.message : 'Internal server error'

  console.error(
    JSON.stringify({
      level: 'error',
      message: 'request.failed',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      code,
      errorName: error instanceof Error ? error.name : 'UnknownError',
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
  const outbox = await c.env.DB.prepare(
    `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN 1 ELSE 0 END), 0) AS queued,
        COALESCE(SUM(CASE
          WHEN status = 'processing' AND processing_started_at < ? THEN 1 ELSE 0
        END), 0) AS stalled
      FROM outbox_events
      WHERE status != 'delivered'
    `,
  )
    .bind(Date.now() - 5 * 60 * 1000)
    .first<{ failed: number; queued: number; stalled: number }>()
  const outboxStatus =
    (outbox?.failed ?? 0) > 0 || (outbox?.stalled ?? 0) > 0
      ? 'stalled'
      : (outbox?.queued ?? 0) > 0
        ? 'backlogged'
        : 'clear'
  const paymentEnv = c.env as Env & { PAYMENT_WEBHOOK_SECRET?: string }
  return c.json({
    status: outboxStatus === 'stalled' ? 'degraded' : 'ok',
    service: 'fellowship42-instance',
    topology: INSTANCE_TOPOLOGY,
    storage: 'd1',
    outbox: outboxStatus,
    paymentWebhooks:
      c.env.PAYMENT_WEBHOOK_PROVIDER.trim() &&
      (paymentEnv.PAYMENT_WEBHOOK_SECRET?.trim().length ?? 0) >= 32
        ? 'ready'
        : 'unconfigured',
  })
})

app.route('/api/session', sessionRoutes)
app.route('/api/bootstrap', bootstrapRoutes)
app.route('/api/churches', churchRoutes)
app.route('/api/people', peopleRoutes)
app.route('/api/households', householdRoutes)
app.route('/api/groups', groupRoutes)
app.route('/api/courses', courseRoutes)
app.route('/api/events', eventRoutes)
app.route('/api/sermons', sermonRoutes)
app.route('/api/media', mediaManagementRoutes)
app.route('/api/contributions', contributionRoutes)
app.route('/media', mediaRoutes)
app.route('/webhooks/payments', paymentWebhookRoutes)

app.all('/api/*', (c) => {
  throw new AppError(404, 'route_not_found', 'API route not found')
})

const worker = {
  fetch: app.fetch,
  queue(batch: MessageBatch<OutboxQueueMessage>, env: Env) {
    return consumeOutbox(batch, env)
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      recoverAndFlushOutbox(env).catch(() => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'outbox.scheduled_recovery_failed',
          }),
        )
      }),
    )
  },
} satisfies ExportedHandler<Env, OutboxQueueMessage>

export default worker
