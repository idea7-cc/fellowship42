#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deploymentManifestSchema } from '@fellowship42/management-protocol'
import { doctorFromFiles } from './doctor.js'
import { buildDeployPlan } from './plan.js'
import { assemblePortableExport, verifyPortableExport } from './portable-export.js'
import { buildPortableImportPlan, verifyCutoverApproval } from './portable-import.js'
import {
  buildExitPacket,
  createExitPacketVerificationEvidence,
} from './exit-packet.js'

function usage(): never {
  throw new Error(
    'Usage: f42ctl plan --manifest <file> [--output <file>] | f42ctl doctor --manifest <file> [--wrangler <file>] [--migrations <dir>] [--runtime <url>] [--offline] [--output <file>] | f42ctl export --manifest <file> --d1 <file> --r2-index <file> --r2-root <dir> --directory <new-dir> --quiesced-at <iso-date> [--exported-at <iso-date>] [--output <file>] | f42ctl verify-export --directory <dir> [--verified-at <iso-date>] [--evidence-id <uuid>] [--output <file>] | f42ctl plan-import --directory <export-dir> --destination <manifest> [--operation-id <uuid>] [--generated-at <iso-date>] [--output <file>] | f42ctl verify-cutover --plan <file> --destination <manifest> --approval <file> [--output <file>] | f42ctl build-exit-packet --plan <file> --report <file> --approval <file> --export-evidence <file> --management-disposition <file> --handoff <file> [--packet-id <uuid>] [--generated-at <iso-date>] [--output <file>] | f42ctl verify-exit-packet --packet <file> --plan <file> --report <file> --approval <file> --export-evidence <file> --management-disposition <file> --handoff <file> [--evidence-id <uuid>] [--verified-at <iso-date>] [--output <file>]',
  )
}

function argumentsFor(values: string[], allowed: ReadonlySet<string>) {
  const options = new Map<string, string | true>()
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    if (!key?.startsWith('--') || !allowed.has(key) || options.has(key)) usage()
    if (key === '--offline') {
      options.set(key, true)
      continue
    }
    const value = values[index + 1]
    if (!value || value.startsWith('--')) usage()
    options.set(key, value)
    index += 1
  }
  return options
}

