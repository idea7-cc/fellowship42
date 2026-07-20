import { appendFile, cp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  portableRestoreConformanceReportSchema,
  portableRestoreConformanceScenarioIdSchema,
  r2ExportIndexSchema,
  type PortableRestoreConformanceReport,
} from '@fellowship42/management-protocol'
import {
  assemblePortableExport,
  verifyPortableExport,
} from './portable-export.js'
import {
  buildPortableImportPlan,
  executePortableImportRestore,
  type PortableImportAdapter,
} from './portable-import.js'

export type RestoreConformanceAdapterScenario =
  | 'isolated-restore'
  | 'nonempty-destination'
  | 'partial-restore'

export interface PortableRestoreConformanceHarness {
  createAdapter(
    scenario: RestoreConformanceAdapterScenario,
  ): PortableImportAdapter
}

export interface PortableRestoreConformanceOptions {
  deploymentManifestPath: string
  d1ExportPath: string
  r2SourceIndexPath: string
  r2SourceRoot: string
  destinationManifestPath: string
  outputDirectory: string
  harness: PortableRestoreConformanceHarness
  release: PortableRestoreConformanceReport['release']
  startedAt?: string
}

function assertion(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Restore conformance failed: ${message}`)
}

function iso(time: number) {
  return new Date(time).toISOString()
}

function failingStep(
  report: Awaited<ReturnType<typeof executePortableImportRestore>>,
) {
  return report.steps.find((step) => step.status === 'failed')
}

export async function runPortableRestoreConformance(
  options: PortableRestoreConformanceOptions,
): Promise<PortableRestoreConformanceReport> {
  const startedAt = Date.parse(
    options.startedAt ?? new Date().toISOString(),
  )
  if (!Number.isFinite(startedAt)) {
    throw new Error('Restore conformance start time is invalid')
  }
  await assemblePortableExport({
    deploymentManifestPath: options.deploymentManifestPath,
    d1ExportPath: options.d1ExportPath,
    r2SourceIndexPath: options.r2SourceIndexPath,
    r2SourceRoot: options.r2SourceRoot,
    outputDirectory: options.outputDirectory,
    quiescedAt: iso(startedAt),
    exportedAt: iso(startedAt + 60_000),
  })
  const exportedIndex = r2ExportIndexSchema.parse(
    JSON.parse(
      await readFile(
        path.join(options.outputDirectory, 'r2/index.json'),
        'utf8',
      ),
    ),
  )
  assertion(
    exportedIndex.objects.length > 0,
    'the conformance capture must contain at least one R2 object',
  )
  await verifyPortableExport({
    directory: options.outputDirectory,
    verifiedAt: iso(startedAt + 120_000),
  })

  const tamperedDirectory = `${options.outputDirectory}.tampered`
  await cp(options.outputDirectory, tamperedDirectory, {
    recursive: true,
    errorOnExist: true,
    force: false,
  })
  let tamperRejected = false
  try {
    await appendFile(
      path.join(tamperedDirectory, 'd1/database.sql'),
      '\n-- tampered by public conformance harness\n',
    )
    await verifyPortableExport({
      directory: tamperedDirectory,
      verifiedAt: iso(startedAt + 120_000),
    })
  } catch {
    tamperRejected = true
  } finally {
    await rm(tamperedDirectory, { recursive: true, force: true })
  }
  assertion(tamperRejected, 'a modified D1 artifact was accepted')

  const operationId = crypto.randomUUID()
  const plan = await buildPortableImportPlan({
    exportDirectory: options.outputDirectory,
    destinationManifestPath: options.destinationManifestPath,
    operationId,
    generatedAt: iso(startedAt + 180_000),
  })
  const successful = await executePortableImportRestore({
    plan,
    exportDirectory: options.outputDirectory,
    destinationManifestPath: options.destinationManifestPath,
    adapter: options.harness.createAdapter('isolated-restore'),
    now: () => iso(startedAt + 240_000),
  })
  assertion(
    successful.status === 'awaiting-cutover',
    'isolated restore did not stop at the cutover boundary',
  )
  assertion(
    successful.steps.slice(0, 14).every((step) => step.status === 'succeeded'),
    'an isolated restore step did not succeed',
  )
  assertion(
    successful.steps.slice(14).every((step) => step.status === 'pending'),
    'cutover or source mutation ran during isolated restore',
  )

  const nonempty = await executePortableImportRestore({
    plan,
    exportDirectory: options.outputDirectory,
    destinationManifestPath: options.destinationManifestPath,
    adapter: options.harness.createAdapter('nonempty-destination'),
    now: () => iso(startedAt + 240_000),
  })
  assertion(
    nonempty.status === 'failed' &&
      failingStep(nonempty)?.kind === 'verify-new-empty-d1' &&
      failingStep(nonempty)?.code === 'destination-d1-not-empty' &&
      nonempty.steps.slice(4).every((step) => step.status === 'pending'),
    'a nonempty or unproven destination reached a write step',
  )

  const partial = await executePortableImportRestore({
    plan,
    exportDirectory: options.outputDirectory,
    destinationManifestPath: options.destinationManifestPath,
    adapter: options.harness.createAdapter('partial-restore'),
    now: () => iso(startedAt + 240_000),
  })
  assertion(
    partial.status === 'failed' &&
      partial.steps[5]?.status === 'succeeded' &&
      partial.steps[6]?.status === 'failed' &&
      partial.steps[6]?.code === 'r2-restore-failed' &&
      partial.steps.slice(7).every((step) => step.status === 'pending'),
    'a partial restore did not fail closed before later effects',
  )

  return portableRestoreConformanceReportSchema.parse({
    formatVersion: 1,
    profile: 'f42-portable-restore-v1',
    release: options.release,
    scenarios: portableRestoreConformanceScenarioIdSchema.options.map(
      (id) => ({ id, status: 'passed' as const }),
    ),
  })
}
