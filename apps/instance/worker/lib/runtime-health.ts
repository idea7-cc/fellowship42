import {
  INSTANCE_TOPOLOGY,
  instanceRuntimeHealthSchema,
  type InstanceRuntimeHealth,
} from '@fellowship42/management-protocol'
import { inspectBootstrapReadiness } from '../routes/bootstrap'

export async function inspectInstanceRuntimeHealth(
  env: Env,
): Promise<InstanceRuntimeHealth> {
  const ready = await env.DB.prepare('SELECT 1 AS ready').first<{
    ready: number
  }>()
  if (ready?.ready !== 1) throw new Error('D1 readiness check failed')

  const outbox = await env.DB.prepare(
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
  const paymentEnv = env as Env & { PAYMENT_WEBHOOK_SECRET?: string }
  const bootstrapEnv = env as Env & { BOOTSTRAP_OWNER_EMAIL?: string }
  const bootstrap = await inspectBootstrapReadiness(
    env.DB,
    env.F42_PORTABLE_INSTANCE_ID,
    bootstrapEnv.BOOTSTRAP_OWNER_EMAIL,
  )
  const identityDegraded = [
    'configuration-invalid',
    'identity-mismatch',
  ].includes(bootstrap.state)

  return instanceRuntimeHealthSchema.parse({
    status:
      outboxStatus === 'stalled' || identityDegraded ? 'degraded' : 'ok',
    service: 'fellowship42-instance',
    topology: INSTANCE_TOPOLOGY,
    storage: 'd1',
    outbox: outboxStatus,
    paymentWebhooks:
      env.PAYMENT_WEBHOOK_PROVIDER.trim() &&
      (paymentEnv.PAYMENT_WEBHOOK_SECRET?.trim().length ?? 0) >= 32
        ? 'ready'
        : 'unconfigured',
    bootstrap,
  })
}