async function emit(value: unknown, output?: string) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`
  if (output) await writeFile(output, serialized, { flag: 'wx' })
  else process.stdout.write(serialized)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (!command) usage()
  const allowed = command === 'plan'
    ? new Set(['--manifest', '--output'])
    : command === 'doctor'
      ? new Set([
            '--manifest',
            '--wrangler',
            '--migrations',
            '--runtime',
            '--offline',
            '--output',
          ])
      : command === 'export'
        ? new Set([
            '--manifest',
            '--d1',
            '--r2-index',
            '--r2-root',
            '--directory',
            '--quiesced-at',
            '--exported-at',
            '--output',
          ])
        : command === 'verify-export'
          ? new Set([
              '--directory',
              '--verified-at',
              '--evidence-id',
              '--output',
            ])
          : command === 'plan-import'
            ? new Set([
                '--directory',
                '--destination',
                '--operation-id',
                '--generated-at',
                '--output',
              ])
            : command === 'verify-cutover'
              ? new Set([
                  '--plan',
                  '--destination',
                  '--approval',
                  '--output',
                ])
              : command === 'build-exit-packet'
                ? new Set([
                    '--plan', '--report', '--approval', '--export-evidence',
                    '--management-disposition', '--handoff', '--packet-id',
                    '--generated-at', '--output',
                  ])
                : command === 'verify-exit-packet'
                  ? new Set([
                      '--packet', '--plan', '--report', '--approval',
                      '--export-evidence', '--management-disposition',
                      '--handoff', '--evidence-id', '--verified-at', '--output',
                    ])
          : usage()
  const options = argumentsFor(rest, allowed)
  const output = options.get('--output')
  if (output !== undefined && typeof output !== 'string') usage()

  if (command === 'verify-export') {
    const directory = options.get('--directory')
    const verifiedAt = options.get('--verified-at')
    const evidenceId = options.get('--evidence-id')
    if (
      typeof directory !== 'string' ||
      (verifiedAt !== undefined && typeof verifiedAt !== 'string') ||
      (evidenceId !== undefined && typeof evidenceId !== 'string')
    ) usage()
    await emit(
      await verifyPortableExport({ directory, verifiedAt, evidenceId }),
      output,
    )
    return
  }
  if (command === 'plan-import') {
    const directory = options.get('--directory')
    const destinationManifestPath = options.get('--destination')
    const operationId = options.get('--operation-id')
    const generatedAt = options.get('--generated-at')
    if (
      typeof directory !== 'string' ||
      typeof destinationManifestPath !== 'string' ||
      (operationId !== undefined && typeof operationId !== 'string') ||
      (generatedAt !== undefined && typeof generatedAt !== 'string')
    ) usage()
    await emit(
      await buildPortableImportPlan({
        exportDirectory: directory,
        destinationManifestPath,
        operationId,
        generatedAt,
      }),
      output,
    )
    return
  }
  if (command === 'verify-cutover') {
    const planPath = options.get('--plan')
    const destinationPath = options.get('--destination')
    const approvalPath = options.get('--approval')
    if (
      typeof planPath !== 'string' ||
      typeof destinationPath !== 'string' ||
      typeof approvalPath !== 'string'
    ) usage()
    await emit(
      verifyCutoverApproval(
        JSON.parse(await readFile(planPath, 'utf8')),
        JSON.parse(await readFile(destinationPath, 'utf8')),
        JSON.parse(await readFile(approvalPath, 'utf8')),
      ),
      output,
    )
    return
  }
  if (command === 'build-exit-packet' || command === 'verify-exit-packet') {
    const paths = {
      plan: options.get('--plan'),
      report: options.get('--report'),
      approval: options.get('--approval'),
      exportEvidence: options.get('--export-evidence'),
      managementDisposition: options.get('--management-disposition'),
      handoff: options.get('--handoff'),
    }
    if (Object.values(paths).some((value) => typeof value !== 'string')) usage()
    const inputs = {
      plan: JSON.parse(await readFile(paths.plan as string, 'utf8')),
      report: JSON.parse(await readFile(paths.report as string, 'utf8')),
      approval: JSON.parse(await readFile(paths.approval as string, 'utf8')),
      exportEvidence: JSON.parse(await readFile(paths.exportEvidence as string, 'utf8')),
      managementDisposition: JSON.parse(
        await readFile(paths.managementDisposition as string, 'utf8'),
      ),
      handoff: JSON.parse(await readFile(paths.handoff as string, 'utf8')),
    }
    if (command === 'build-exit-packet') {
      const packetId = options.get('--packet-id')
      const generatedAt = options.get('--generated-at')
      if (
        (packetId !== undefined && typeof packetId !== 'string') ||
        (generatedAt !== undefined && typeof generatedAt !== 'string')
      ) usage()
      await emit(buildExitPacket({ inputs, packetId, generatedAt }), output)
      return
    }
    const packetPath = options.get('--packet')
    const evidenceId = options.get('--evidence-id')
    const verifiedAt = options.get('--verified-at')
    if (
      typeof packetPath !== 'string' ||
      (evidenceId !== undefined && typeof evidenceId !== 'string') ||
      (verifiedAt !== undefined && typeof verifiedAt !== 'string')
    ) usage()
    await emit(
      createExitPacketVerificationEvidence({
        packet: JSON.parse(await readFile(packetPath, 'utf8')),
        inputs,
        evidenceId,
        verifiedAt,
      }),
      output,
    )
    return
  }

  const manifestPath = options.get('--manifest')
  if (typeof manifestPath !== 'string') usage()

  if (command === 'plan') {
    const manifest = deploymentManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, 'utf8')),
    )
    await emit(buildDeployPlan(manifest), output)
    return
  }
  if (command === 'doctor') {
    const root = process.cwd()
    const wrangler = options.get('--wrangler')
    const migrations = options.get('--migrations')
    const runtime = options.get('--runtime')
    const report = await doctorFromFiles({
      manifestPath,
      wranglerPath:
        typeof wrangler === 'string'
          ? wrangler
          : path.join(root, 'apps/instance/wrangler.jsonc'),
      migrationsPath:
        typeof migrations === 'string'
          ? migrations
          : path.join(root, 'apps/instance/migrations'),
      runtimeUrl: typeof runtime === 'string' ? runtime : undefined,
      offline: options.get('--offline') === true,
    })
    await emit(report, output)
    if (report.status === 'failed') process.exitCode = 2
    return
  }
  if (command === 'export') {
    const d1ExportPath = options.get('--d1')
    const r2SourceIndexPath = options.get('--r2-index')
    const r2SourceRoot = options.get('--r2-root')
    const outputDirectory = options.get('--directory')
    const quiescedAt = options.get('--quiesced-at')
    const exportedAt = options.get('--exported-at')
    if (
      typeof d1ExportPath !== 'string' ||
      typeof r2SourceIndexPath !== 'string' ||
      typeof r2SourceRoot !== 'string' ||
      typeof outputDirectory !== 'string' ||
      typeof quiescedAt !== 'string' ||
      (exportedAt !== undefined && typeof exportedAt !== 'string')
    ) usage()
    await emit(
      await assemblePortableExport({
        deploymentManifestPath: manifestPath,
        d1ExportPath,
        r2SourceIndexPath,
        r2SourceRoot,
        outputDirectory,
        quiescedAt,
        exportedAt,
      }),
      output,
    )
    return
  }
  usage()
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unexpected f42ctl error'}\n`,
  )
  process.exitCode = 1
})
