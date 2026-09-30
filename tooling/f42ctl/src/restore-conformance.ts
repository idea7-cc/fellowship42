import { appendFile, cp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  portableRestoreConformanceReportSchema,
  portableRestoreConformanceScenarioIdsFor,
  r2ExportIndexSchema,
  type ImportStepKind,
  type PortableRestoreConformanceReport,
} from '@fellowship42/management-protocol'
import {
  assemblePortableExport,
  verifyPortableExport,
  type WebsiteExportSources,
} from './portable-export.js'
import {
  buildPortableImportPlan,
  executePortableImportRestore,
  type PortableImportAdapter,
} from './portable-import.js'

export type RestoreConformanceAdapterScenario =
  'isolated-restore' | 'nonempty-destination' | 'partial-restore'

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
  /**
   * The website capture. Required exactly when the source and destination
   * manifests declare a website; adds the `website-restored` scenario.
   */
  website?: WebsiteExportSources
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

type ImportReport = Awaited<ReturnType<typeof executePortableImportRestore>>

function failingStep(report: ImportReport) {
  return report.steps.find((step) => step.status === 'failed')
}

function positionOf(report: ImportReport, kind: ImportStepKind) {
  const position = report.steps.findIndex((step) => step.kind === kind)
  assertion(position >= 0, `the import plan has no ${kind} step`)
  return position
}

async function tamperRejected(
  directory: string,
  artifact: string,
  verifiedAt: string,
) {
  const tamperedDirectory = `${directory}.tampered`
  await cp(directory, tamperedDirectory, {
    recursive: true,
    errorOnExist: true,
    force: false,
  })
  try {
    await appendFile(
      path.join(tamperedDirectory, artifact),
      '\n-- tampered by public conformance harness\n',
    )
    await verifyPortableExport({ directory: tamperedDirectory, verifiedAt })
    return false
  } catch {
    return true
  } finally {
    await rm(tamperedDirectory, { recursive: true, force: true })
  }
}

export async function runPortableRestoreConformance(
  options: PortableRestoreConformanceOptions,
): Promise<PortableRestoreConformanceReport> {
  const startedAt = Date.parse(options.startedAt ?? new Date().toISOString())
  if (!Number.isFinite(startedAt)) {
    throw new Error('Restore conformance start time is invalid')
  }
  await assemblePortableExport({
    deploymentManifestPath: options.deploymentManifestPath,
    d1ExportPath: options.d1ExportPath,
    r2SourceIndexPath: options.r2SourceIndexPath,
    r2SourceRoot: options.r2SourceRoot,
    ...(options.website ? { website: options.website } : {}),
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

  for (const artifact of [
    'd1/database.sql',
    ...(options.website ? ['website/d1/database.sql'] : []),
  ]) {
    assertion(
      await tamperRejected(
        options.outputDirectory,
        artifact,
        iso(startedAt + 120_000),
      ),
      `a modified ${artifact} artifact was accepted`,
    )
  }

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
  const cutover = positionOf(successful, 'cutover-domains')
  assertion(
    successful.status === 'awaiting-cutover',
    'isolated restore did not stop at the cutover boundary',
  )
  assertion(
    successful.steps
      .slice(0, cutover)
      .every((step) => step.status === 'succeeded'),
    'an isolated restore step did not succeed',
  )
  assertion(
    successful.steps.slice(cutover).every((step) => step.status === 'pending'),
    'cutover or source mutation ran during isolated restore',
  )
  const website = successful.steps.some(
    (step) => step.kind === 'restore-website-d1',
  )
  assertion(
    website === Boolean(options.website),
    'the website capture and destination manifest disagree',
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
      nonempty.steps
        .slice(positionOf(nonempty, 'verify-new-empty-r2'))
        .every((step) => step.status === 'pending'),
    'a nonempty or unproven destination reached a write step',
  )

  const partial = await executePortableImportRestore({
    plan,
    exportDirectory: options.outputDirectory,
    destinationManifestPath: options.destinationManifestPath,
    adapter: options.harness.createAdapter('partial-restore'),
    now: () => iso(startedAt + 240_000),
  })
  const restoreR2 = positionOf(partial, 'restore-r2')
  assertion(
    partial.status === 'failed' &&
      partial.steps[positionOf(partial, 'restore-d1')]?.status ===
        'succeeded' &&
      partial.steps[restoreR2]?.status === 'failed' &&
      partial.steps[restoreR2]?.code === 'r2-restore-failed' &&
      partial.steps
        .slice(restoreR2 + 1)
        .every((step) => step.status === 'pending'),
    'a partial restore did not fail closed before later effects',
  )

  return portableRestoreConformanceReportSchema.parse({
    formatVersion: 1,
    profile: 'f42-portable-restore-v1',
    release: options.release,
    scenarios: portableRestoreConformanceScenarioIdsFor(website).map((id) => ({
      id,
      status: 'passed' as const,
    })),
  })
}
