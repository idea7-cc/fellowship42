import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  deployPlanSchema,
  deploymentManifestSchema,
  doctorReportSchema,
} from '@fellowship42/management-protocol'
import { inspectDeployment, verifyPublishedRelease } from './doctor'
import { buildDeployPlan } from './plan'

const execFileAsync = promisify(execFile)

const manifest = deploymentManifestSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../examples/deployment-manifest.local.json', import.meta.url),
      'utf8',
    ),
  ),
)

const wrangler = {
  name: 'fellowship42',
  d1_databases: [{ binding: 'DB', database_name: 'fellowship42' }],
  r2_buckets: [{ binding: 'MEDIA', bucket_name: 'fellowship42-media' }],
  queues: {
    producers: [{ binding: 'OUTBOX_QUEUE', queue: 'fellowship42-outbox' }],
    consumers: [
      {
        queue: 'fellowship42-outbox',
        dead_letter_queue: 'fellowship42-outbox-dlq',
      },
    ],
  },
  durable_objects: {
    bindings: [{ name: 'CHURCH_ROOMS', class_name: 'ChurchRoom' }],
  },
  triggers: { crons: ['*/1 * * * *'] },
  vars: { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' },
}

describe('f42ctl deployment planning', () => {
  it('rejects provider IDs, unknown fields, mismatched releases, and shared queues', () => {
    for (const invalid of [
      { ...manifest, cloudflareAccountId: 'provider-id' },
      {
        ...manifest,
        instance: {
          ...manifest.instance,
          release: { ...manifest.instance.release, tag: 'v0.5.0' },
        },
      },
      {
        ...manifest,
        resources: {
          ...manifest.resources,
          outboxQueue: {
            ...manifest.resources.outboxQueue,
            deadLetterName: manifest.resources.outboxQueue.name,
          },
        },
      },
    ]) {
      expect(deploymentManifestSchema.safeParse(invalid).success).toBe(false)
    }
  })

  it('produces a stable, dependency-ordered, non-destructive plan', () => {
    const first = buildDeployPlan(manifest)
    const reordered = buildDeployPlan({
      configuration: manifest.configuration,
      resources: manifest.resources,
      worker: manifest.worker,
      target: manifest.target,
      custody: manifest.custody,
      instance: manifest.instance,
      formatVersion: manifest.formatVersion,
    })

    expect(first).toEqual(reordered)
    expect(first.steps).toHaveLength(11)
    expect(first.steps.every((step) => step.destructive === false)).toBe(true)
    expect(first.steps.at(-1)).toMatchObject({
      kind: 'verify-runtime',
      dependsOn: ['step-10'],
    })
    expect(
      deployPlanSchema.safeParse({
        ...first,
        steps: first.steps.slice(0, -1),
      }).success,
    ).toBe(false)
  })

  it('emits clean JSON and rejects unknown CLI options', async () => {
    const cliPath = path.resolve('dist/cli.js')
    const manifestPath = path.resolve(
      'examples/deployment-manifest.local.json',
    )
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      cliPath,
      'plan',
      '--manifest',
      manifestPath,
    ])

    expect(stderr).toBe('')
    expect(JSON.parse(stdout).steps).toHaveLength(11)
    await expect(
      execFileAsync(process.execPath, [
        cliPath,
        'plan',
        '--manifest',
        manifestPath,
        '--offline',
      ]),
    ).rejects.toMatchObject({ code: 1 })
  })
})

