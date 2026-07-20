import {
  deploymentManifestSchema,
  reconciliationAdapterResultSchema,
  reconciliationApprovalSchema,
  reconciliationObservationSetSchema,
  reconciliationPreviewSchema,
  reconciliationReportSchema,
  type DeployPlan,
  type DeploymentManifest,
  type ReconciliationAdapterResult,
  type ReconciliationObservationSet,
  type ReconciliationPreview,
  type ReconciliationReport,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'
import { buildDeployPlanWithDigest } from './plan-shape.js'

export interface DeploymentReconciliationAdapter {
  observe(input: {
    manifest: DeploymentManifest
    plan: DeployPlan
  }): Promise<unknown>
  apply(input: {
    operationId: string
    idempotencyKey: string
    instanceId: string
    accountAlias: string
    manifest: DeploymentManifest
    planStep: DeployPlan['steps'][number]
    step: ReconciliationPreview['changes'][number]
  }): Promise<unknown>
}

export class ReconciliationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ReconciliationError'
    this.code = code
  }
}

async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function sha256Canonical(value: unknown): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)))
}

function desiredStepState(
  manifest: DeploymentManifest,
  kind: DeployPlan['steps'][number]['kind'],
) {
  switch (kind) {
    case 'verify-release':
      return manifest.instance.release
    case 'ensure-d1':
      return manifest.resources.d1
    case 'ensure-r2':
      return manifest.resources.r2
    case 'ensure-outbox-queue':
      return {
        binding: manifest.resources.outboxQueue.binding,
        name: manifest.resources.outboxQueue.name,
      }
    case 'ensure-dead-letter-queue':
      return { name: manifest.resources.outboxQueue.deadLetterName }
    case 'configure-worker':
      return {
        workerName: manifest.worker.name,
        bindings: {
          d1: manifest.resources.d1.binding,
          r2: manifest.resources.r2.binding,
          outboxQueue: manifest.resources.outboxQueue.binding,
          durableObject: manifest.resources.durableObject,
        },
        schedules: manifest.resources.schedules,
        paymentWebhookProvider: manifest.configuration.paymentWebhookProvider,
      }
    case 'apply-migrations':
      return {
        d1: manifest.resources.d1.name,
        schemaVersion: manifest.instance.release.schemaVersion,
      }
    case 'deploy-worker':
      return {
        workerName: manifest.worker.name,
        release: manifest.instance.release,
      }
    case 'configure-domains':
      return {
        workerName: manifest.worker.name,
        domains: manifest.worker.domains,
      }
    case 'configure-access':
      return {
        workerName: manifest.worker.name,
        accessTeamDomain: manifest.configuration.accessTeamDomain,
        accessAudienceConfigured:
          manifest.configuration.accessAudienceConfigured,
      }
    case 'verify-runtime':
      return {
        instanceId: manifest.instance.id,
        topology: manifest.instance.topology,
        release: manifest.instance.release,
      }
  }
}

function actionFor(
  kind: DeployPlan['steps'][number]['kind'],
  state: ReconciliationObservationSet['steps'][number]['state'],
) {
  if (state === 'matching') return 'none' as const
  if (state === 'unknown') return 'blocked' as const
  if (kind === 'verify-release' || kind === 'verify-runtime') {
    return 'verify' as const
  }
  if (
    state === 'absent' &&
    [
      'ensure-d1',
      'ensure-r2',
      'ensure-outbox-queue',
      'ensure-dead-letter-queue',
      'configure-worker',
    ].includes(kind)
  ) {
    return 'create' as const
  }
  if (kind === 'apply-migrations' || kind === 'deploy-worker') {
    return 'execute' as const
  }
  return 'update' as const
}

function assertObservationBinding(
  manifest: DeploymentManifest,
  manifestSha256: string,
  observation: ReconciliationObservationSet,
) {
  if (
    observation.manifestSha256 !== manifestSha256 ||
    observation.instanceId !== manifest.instance.id ||
    observation.environment !== manifest.target.environment ||
    observation.accountAlias !== manifest.target.accountAlias
  ) {
    throw new ReconciliationError(
      'observation_binding_mismatch',
      'The provider observation does not match the desired deployment.',
    )
  }
}

