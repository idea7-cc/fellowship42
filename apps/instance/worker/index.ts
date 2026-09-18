import { signInRoutes } from './features/sign-in/routes'
import {
  resolveLocalIdentity,
  cleanSignInState,
  signInOrigin,
} from './features/sign-in/session'
import { agentRoutes } from './features/agents/routes'
import { agentFetch } from './features/agents/oauth'
import { Hono } from 'hono'
import { churchSettingsRoutes, siteRoutes } from './features/church/routes'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
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
import { managementRoutes } from './routes/management'
import { teamRoutes } from './routes/team'
import { runScheduledManagementSync } from './management/sync'
import { inspectInstanceRuntimeHealth } from './lib/runtime-health'

export { ChurchRoom } from './realtime'

type AppEnv = {
  Bindings: Env
  Variables: {
    identity: AccessIdentity | null
    requestId: string
  }
}

const app = new Hono<AppEnv>()

const secureHttpHeaders = secureHeaders()
const isWebSocket = (request: Request) =>
  request.headers.get('Upgrade')?.toLowerCase() === 'websocket' &&
  /^\/api\/churches\/[^/]+\/live$/.test(new URL(request.url).pathname)
// Upgrade responses carry an immutable WebSocket handshake. HTTP header
// middleware must not reconstruct or mutate it; authorization still runs.
app.use('*', (c, next) =>
  isWebSocket(c.req.raw) ? next() : secureHttpHeaders(c, next),
)
app.use('/api/*', async (c, next) => {
  if (!isWebSocket(c.req.raw)) c.header('Cache-Control', 'private, no-store')
  await next()
})
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
  if (!isWebSocket(c.req.raw)) c.header('X-Request-Id', requestId)
  const identity =
    (await resolveLocalIdentity(c.req.raw, c.env)) ??
    (await resolveAccessIdentity(c.req.raw, c.env))
  c.set('identity', identity)
  if (
    identity?.provider === 'passkey' &&
    c.req.path.startsWith('/api/') &&
    (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) ||
      c.req.header('Upgrade')?.toLowerCase() === 'websocket') &&
    c.req.header('Origin') !== signInOrigin(c.env).origin
  ) {
    throw new AppError(403, 'wrong_origin', 'Reload this page and try again.')
  }

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
  return c.json(await inspectInstanceRuntimeHealth(c.env))
})

app.get('/oauth/authorize', (c) =>
  c.redirect(`/app/agents/authorize${new URL(c.req.url).search}`),
)
app.route('/api/auth', signInRoutes)
app.route('/api/agents', agentRoutes)
app.route('/api/site', siteRoutes)
app.route('/api/church-settings', churchSettingsRoutes)
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
app.route('/api/management', managementRoutes)
app.route('/api/team', teamRoutes)
app.route('/media', mediaRoutes)
app.route('/webhooks/payments', paymentWebhookRoutes)

app.all('/api/*', (_c) => {
  throw new AppError(404, 'route_not_found', 'API route not found')
})

const worker = {
  fetch: (request, env, ctx) => agentFetch(request, env, ctx, app.fetch),
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
    ctx.waitUntil(runScheduledManagementSync(env))
    ctx.waitUntil(
      cleanSignInState(env.DB).catch(() => {
        console.error(
          JSON.stringify({ level: 'error', message: 'auth.cleanup_failed' }),
        )
      }),
    )
  },
} satisfies ExportedHandler<Env, OutboxQueueMessage>

export default worker