describe('f42ctl doctor', () => {
  it('returns a bounded attention report when local shape matches but runtime checks are absent', async () => {
    const report = await inspectDeployment({
      manifest,
      wrangler,
      migrationFiles: [
        '0001_initial.sql',
        '0002_instance_identity.sql',
        '0003_directory_concurrency.sql',
        '0004_ministry_content_concurrency.sql',
        '0005_contribution_delivery_hardening.sql',
      ],
      releaseCheck: { status: 'pass', code: 'release-verified' },
      checkedAt: '2026-07-19T19:30:00.000Z',
    })

    expect(doctorReportSchema.parse(report)).toEqual(report)
    expect(report.status).toBe('attention')
    expect(report.checks.filter((check) => check.status === 'fail')).toEqual([])
    expect(JSON.stringify(report)).not.toContain('provider-id')
  })

  it('fails closed on binding, schema, and runtime mismatch', async () => {
    const report = await inspectDeployment({
      manifest,
      wrangler: { ...wrangler, r2_buckets: [] },
      migrationFiles: ['0004_ministry_content_concurrency.sql'],
      runtimeHealth: { status: 'degraded', service: 'wrong-service' },
      releaseCheck: { status: 'fail', code: 'release-digest-mismatch' },
      checkedAt: '2026-07-19T19:30:00.000Z',
    })

    expect(report.status).toBe('failed')
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'release-manifest', status: 'fail' }),
        expect.objectContaining({ id: 'schema-version', status: 'fail' }),
        expect.objectContaining({ id: 'r2-binding', status: 'fail' }),
        expect.objectContaining({ id: 'runtime-health', status: 'fail' }),
      ]),
    )
  })

  it('verifies published manifest bytes and compatibility without trusting redirects or branches', async () => {
    const published = {
      formatVersion: 1,
      application: {
        name: 'fellowship42',
        version: '0.6.0',
        schemaVersion: 5,
      },
      managementProtocol: {
        package: '@fellowship42/management-protocol',
        packageVersion: '0.2.0',
        wireVersion: '1',
      },
      source: {
        repository: 'https://github.com/idea7-cc/fellowship42',
        commit: '4ec2f8b34b4a6b2938b0f3d1d6924daab4587ae1',
        committedAt: '2026-07-19T15:22:54-04:00',
      },
      artifacts: [
        {
          file: 'fellowship42-0.6.0-source.tgz',
          kind: 'portable-instance-source',
          bytes: 1,
          sha256: 'a'.repeat(64),
        },
        {
          file: 'fellowship42-management-protocol-0.2.0.tgz',
          kind: 'management-protocol-package',
          bytes: 1,
          sha256: 'b'.repeat(64),
        },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(published))
    const withDigest = {
      ...manifest,
      instance: {
        ...manifest.instance,
        release: {
          ...manifest.instance.release,
          manifestSha256: createHash('sha256').update(bytes).digest('hex'),
        },
      },
    }
    const result = await verifyPublishedRelease(
      deploymentManifestSchema.parse(withDigest),
      async () => new Response(bytes, { status: 200 }),
    )
    expect(result).toEqual({ status: 'pass', code: 'release-verified' })
  })

  it('rejects an oversized or unexpected source manifest', async () => {
    const oversized = await verifyPublishedRelease(
      manifest,
      async () =>
        new Response('small', {
          status: 200,
          headers: { 'content-length': String(64 * 1024 + 1) },
        }),
    )
    expect(oversized).toEqual({
      status: 'fail',
      code: 'release-manifest-too-large',
    })

    const published = {
      formatVersion: 1,
      application: {
        name: 'fellowship42',
        version: '0.6.0',
        schemaVersion: 5,
      },
      managementProtocol: {
        package: '@fellowship42/management-protocol',
        packageVersion: '0.2.0',
        wireVersion: '1',
      },
      source: {
        repository: 'https://github.com/idea7-cc/fellowship42',
        commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        committedAt: '2026-07-19T15:22:54-04:00',
      },
      artifacts: [
        {
          file: 'fellowship42-0.6.0-source.tgz',
          kind: 'portable-instance-source',
          bytes: 1,
          sha256: 'a'.repeat(64),
        },
        {
          file: 'fellowship42-management-protocol-0.2.0.tgz',
          kind: 'management-protocol-package',
          bytes: 1,
          sha256: 'b'.repeat(64),
        },
      ],
    }
    const bytes = new TextEncoder().encode(JSON.stringify(published))
    const withDigest = deploymentManifestSchema.parse({
      ...manifest,
      instance: {
        ...manifest.instance,
        release: {
          ...manifest.instance.release,
          manifestSha256: createHash('sha256').update(bytes).digest('hex'),
        },
      },
    })
    expect(
      await verifyPublishedRelease(
        withDigest,
        async () => new Response(bytes, { status: 200 }),
      ),
    ).toEqual({ status: 'fail', code: 'release-version-mismatch' })
  })
})
