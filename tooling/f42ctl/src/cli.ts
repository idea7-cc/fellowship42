#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deploymentManifestSchema } from '@fellowship42/management-protocol'
import { doctorFromFiles } from './doctor.js'
import { buildDeployPlan } from './plan.js'
import { assemblePortableExport, verifyPortableExport } from './portable-export.js'

function usage(): never {
  throw new Error(
    'Usage: f42ctl plan --manifest <file> [--output <file>] | f42ctl doctor --manifest <file> [--wrangler <file>] [--migrations <dir>] [--runtime <url>] [--offline] [--output <file>] | f42ctl export --manifest <file> --d1 <file> --r2-index <file> --r2-root <dir> --directory <new-dir> --quiesced-at <iso-date> [--exported-at <iso-date>] [--output <file>] | f42ctl verify-export --directory <dir> [--verified-at <iso-date>] [--evidence-id <uuid>] [--output <file>]',
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
