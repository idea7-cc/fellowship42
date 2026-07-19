#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deploymentManifestSchema } from '@fellowship42/management-protocol'
import { doctorFromFiles } from './doctor.js'
import { buildDeployPlan } from './plan.js'

function usage(): never {
  throw new Error(
    'Usage: f42ctl plan --manifest <file> [--output <file>] | f42ctl doctor --manifest <file> [--wrangler <file>] [--migrations <dir>] [--runtime <url>] [--offline] [--output <file>]',
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
  const allowed =
    command === 'plan'
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
        : usage()
  const options = argumentsFor(rest, allowed)
  const manifestPath = options.get('--manifest')
  if (typeof manifestPath !== 'string') usage()
  const output = options.get('--output')
  if (output !== undefined && typeof output !== 'string') usage()

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
  usage()
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unexpected f42ctl error'}\n`,
  )
  process.exitCode = 1
})