export async function buildReconciliationPreview(
  manifestInput: unknown,
  observationInput: unknown,
): Promise<ReconciliationPreview> {
  const manifest = deploymentManifestSchema.parse(manifestInput)
  const manifestSha256 = await sha256Canonical(manifest)
  const plan = buildDeployPlanWithDigest(manifest, manifestSha256)
  const observation = reconciliationObservationSetSchema.parse(observationInput)
  assertObservationBinding(manifest, manifestSha256, observation)

  const changes = await Promise.all(
    plan.steps.map(async (step, index) => {
      const observed = observation.steps[index]!
      const desiredFingerprint = await sha256Canonical(
        desiredStepState(manifest, step.kind),
      )
      const ownershipBlocked = ['unverified', 'foreign'].includes(
        observed.ownership,
      ) || (
        observed.state !== 'absent' &&
        !['verify-release', 'apply-migrations', 'verify-runtime'].includes(
          step.kind,
        ) &&
        observed.ownership !== 'verified'
      )
      const inconsistentMatch =
        observed.state === 'matching' &&
        observed.actualFingerprint !== desiredFingerprint
      const action = ownershipBlocked || inconsistentMatch
        ? ('blocked' as const)
        : actionFor(step.kind, observed.state)
      const reasonCode = ownershipBlocked
        ? observed.ownership === 'not-applicable'
          ? 'ownership-unverified'
          : `ownership-${observed.ownership}`
        : inconsistentMatch
          ? 'observation-fingerprint-mismatch'
          : action === 'none'
            ? 'already-satisfied'
            : action === 'blocked'
              ? 'observation-unknown'
              : `${action}-required`
      return {
        stepId: step.id,
        kind: step.kind,
        action,
        desiredFingerprint,
        expectedActualFingerprint: observed.actualFingerprint,
        reasonCode,
        dependsOn: step.dependsOn,
        destructive: false as const,
      }
    }),
  )

  return reconciliationPreviewSchema.parse({
    formatVersion: 1,
    manifestSha256,
    instanceId: manifest.instance.id,
    environment: manifest.target.environment,
    accountAlias: manifest.target.accountAlias,
    observedAt: observation.observedAt,
    status: changes.some((change) => change.action === 'blocked')
      ? 'blocked'
      : 'ready',
    changes,
  })
}

export async function inspectDeploymentReconciliation(options: {
  manifest: unknown
  adapter: Pick<DeploymentReconciliationAdapter, 'observe'>
}): Promise<ReconciliationPreview> {
  const manifest = deploymentManifestSchema.parse(options.manifest)
  const manifestSha256 = await sha256Canonical(manifest)
  const plan = buildDeployPlanWithDigest(manifest, manifestSha256)
  let observation: unknown
  try {
    observation = await options.adapter.observe({ manifest, plan })
    reconciliationObservationSetSchema.parse(observation)
  } catch {
    throw new ReconciliationError(
      'adapter_observation_failed',
      'The provider observation could not be obtained or validated.',
    )
  }
  return buildReconciliationPreview(manifest, observation)
}

function allowedOutcome(
  action: ReconciliationPreview['changes'][number]['action'],
  status: ReconciliationAdapterResult['status'],
) {
  if (status === 'failed' || status === 'unchanged') return true
  return (
    (action === 'create' && status === 'created') ||
    (action === 'update' && status === 'updated') ||
    (action === 'execute' && status === 'executed') ||
    (action === 'verify' && status === 'verified')
  )
}

