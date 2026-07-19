import { createHash } from 'node:crypto'
import {
  deploymentManifestSchema,
  importExecutionReportSchema,
  importPlanSchema,
  migrationRehearsalAssertionIdSchema,
  migrationRehearsalEvidenceSchema,
  type MigrationRehearsalEvidence,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'
import { verifyCutoverApproval } from './portable-import.js'

export interface MigrationRehearsalObservations {
  exportVerified: boolean
  destinationWasNewAndEmpty: boolean
  d1RestoredExactly: boolean
  r2RestoredExactly: boolean
  credentialsRotated: boolean
  portableIdentityPreserved: boolean
  runtimeHealthy: boolean
  cutoverApplied: boolean
  independentOperationVerified: boolean
  sourceRoutingRetired: boolean
}

function digestJson(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function reportBindsToPlan(
  plan: ReturnType<typeof importPlanSchema.parse>,
  report: ReturnType<typeof importExecutionReportSchema.parse>,
) {
  return (
    report.operationId === plan.operationId &&
    report.instanceId === plan.instanceId &&
    report.exportManifestSha256 === plan.exportManifestSha256 &&
    report.destinationManifestSha256 === plan.destinationManifestSha256
  )
}

export function buildMigrationRehearsalEvidence(options: {
  plan: unknown
  destinationManifest: unknown
  restoreReport: unknown
  approval: unknown
  completionReport: unknown
  observations: MigrationRehearsalObservations
  evidenceId: string
  sourceCustody: 'fellowship42-hosted'
}): MigrationRehearsalEvidence {
  const plan = importPlanSchema.parse(options.plan)
  const destination = deploymentManifestSchema.parse(
    options.destinationManifest,
  )
  const restoreReport = importExecutionReportSchema.parse(options.restoreReport)
  const completionReport = importExecutionReportSchema.parse(
    options.completionReport,
  )
  const approval = verifyCutoverApproval(plan, destination, options.approval)
  if (
    destination.target.environment !== 'production' ||
    destination.custody.infrastructureOwner !== 'church' ||
    destination.custody.operator !== 'church'
  ) {
    throw new Error(
      'Hosted-to-church-owned rehearsal requires a church-owned production destination.',
    )
  }
  if (
    !reportBindsToPlan(plan, restoreReport) ||
    !reportBindsToPlan(plan, completionReport) ||
    restoreReport.status !== 'awaiting-cutover' ||
    completionReport.status !== 'succeeded'
  ) {
    throw new Error(
      'Rehearsal requires bound awaiting-cutover and succeeded execution reports.',
    )
  }
  if (
    restoreReport.startedAt !== completionReport.startedAt ||
    Date.parse(restoreReport.startedAt) < Date.parse(plan.generatedAt) ||
    Date.parse(approval.approvedAt) < Date.parse(restoreReport.updatedAt) ||
    Date.parse(completionReport.updatedAt) < Date.parse(approval.approvedAt)
  ) {
    throw new Error('Rehearsal evidence chronology is inconsistent.')
  }
  if (
    approval.credentialDisposition.deployment !== 'rotated' ||
    approval.credentialDisposition.applicationSecrets !== 'rotated' ||
    approval.credentialDisposition.management !== 'disconnected'
  ) {
    throw new Error(
      'Church-owned rehearsal requires rotated deployment/application credentials and disconnected management.',
    )
  }
  const observationValues = Object.values(options.observations)
  if (
    observationValues.length !== 10 ||
    observationValues.some((value) => value !== true)
  ) {
    throw new Error('Every hosted-to-church-owned rehearsal observation must pass.')
  }

  return migrationRehearsalEvidenceSchema.parse({
    formatVersion: 1,
    evidenceId: options.evidenceId,
    scenario: 'hosted-to-church-owned',
    operationId: plan.operationId,
    instanceId: plan.instanceId,
    sourceCustody: options.sourceCustody,
    destinationCustody: 'church-owned',
    sourceRelease: plan.sourceRelease,
    destinationRelease: plan.destinationRelease,
    exportManifestSha256: plan.exportManifestSha256,
    destinationManifestSha256: plan.destinationManifestSha256,
    planSha256: digestJson(plan),
    restoreReportSha256: digestJson(restoreReport),
    cutoverApprovalSha256: digestJson(approval),
    completionReportSha256: digestJson(completionReport),
    startedAt: plan.generatedAt,
    restoreVerifiedAt: restoreReport.updatedAt,
    cutoverApprovedAt: approval.approvedAt,
    completedAt: completionReport.updatedAt,
    status: 'verified',
    assertions: migrationRehearsalAssertionIdSchema.options.map((id) => ({
      id,
      status: 'pass',
      code: `${id}-passed`,
    })),
  })
}
