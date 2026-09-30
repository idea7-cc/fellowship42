import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cutoverApprovalSchema,
  deploymentManifestSchema,
  destinationImportPreflightSchema,
  importExecutionReportSchema,
  importPlanSchema,
  importStepKindsFor,
  importStepRisks,
  portableConfigurationSchema,
  portableExportManifestSchema,
  r2ExportIndexSchema,
  type CutoverApproval,
  type DeploymentManifest,
  type ImportPlan,
  type ImportExecutionReport,
  type ImportStepKind,
  type DestinationImportPreflight,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './canonical.js'
import { verifyPortableExport } from './portable-export.js'

const MAX_JSON_BYTES = 16 * 1024 * 1024

async function readJson(file: string): Promise<unknown> {
  const details = await lstat(file)
  if (
    !details.isFile() ||
    details.isSymbolicLink() ||
    details.size > MAX_JSON_BYTES
  ) {
    throw new Error(`Expected a bounded regular JSON file: ${file}`)
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

function digestManifest(manifest: DeploymentManifest) {
  return createHash('sha256').update(canonicalJson(manifest)).digest('hex')
}

/** Every hostname the cutover attaches: instance domains, then website domains. */
export function installationDomains(manifest: DeploymentManifest): string[] {
  return [
    ...manifest.worker.domains,
    ...(manifest.website?.worker.domains ?? []),
  ]
}

function planHasWebsite(plan: ImportPlan) {
  return plan.steps.some((step) => step.kind === 'restore-website-d1')
}

function stepShape(steps: ReadonlyArray<{ id: string; kind: ImportStepKind }>) {
  return canonicalJson(steps.map(({ id, kind }) => ({ id, kind })))
}

/**
 * True only when an execution report belongs to the plan: the same operation,
 * portable identity, and manifests, and exactly the plan's ordered step IDs
 * and kinds. The report schema alone accepts either the instance-only or the
 * website step list, so a report that skipped the website would otherwise
 * bind to a website plan.
 */
export function importReportBindsToPlan(
  plan: ImportPlan,
  report: ImportExecutionReport,
): boolean {
  return (
    report.operationId === plan.operationId &&
    report.instanceId === plan.instanceId &&
    report.exportManifestSha256 === plan.exportManifestSha256 &&
    report.destinationManifestSha256 === plan.destinationManifestSha256 &&
    stepShape(report.steps) === stepShape(plan.steps)
  )
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
    throw new Error(
      'Destination must preserve the exported portable instance identity',
    )
  }
  if (
    destination.target.environment === 'production' &&
    destination.worker.domains.length === 0
  ) {
    throw new Error('Production import requires an explicit destination domain')
  }
  const configuration = portableConfigurationSchema.parse(
    await readJson(path.join(options.exportDirectory, 'config/portable.json')),
  )
  const website = destination.website
  if (Boolean(website) !== Boolean(configuration.website)) {
    throw new Error(
      'Destination must declare the same installation components as the export',
    )
  }
  if (
    website &&
    canonicalJson(website.cms) !== canonicalJson(configuration.website?.cms)
  ) {
    throw new Error(
      'Import format v1 requires the exported website CMS name and version',
    )
  }
  const kinds = importStepKindsFor(Boolean(website))
  const idOf = (kind: ImportStepKind) =>
    `import-${String(kinds.indexOf(kind) + 1).padStart(2, '0')}`
  const resourceNames: Partial<Record<ImportStepKind, string>> = {
    'verify-destination-manifest': destination.worker.name,
    'verify-new-empty-d1': destination.resources.d1.name,
    'verify-new-empty-r2': destination.resources.r2.name,
    'restore-d1': destination.resources.d1.name,
    'restore-r2': destination.resources.r2.name,
    'apply-forward-migrations': destination.resources.d1.name,
    'deploy-without-domains': destination.worker.name,
    'verify-restored-identity': destination.resources.d1.name,
    'verify-runtime': destination.worker.name,
    'cutover-domains': destination.worker.domains[0] ?? destination.worker.name,
    'verify-independent-operation': destination.worker.name,
    ...(website
      ? {
          'verify-new-empty-website-d1': website.resources.d1.name,
          'verify-new-empty-website-r2': website.resources.r2.name,
          'restore-website-d1': website.resources.d1.name,
          'restore-website-r2': website.resources.r2.name,
          'deploy-website-without-domains': website.worker.name,
          'verify-website-runtime': website.worker.name,
        }
      : {}),
  }
  const lastDeploy = website
    ? 'deploy-website-without-domains'
    : 'deploy-without-domains'
  const lastVerification = website ? 'verify-website-runtime' : 'verify-runtime'
  const dependencies: Record<ImportStepKind, ImportStepKind[]> = {
    'verify-export': [],
    'verify-release-compatibility': ['verify-export'],
    'verify-destination-manifest': ['verify-release-compatibility'],
    'verify-new-empty-d1': ['verify-destination-manifest'],
    'verify-new-empty-r2': ['verify-destination-manifest'],
    'verify-new-empty-website-d1': ['verify-destination-manifest'],
    'verify-new-empty-website-r2': ['verify-destination-manifest'],
    'restore-d1': ['verify-new-empty-d1'],
    'restore-r2': ['verify-new-empty-r2'],
    'restore-website-d1': ['verify-new-empty-website-d1'],
    'restore-website-r2': ['verify-new-empty-website-r2'],
    'apply-forward-migrations': ['restore-d1'],
    'deploy-without-domains': ['restore-r2', 'apply-forward-migrations'],
    'deploy-website-without-domains': [
      'restore-website-d1',
      'restore-website-r2',
      'deploy-without-domains',
    ],
    'rotate-deployment-credentials': [lastDeploy],
    'rotate-application-secrets': ['rotate-deployment-credentials'],
    'rotate-management-credentials': ['rotate-application-secrets'],
    'verify-restored-identity': ['rotate-management-credentials'],
    'verify-runtime': ['verify-restored-identity'],
    'verify-website-runtime': ['verify-runtime'],
    'cutover-domains': [lastVerification],
    'verify-independent-operation': ['cutover-domains'],
    'retire-source-routing': ['verify-independent-operation'],
  }

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
    steps: kinds.map((kind) => ({
      id: idOf(kind),
      kind,
      risk: importStepRisks[kind],
      resourceName: resourceNames[kind] ?? null,
      dependsOn: dependencies[kind].map(idOf),
      approvalRequired:
        kind === 'cutover-domains' || kind === 'retire-source-routing',
    })),
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
  if (
    JSON.stringify(approval.domains) !==
    JSON.stringify(installationDomains(destination))
  ) {
    throw new Error(
      'Cutover approval domains do not match the destination manifest',
    )
  }
  if (
    Boolean(destination.website) !==
      Boolean(approval.credentialDisposition.website) ||
    Boolean(destination.website) !== planHasWebsite(plan)
  ) {
    throw new Error(
      'Cutover approval must dispose website credentials exactly when the destination has a website',
    )
  }
  return approval
}

export interface ImportContext {
  plan: ImportPlan
  destination: DeploymentManifest
}

export type R2ObjectRestore = ImportContext & {
  key: string
  filePath: string
  bytes: number
  sha256: string
}

/**
 * Website restore effects. Required when the destination declares a website;
 * an instance-only adapter may omit them.
 */
export interface PortableWebsiteImportAdapter {
  restoreWebsiteD1(context: ImportContext & { sqlPath: string }): Promise<void>
  restoreWebsiteR2Object(context: R2ObjectRestore): Promise<void>
  /**
   * Deploys the website Worker without domains, bound to a newly created empty
   * session KV namespace, the preserved `EMDASH_ENCRYPTION_KEY`, and the
   * restored portable identity digest.
   */
  deployWebsiteWithoutDomains(context: ImportContext): Promise<void>
  /** True only when the website runs and pins the restored instance identity. */
  verifyWebsiteRuntime(context: ImportContext): Promise<boolean>
}

export interface PortableImportAdapter extends Partial<PortableWebsiteImportAdapter> {
  preflight(context: ImportContext): Promise<DestinationImportPreflight>
  restoreD1(context: ImportContext & { sqlPath: string }): Promise<void>
  restoreR2Object(context: R2ObjectRestore): Promise<void>
  applyForwardMigrations(context: ImportContext): Promise<void>
  deployWithoutDomains(context: ImportContext): Promise<void>
  rotateDeploymentCredentials(context: ImportContext): Promise<void>
  rotateApplicationSecrets(context: ImportContext): Promise<void>
  rotateManagementCredentials(context: ImportContext): Promise<void>
  verifyRestoredIdentity(context: ImportContext): Promise<string>
  verifyRuntime(context: ImportContext): Promise<boolean>
  cutoverDomains(
    context: ImportContext & { approval: CutoverApproval },
  ): Promise<void>
  verifyIndependentOperation(
    context: ImportContext & { approval: CutoverApproval },
  ): Promise<boolean>
  retireSourceRouting(
    context: ImportContext & { approval: CutoverApproval },
  ): Promise<void>
}

function pendingSteps(plan: ImportPlan): ImportExecutionReport['steps'] {
  return plan.steps.map((step) => ({
    id: step.id,
    kind: step.kind,
    status: 'pending' as const,
    code: 'not-run',
    completedAt: null,
  }))
}

function websiteAdapter(
  adapter: PortableImportAdapter,
): PortableWebsiteImportAdapter | null {
  const {
    restoreWebsiteD1,
    restoreWebsiteR2Object,
    deployWebsiteWithoutDomains,
    verifyWebsiteRuntime,
  } = adapter
  return restoreWebsiteD1 &&
    restoreWebsiteR2Object &&
    deployWebsiteWithoutDomains &&
    verifyWebsiteRuntime
    ? {
        restoreWebsiteD1: restoreWebsiteD1.bind(adapter),
        restoreWebsiteR2Object: restoreWebsiteR2Object.bind(adapter),
        deployWebsiteWithoutDomains: deployWebsiteWithoutDomains.bind(adapter),
        verifyWebsiteRuntime: verifyWebsiteRuntime.bind(adapter),
      }
    : null
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

function stepRecorder(
  plan: ImportPlan,
  steps: ImportExecutionReport['steps'],
  startedAt: string,
  now: () => string,
) {
  const position = (kind: ImportStepKind) => {
    const index = steps.findIndex((step) => step.kind === kind)
    if (index < 0) throw new Error(`Import plan has no ${kind} step`)
    return index
  }
  return {
    fail(kind: ImportStepKind, code: string) {
      const index = position(kind)
      steps[index] = {
        ...steps[index]!,
        status: 'failed',
        code,
        completedAt: now(),
      }
      return executionReport(plan, startedAt, now(), steps)
    },
    succeed(kind: ImportStepKind) {
      const index = position(kind)
      steps[index] = {
        ...steps[index]!,
        status: 'succeeded',
        code: `${kind}-succeeded`,
        completedAt: now(),
      }
    },
  }
}

async function restoreR2Index(
  exportDirectory: string,
  indexFile: string,
  restore: (
    object: Omit<R2ObjectRestore, keyof ImportContext>,
  ) => Promise<void>,
) {
  const index = r2ExportIndexSchema.parse(
    await readJson(path.join(exportDirectory, indexFile)),
  )
  for (const object of index.objects) {
    await restore({
      key: object.key,
      filePath: path.join(exportDirectory, object.file),
      bytes: object.bytes,
      sha256: object.sha256,
    })
  }
}

function preflightTimeValid(
  preflight: DestinationImportPreflight,
  plan: ImportPlan,
  startedAt: string,
) {
  const created = [
    preflight.d1.createdAt,
    preflight.r2.createdAt,
    ...(preflight.website
      ? [preflight.website.d1.createdAt, preflight.website.r2.createdAt]
      : []),
  ].map(Date.parse)
  const observedAt = Date.parse(preflight.observedAt)
  return (
    observedAt >= Date.parse(plan.generatedAt) &&
    observedAt <= Date.parse(startedAt) + 5 * 60 * 1_000 &&
    created.every(
      (time) => time >= Date.parse(plan.generatedAt) && time <= observedAt,
    )
  )
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
  const steps = pendingSteps(plan)
  const { fail, succeed } = stepRecorder(plan, steps, startedAt, now)
  const hasWebsite = planHasWebsite(plan)

  let destination: DeploymentManifest
  let failure: ImportStepKind = 'verify-export'
  try {
    const rebuilt = await buildPortableImportPlan({
      exportDirectory: options.exportDirectory,
      destinationManifestPath: options.destinationManifestPath,
      operationId: plan.operationId,
      generatedAt: plan.generatedAt,
    })
    if (canonicalJson(rebuilt) !== canonicalJson(plan))
      return fail('verify-export', 'plan-binding-mismatch')
    succeed('verify-export')
    succeed('verify-release-compatibility')
    failure = 'verify-destination-manifest'
    destination = deploymentManifestSchema.parse(
      await readJson(options.destinationManifestPath),
    )
  } catch {
    return fail(
      failure,
      failure === 'verify-export'
        ? 'export-or-plan-verification-failed'
        : 'destination-manifest-verification-failed',
    )
  }
  const website = hasWebsite ? websiteAdapter(options.adapter) : null
  if (hasWebsite && !website) {
    return fail('verify-destination-manifest', 'website-adapter-unsupported')
  }
  succeed('verify-destination-manifest')
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
    )
      return fail(
        'verify-new-empty-d1',
        'destination-preflight-binding-mismatch',
      )
    if (Boolean(preflight.website) !== hasWebsite) {
      return fail(
        'verify-new-empty-d1',
        'destination-preflight-component-mismatch',
      )
    }
    if (!preflightTimeValid(preflight, plan, startedAt)) {
      return fail('verify-new-empty-d1', 'destination-preflight-time-invalid')
    }
  } catch {
    return fail('verify-new-empty-d1', 'destination-not-new-and-empty')
  }
  if (preflight.d1.state !== 'empty') {
    return fail('verify-new-empty-d1', 'destination-d1-not-empty')
  }
  succeed('verify-new-empty-d1')
  if (preflight.r2.state !== 'empty') {
    return fail('verify-new-empty-r2', 'destination-r2-not-empty')
  }
  succeed('verify-new-empty-r2')
  if (preflight.website) {
    if (preflight.website.d1.state !== 'empty') {
      return fail(
        'verify-new-empty-website-d1',
        'destination-website-d1-not-empty',
      )
    }
    succeed('verify-new-empty-website-d1')
    if (preflight.website.r2.state !== 'empty') {
      return fail(
        'verify-new-empty-website-r2',
        'destination-website-r2-not-empty',
      )
    }
    succeed('verify-new-empty-website-r2')
  }
  try {
    await options.adapter.restoreD1({
      ...context,
      sqlPath: path.join(options.exportDirectory, 'd1/database.sql'),
    })
    succeed('restore-d1')
  } catch {
    return fail('restore-d1', 'd1-restore-failed')
  }
  try {
    await restoreR2Index(options.exportDirectory, 'r2/index.json', (object) =>
      options.adapter.restoreR2Object({ ...context, ...object }),
    )
    succeed('restore-r2')
  } catch {
    return fail('restore-r2', 'r2-restore-failed')
  }
  if (website) {
    try {
      await website.restoreWebsiteD1({
        ...context,
        sqlPath: path.join(options.exportDirectory, 'website/d1/database.sql'),
      })
      succeed('restore-website-d1')
    } catch {
      return fail('restore-website-d1', 'website-d1-restore-failed')
    }
    try {
      await restoreR2Index(
        options.exportDirectory,
        'website/r2/index.json',
        (object) => website.restoreWebsiteR2Object({ ...context, ...object }),
      )
      succeed('restore-website-r2')
    } catch {
      return fail('restore-website-r2', 'website-r2-restore-failed')
    }
  }
  const effects: Array<[ImportStepKind, () => Promise<void>, string]> = [
    [
      'apply-forward-migrations',
      () => options.adapter.applyForwardMigrations(context),
      'migration-apply-failed',
    ],
    [
      'deploy-without-domains',
      () => options.adapter.deployWithoutDomains(context),
      'domainless-deploy-failed',
    ],
    ...(website
      ? [
          [
            'deploy-website-without-domains',
            () => website.deployWebsiteWithoutDomains(context),
            'website-domainless-deploy-failed',
          ] as [ImportStepKind, () => Promise<void>, string],
        ]
      : []),
    [
      'rotate-deployment-credentials',
      () => options.adapter.rotateDeploymentCredentials(context),
      'deployment-credential-rotation-failed',
    ],
    [
      'rotate-application-secrets',
      () => options.adapter.rotateApplicationSecrets(context),
      'application-secret-rotation-failed',
    ],
    [
      'rotate-management-credentials',
      () => options.adapter.rotateManagementCredentials(context),
      'management-credential-rotation-failed',
    ],
  ]
  for (const [kind, operation, failureCode] of effects) {
    try {
      await operation()
      succeed(kind)
    } catch {
      return fail(kind, failureCode)
    }
  }
  try {
    if (
      (await options.adapter.verifyRestoredIdentity(context)) !==
      plan.instanceId
    ) {
      return fail('verify-restored-identity', 'restored-identity-mismatch')
    }
    succeed('verify-restored-identity')
  } catch {
    return fail(
      'verify-restored-identity',
      'restored-identity-verification-failed',
    )
  }
  try {
    if (!(await options.adapter.verifyRuntime(context))) {
      return fail('verify-runtime', 'destination-runtime-unhealthy')
    }
    succeed('verify-runtime')
  } catch {
    return fail('verify-runtime', 'destination-runtime-verification-failed')
  }
  if (website) {
    try {
      if (!(await website.verifyWebsiteRuntime(context))) {
        return fail('verify-website-runtime', 'destination-website-unhealthy')
      }
      succeed('verify-website-runtime')
    } catch {
      return fail(
        'verify-website-runtime',
        'destination-website-verification-failed',
      )
    }
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
    throw new Error(
      'Cutover requires an import awaiting explicit cutover approval',
    )
  }
  const destination = deploymentManifestSchema.parse(
    options.destinationManifest,
  )
  if (!importReportBindsToPlan(plan, report)) {
    throw new Error(
      'Execution report does not bind to the supplied import plan',
    )
  }
  const approval = verifyCutoverApproval(plan, destination, options.approval)
  const now = options.now ?? (() => new Date().toISOString())
  const cutoverStartedAt = now()
  if (
    Date.parse(approval.approvedAt) < Date.parse(report.updatedAt) ||
    Date.parse(cutoverStartedAt) < Date.parse(approval.approvedAt) ||
    Date.parse(cutoverStartedAt) >= Date.parse(approval.rollbackDeadline)
  ) {
    throw new Error(
      'Cutover approval is stale, premature, or outside its rollback window',
    )
  }
  const steps = report.steps.map((step) => ({ ...step }))
  const context = { plan, destination }
  const { fail, succeed } = stepRecorder(plan, steps, report.startedAt, now)
  try {
    await options.adapter.cutoverDomains({ ...context, approval })
    succeed('cutover-domains')
  } catch {
    return fail('cutover-domains', 'domain-cutover-failed')
  }
  try {
    if (
      !(await options.adapter.verifyIndependentOperation({
        ...context,
        approval,
      }))
    ) {
      return fail(
        'verify-independent-operation',
        'independent-operation-unhealthy',
      )
    }
    succeed('verify-independent-operation')
  } catch {
    return fail(
      'verify-independent-operation',
      'independent-operation-verification-failed',
    )
  }
  try {
    await options.adapter.retireSourceRouting({ ...context, approval })
    succeed('retire-source-routing')
  } catch {
    return fail('retire-source-routing', 'source-routing-retirement-failed')
  }
  return executionReport(plan, report.startedAt, now(), steps)
}