export async function executeDeploymentReconciliation(options: {
  manifest: unknown
  preview: unknown
  approval: unknown
  adapter: Pick<DeploymentReconciliationAdapter, 'apply'>
  operationId: string
  idempotencyKey: string
  now?: number
  clock?: () => string
}): Promise<ReconciliationReport> {
  const manifest = deploymentManifestSchema.parse(options.manifest)
  const preview = reconciliationPreviewSchema.parse(options.preview)
  const approval = reconciliationApprovalSchema.parse(options.approval)
  const now = options.now ?? Date.now()
  const clock = options.clock ?? (() => new Date().toISOString())
  if (
    !options.idempotencyKey ||
    options.idempotencyKey.length > 100 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(options.idempotencyKey)
  ) {
    throw new ReconciliationError(
      'invalid_idempotency_key',
      'A bounded idempotency key is required.',
    )
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      options.operationId,
    )
  ) {
    throw new ReconciliationError(
      'invalid_operation_id',
      'A UUID operation identifier is required.',
    )
  }
  if (preview.status !== 'ready') {
    throw new ReconciliationError(
      'reconciliation_blocked',
      'Blocked reconciliation cannot be applied.',
    )
  }
  const manifestSha256 = await sha256Canonical(manifest)
  const plan = buildDeployPlanWithDigest(manifest, manifestSha256)
  const previewSha256 = await sha256Canonical(preview)
  if (
    preview.manifestSha256 !== manifestSha256 ||
    preview.instanceId !== manifest.instance.id ||
    preview.environment !== manifest.target.environment ||
    preview.accountAlias !== manifest.target.accountAlias ||
    approval.previewSha256 !== previewSha256 ||
    approval.manifestSha256 !== manifestSha256 ||
    approval.instanceId !== manifest.instance.id ||
    approval.accountAlias !== manifest.target.accountAlias
  ) {
    throw new ReconciliationError(
      'approval_binding_mismatch',
      'The approval, preview, and desired deployment do not match.',
    )
  }
  for (const [index, change] of preview.changes.entries()) {
    const planStep = plan.steps[index]!
    const desiredFingerprint = await sha256Canonical(
      desiredStepState(manifest, planStep.kind),
    )
    const allowedActions: Record<
      DeployPlan['steps'][number]['kind'],
      ReconciliationPreview['changes'][number]['action'][]
    > = {
      'verify-release': ['none', 'verify'],
      'ensure-d1': ['none', 'create', 'update'],
      'ensure-r2': ['none', 'create', 'update'],
      'ensure-outbox-queue': ['none', 'create', 'update'],
      'ensure-dead-letter-queue': ['none', 'create', 'update'],
      'configure-worker': ['none', 'create', 'update'],
      'apply-migrations': ['none', 'execute'],
      'deploy-worker': ['none', 'execute'],
      'configure-domains': ['none', 'update'],
      'configure-access': ['none', 'update'],
      'verify-runtime': ['none', 'verify'],
    }
    if (
      change.kind !== planStep.kind ||
      change.desiredFingerprint !== desiredFingerprint ||
      JSON.stringify(change.dependsOn) !== JSON.stringify(planStep.dependsOn) ||
      !allowedActions[planStep.kind].includes(change.action) ||
      (change.action === 'none' &&
        change.expectedActualFingerprint !== desiredFingerprint) ||
      (change.action === 'create' &&
        change.expectedActualFingerprint !== null)
    ) {
      throw new ReconciliationError(
        'preview_plan_mismatch',
        'The approved preview does not match the deterministic lifecycle plan.',
      )
    }
  }
  if (
    Date.parse(approval.approvedAt) > now + 5 * 60_000 ||
    Date.parse(approval.expiresAt) <= now
  ) {
    throw new ReconciliationError(
      'approval_not_current',
      'The reconciliation approval is not current.',
    )
  }

  const startedAt = clock()
  const results: ReconciliationReport['steps'] = []
  for (const [index, change] of preview.changes.entries()) {
    if (change.action === 'none') {
      results.push({
        stepId: change.stepId,
        kind: change.kind,
        status: 'unchanged',
        code: 'already-satisfied',
        resultingFingerprint: change.desiredFingerprint,
        completedAt: clock(),
      })
      continue
    }
    let result: ReconciliationAdapterResult
    try {
      result = reconciliationAdapterResultSchema.parse(
        await options.adapter.apply({
          operationId: options.operationId,
          idempotencyKey: `${options.idempotencyKey}:${change.stepId}`,
          instanceId: manifest.instance.id,
          accountAlias: manifest.target.accountAlias,
          manifest,
          planStep: plan.steps[index]!,
          step: change,
        }),
      )
      if (
        !allowedOutcome(change.action, result.status) ||
        (result.status !== 'failed' &&
          result.resultingFingerprint !== change.desiredFingerprint)
      ) {
        result = {
          status: 'failed',
          code: 'adapter-outcome-mismatch',
          resultingFingerprint: null,
        }
      }
    } catch {
      result = {
        status: 'failed',
        code: 'adapter-call-failed',
        resultingFingerprint: null,
      }
    }
    results.push({
      stepId: change.stepId,
      kind: change.kind,
      ...result,
      completedAt: clock(),
    })
    if (result.status === 'failed') break
  }

  return reconciliationReportSchema.parse({
    formatVersion: 1,
    operationId: options.operationId,
    idempotencyKeySha256: await sha256Bytes(
      new TextEncoder().encode(options.idempotencyKey),
    ),
    previewSha256,
    manifestSha256,
    instanceId: manifest.instance.id,
    environment: manifest.target.environment,
    accountAlias: manifest.target.accountAlias,
    status: results.some((result) => result.status === 'failed')
      ? 'failed'
      : 'succeeded',
    startedAt,
    completedAt: clock(),
    steps: results,
  })
}
