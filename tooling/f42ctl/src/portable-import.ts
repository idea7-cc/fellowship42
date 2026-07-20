import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cutoverApprovalSchema,
  deploymentManifestSchema,
  destinationImportPreflightSchema,
  importExecutionReportSchema,
  importPlanSchema,
  importStepKindSchema,
  portableExportManifestSchema,
  r2ExportIndexSchema,
  type CutoverApproval,
  type DeploymentManifest,
  type ImportPlan,
  type ImportExecutionReport,
  type DestinationImportPreflight,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'
import { verifyPortableExport } from './portable-export.js'

const MAX_JSON_BYTES = 16 * 1024 * 1024

async function readJson(file: string): Promise<unknown> {
  const details = await lstat(file)
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_JSON_BYTES) {
    throw new Error(`Expected a bounded regular JSON file: ${file}`)
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

function digestManifest(manifest: DeploymentManifest) {
  return createHash('sha256').update(canonicalJson(manifest)).digest('hex')
}

export async function buildPortableImportPlan(options: {
  exportDirectory: string
  destinationManifestPath: string
  operationId?: string
  generatedAt?: string
}): Promise<ImportPlan> {
  const operationId = options.operationId ?? randomUUID()
  const exportManifest = portableExportManifestSchema.parse(
    await readJson(path.join(options.exportDirectory, 'export-manifest.json')),
  )
  const generatedAt = new Date(options.generatedAt ?? new Date().toISOString())
  if (
    Number.isNaN(generatedAt.valueOf()) ||
    generatedAt < new Date(exportManifest.exportedAt)
  ) {
    throw new Error('Import plan time must be valid and follow export')
  }
  const exportEvidence = await verifyPortableExport({
    directory: options.exportDirectory,
    verifiedAt: generatedAt.toISOString(),
    evidenceId: operationId,
  })
  const destination = deploymentManifestSchema.parse(
    await readJson(options.destinationManifestPath),
  )
  if (destination.instance.id !== exportManifest.instanceId) {
    throw new Error('Destination must preserve the exported portable instance identity')
  }
  if (
    destination.target.environment === 'production' &&
    destination.worker.domains.length === 0
  ) {
    throw new Error('Production import requires an explicit destination domain')
  }
  const step = (
    position: number,
    kind: ImportPlan['steps'][number]['kind'],
    risk: ImportPlan['steps'][number]['risk'],
    resourceName: string | null,
    dependencies: number[],
    approvalRequired = false,
  ) => ({
    id: `import-${String(position).padStart(2, '0')}`,
    kind,
    risk,
    resourceName,
    dependsOn: dependencies.map(
      (dependency) => `import-${String(dependency).padStart(2, '0')}`,
    ),
    approvalRequired,
  })

  return importPlanSchema.parse({
    formatVersion: 1,
    operationId,
    generatedAt: generatedAt.toISOString(),
    instanceId: exportManifest.instanceId,
    exportManifestSha256: exportEvidence.exportManifestSha256,
    destinationManifestSha256: digestManifest(destination),
    sourceRelease: exportManifest.sourceRelease,
    destinationRelease: destination.instance.release,
    destinationEnvironment: destination.target.environment,
    steps: [
      step(1, 'verify-export', 'read-only', null, []),
      step(2, 'verify-release-compatibility', 'read-only', null, [1]),
      step(3, 'verify-destination-manifest', 'read-only', destination.worker.name, [2]),
      step(4, 'verify-new-empty-d1', 'read-only', destination.resources.d1.name, [3]),
      step(5, 'verify-new-empty-r2', 'read-only', destination.resources.r2.name, [3]),
      step(6, 'restore-d1', 'writes-destination', destination.resources.d1.name, [4]),
      step(7, 'restore-r2', 'writes-destination', destination.resources.r2.name, [5]),
      step(8, 'apply-forward-migrations', 'writes-destination', destination.resources.d1.name, [6]),
      step(9, 'deploy-without-domains', 'writes-destination', destination.worker.name, [7, 8]),
      step(10, 'rotate-deployment-credentials', 'credential-change', null, [9]),
      step(11, 'rotate-application-secrets', 'credential-change', null, [10]),
      step(12, 'rotate-management-credentials', 'credential-change', null, [11]),
      step(13, 'verify-restored-identity', 'read-only', destination.resources.d1.name, [12]),
      step(14, 'verify-runtime', 'read-only', destination.worker.name, [13]),
      step(15, 'cutover-domains', 'cutover', destination.worker.domains[0] ?? destination.worker.name, [14], true),
      step(16, 'verify-independent-operation', 'read-only', destination.worker.name, [15]),
      step(17, 'retire-source-routing', 'source-change', null, [16], true),
    ],
  })
}

export function verifyCutoverApproval(
  planInput: unknown,
  destinationManifestInput: unknown,
  approvalInput: unknown,
): CutoverApproval {
  const plan = importPlanSchema.parse(planInput)
  const destination = deploymentManifestSchema.parse(destinationManifestInput)
  const approval = cutoverApprovalSchema.parse(approvalInput)
  if (
    approval.operationId !== plan.operationId ||
    approval.instanceId !== plan.instanceId ||
    approval.exportManifestSha256 !== plan.exportManifestSha256 ||
    approval.destinationManifestSha256 !== plan.destinationManifestSha256 ||
    destination.instance.id !== plan.instanceId ||
    digestManifest(destination) !== plan.destinationManifestSha256
  ) {
    throw new Error('Cutover approval does not bind to the exact import target')
  }
  if (JSON.stringify(approval.domains) !== JSON.stringify(destination.worker.domains)) {
    throw new Error('Cutover approval domains do not match the destination manifest')
  }
  return approval
}

export interface ImportContext {
  plan: ImportPlan
  destination: DeploymentManifest
}

export interface PortableImportAdapter {
  preflight(context: ImportContext): Promise<DestinationImportPreflight>
  restoreD1(context: ImportContext & { sqlPath: string }): Promise<void>
  restoreR2Object(
    context: ImportContext & {
      key: string
      filePath: string
      bytes: number
      sha256: string
    },
  ): Promise<void>
  applyForwardMigrations(context: ImportContext): Promise<void>
  deployWithoutDomains(context: ImportContext): Promise<void>
  rotateDeploymentCredentials(context: ImportContext): Promise<void>
  rotateApplicationSecrets(context: ImportContext): Promise<void>
  rotateManagementCredentials(context: ImportContext): Promise<void>
  verifyRestoredIdentity(context: ImportContext): Promise<string>
  verifyRuntime(context: ImportContext): Promise<boolean>
  cutoverDomains(context: ImportContext & { approval: CutoverApproval }): Promise<void>
  verifyIndependentOperation(
    context: ImportContext & { approval: CutoverApproval },
  ): Promise<boolean>
  retireSourceRouting(
    context: ImportContext & { approval: CutoverApproval },
  ): Promise<void>
}

function pendingSteps(): ImportExecutionReport['steps'] {
  return importStepKindSchema.options.map((kind, position) => ({
    id: `import-${String(position + 1).padStart(2, '0')}`,
    kind,
    status: 'pending' as const,
    code: 'not-run',
    completedAt: null,
  }))
}

function executionReport(
  plan: ImportPlan,
  startedAt: string,
  updatedAt: string,
  steps: ImportExecutionReport['steps'],
): ImportExecutionReport {
  const status = steps.some((step) => step.status === 'failed')
    ? 'failed'
    : steps.every((step) => step.status === 'succeeded')
      ? 'succeeded'
      : 'awaiting-cutover'
  return importExecutionReportSchema.parse({
    formatVersion: 1,
    operationId: plan.operationId,
    instanceId: plan.instanceId,
    exportManifestSha256: plan.exportManifestSha256,
    destinationManifestSha256: plan.destinationManifestSha256,
    startedAt,
    updatedAt,
    status,
    steps,
  })
}

export async function executePortableImportRestore(options: {
  plan: unknown
  exportDirectory: string
  destinationManifestPath: string
  adapter: PortableImportAdapter
  now?: () => string
}): Promise<ImportExecutionReport> {
  const plan = importPlanSchema.parse(options.plan)
  const now = options.now ?? (() => new Date().toISOString())
  const startedAt = now()
  const steps = pendingSteps()
  const fail = (position: number, code: string) => {
    steps[position] = {
      ...steps[position]!,
      status: 'failed',
      code,
      completedAt: now(),
    }
    return executionReport(plan, startedAt, now(), steps)
  }
  const succeed = (position: number) => {
    steps[position] = {
      ...steps[position]!,
      status: 'succeeded',
      code: `${steps[position]!.kind}-succeeded`,
      completedAt: now(),
    }
  }

  let destination: DeploymentManifest
  let localFailurePosition = 0
  try {
    const rebuilt = await buildPortableImportPlan({
      exportDirectory: options.exportDirectory,
      destinationManifestPath: options.destinationManifestPath,
      operationId: plan.operationId,
      generatedAt: plan.generatedAt,
    })
    if (canonicalJson(rebuilt) !== canonicalJson(plan)) return fail(0, 'plan-binding-mismatch')
    succeed(0)
    succeed(1)
    localFailurePosition = 2
    destination = deploymentManifestSchema.parse(
      await readJson(options.destinationManifestPath),
    )
    succeed(2)
  } catch {
    return fail(
      localFailurePosition,
      localFailurePosition === 0
        ? 'export-or-plan-verification-failed'
        : 'destination-manifest-verification-failed',
    )
  }
  const context = { plan, destination }
  let preflight: DestinationImportPreflight
  try {
    preflight = destinationImportPreflightSchema.parse(
      await options.adapter.preflight(context),
    )
    if (
      preflight.operationId !== plan.operationId ||
      preflight.instanceId !== plan.instanceId ||
      preflight.destinationManifestSha256 !== plan.destinationManifestSha256
    ) return fail(3, 'destination-preflight-binding-mismatch')
    if (
      Date.parse(preflight.observedAt) < Date.parse(plan.generatedAt) ||
      Date.parse(preflight.observedAt) > Date.parse(startedAt) + 5 * 60 * 1_000 ||
      Date.parse(preflight.d1.createdAt) < Date.parse(plan.generatedAt) ||
      Date.parse(preflight.r2.createdAt) < Date.parse(plan.generatedAt) ||
      Date.parse(preflight.d1.createdAt) > Date.parse(preflight.observedAt) ||
      Date.parse(preflight.r2.createdAt) > Date.parse(preflight.observedAt)
    ) {
      return fail(3, 'destination-preflight-time-invalid')
    }
  } catch {
    return fail(3, 'destination-not-new-and-empty')
  }
  if (preflight.d1.state !== 'empty') {
    return fail(3, 'destination-d1-not-empty')
  }
  succeed(3)
  if (preflight.r2.state !== 'empty') {
    return fail(4, 'destination-r2-not-empty')
  }
  succeed(4)
  try {
    await options.adapter.restoreD1({
      ...context,
      sqlPath: path.join(options.exportDirectory, 'd1/database.sql'),
    })
    succeed(5)
  } catch {
    return fail(5, 'd1-restore-failed')
  }
  try {
    const index = r2ExportIndexSchema.parse(
      await readJson(path.join(options.exportDirectory, 'r2/index.json')),
    )
    for (const object of index.objects) {
      await options.adapter.restoreR2Object({
        ...context,
        key: object.key,
        filePath: path.join(options.exportDirectory, object.file),
        bytes: object.bytes,
        sha256: object.sha256,
      })
    }
    succeed(6)
  } catch {
    return fail(6, 'r2-restore-failed')
  }
  for (const [position, operation, failureCode] of [
    [7, () => options.adapter.applyForwardMigrations(context), 'migration-apply-failed'],
    [8, () => options.adapter.deployWithoutDomains(context), 'domainless-deploy-failed'],
    [9, () => options.adapter.rotateDeploymentCredentials(context), 'deployment-credential-rotation-failed'],
    [10, () => options.adapter.rotateApplicationSecrets(context), 'application-secret-rotation-failed'],
    [11, () => options.adapter.rotateManagementCredentials(context), 'management-credential-rotation-failed'],
  ] as const) {
    try {
      await operation()
      succeed(position)
    } catch {
      return fail(position, failureCode)
    }
  }
  try {
    if ((await options.adapter.verifyRestoredIdentity(context)) !== plan.instanceId) {
      return fail(12, 'restored-identity-mismatch')
    }
    succeed(12)
  } catch {
    return fail(12, 'restored-identity-verification-failed')
  }
  try {
    if (!(await options.adapter.verifyRuntime(context))) {
      return fail(13, 'destination-runtime-unhealthy')
    }
    succeed(13)
  } catch {
    return fail(13, 'destination-runtime-verification-failed')
  }
  return executionReport(plan, startedAt, now(), steps)
}

export async function executePortableCutover(options: {
  plan: unknown
  report: unknown
  destinationManifest: unknown
  approval: unknown
  adapter: PortableImportAdapter
  now?: () => string
}): Promise<ImportExecutionReport> {
  const plan = importPlanSchema.parse(options.plan)
  const report = importExecutionReportSchema.parse(options.report)
  if (report.status !== 'awaiting-cutover') {
    throw new Error('Cutover requires an import awaiting explicit cutover approval')
  }
  const destination = deploymentManifestSchema.parse(options.destinationManifest)
  if (
    report.operationId !== plan.operationId ||
    report.instanceId !== plan.instanceId ||
    report.exportManifestSha256 !== plan.exportManifestSha256 ||
    report.destinationManifestSha256 !== plan.destinationManifestSha256
  ) {
    throw new Error('Execution report does not bind to the supplied import plan')
  }
  const approval = verifyCutoverApproval(plan, destination, options.approval)
  const now = options.now ?? (() => new Date().toISOString())
  const cutoverStartedAt = now()
  if (
    Date.parse(approval.approvedAt) < Date.parse(report.updatedAt) ||
    Date.parse(cutoverStartedAt) < Date.parse(approval.approvedAt) ||
    Date.parse(cutoverStartedAt) >= Date.parse(approval.rollbackDeadline)
  ) {
    throw new Error('Cutover approval is stale, premature, or outside its rollback window')
  }
  const steps = report.steps.map((step) => ({ ...step }))
  const context = { plan, destination }
  const fail = (position: number, code: string) => {
    steps[position] = {
      ...steps[position]!,
      status: 'failed',
      code,
      completedAt: now(),
    }
    return executionReport(plan, report.startedAt, now(), steps)
  }
  const succeed = (position: number) => {
    steps[position] = {
      ...steps[position]!,
      status: 'succeeded',
      code: `${steps[position]!.kind}-succeeded`,
      completedAt: now(),
    }
  }
  try {
    await options.adapter.cutoverDomains({ ...context, approval })
    succeed(14)
  } catch {
    return fail(14, 'domain-cutover-failed')
  }
  try {
    if (!(await options.adapter.verifyIndependentOperation({ ...context, approval }))) {
      return fail(15, 'independent-operation-unhealthy')
    }
    succeed(15)
  } catch {
    return fail(15, 'independent-operation-verification-failed')
  }
  try {
    await options.adapter.retireSourceRouting({ ...context, approval })
    succeed(16)
  } catch {
    return fail(16, 'source-routing-retirement-failed')
  }
  return executionReport(plan, report.startedAt, now(), steps)
}
