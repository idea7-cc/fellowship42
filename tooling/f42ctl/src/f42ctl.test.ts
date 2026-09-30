import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  deployPlanSchema,
  deploymentManifestSchema,
  doctorReportSchema,
  instanceDoctorCheckIds,
  importStepKindsFor,
  isWebsiteImportStepKind,
  migrationRehearsalEvidenceSchema,
  portableConfigurationSchema,
  websiteDoctorCheckIds,
  type DestinationImportPreflight,
  type DeploymentManifest,
} from '@fellowship42/management-protocol'
import {
  doctorFromFiles,
  healthObservationFromDoctorReport,
  inspectDeployment,
  verifyPublishedRelease,
} from './doctor'
import { buildDeployPlan } from './plan'
import { assemblePortableExport, verifyPortableExport } from './portable-export'
import {
  buildPortableImportPlan,
  executePortableCutover,
  executePortableImportRestore,
  installationDomains,
  verifyCutoverApproval,
  type PortableImportAdapter,
} from './portable-import'
import { buildMigrationRehearsalEvidence } from './rehearsal'

const execFileAsync = promisify(execFile)

const manifest = deploymentManifestSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../examples/deployment-manifest.local.json', import.meta.url),
      'utf8',
    ),
  ),
)

const websiteManifest = deploymentManifestSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../examples/deployment-manifest.website.json', import.meta.url),
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
  vars: {
    ACCESS_TEAM_DOMAIN: '',
    ACCESS_AUD: '',
    F42_PORTABLE_INSTANCE_ID: 'instance_42424242-1234-5678-9abc-123456789abc',
    F42_RELEASE_TAG: manifest.instance.release.tag,
    F42_RELEASE_MANIFEST_SHA256: manifest.instance.release.manifestSha256,
  },
}

function publishedRelease(commit: string) {
  const release = manifest.instance.release
  return {
    formatVersion: 1,
    application: {
      name: 'fellowship42',
      version: release.applicationVersion,
      schemaVersion: release.schemaVersion,
    },
    managementProtocol: {
      package: '@fellowship42/management-protocol',
      packageVersion: release.managementProtocolPackageVersion,
      wireVersion: release.managementProtocolWireVersion,
    },
    source: {
      repository: 'https://github.com/idea7-cc/fellowship42',
      commit,
      committedAt: '2026-07-19T15:22:54-04:00',
    },
    artifacts: [
      {
        file: `fellowship42-${release.applicationVersion}-source.tgz`,
        kind: 'portable-instance-source',
        bytes: 1,
        sha256: 'a'.repeat(64),
      },
      {
        file: `fellowship42-management-protocol-${release.managementProtocolPackageVersion}.tgz`,
        kind: 'management-protocol-package',
        bytes: 1,
        sha256: 'b'.repeat(64),
      },
    ],
  }
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
    const manifestPath = path.resolve('examples/deployment-manifest.local.json')
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
      migrationFiles: ['0001_initial.sql'],
      releaseCheck: { status: 'pass', code: 'release-verified' },
      checkedAt: '2026-07-19T19:30:00.000Z',
    })

    expect(doctorReportSchema.parse(report)).toEqual(report)
    expect(report.status).toBe('attention')
    expect(report.checks.filter((check) => check.status === 'fail')).toEqual([])
    expect(JSON.stringify(report)).not.toContain('provider-id')
  })

  it('binds pre-owner runtime readiness to the manifest portable identity', async () => {
    const portableIdentitySha256 = createHash('sha256')
      .update(manifest.instance.id)
      .digest('hex')
    const report = await inspectDeployment({
      manifest,
      wrangler,
      migrationFiles: ['0001_initial.sql'],
      runtimeHealth: {
        status: 'ok',
        service: 'fellowship42-instance',
        topology: 'single-church',
        storage: 'd1',
        outbox: 'clear',
        paymentWebhooks: 'unconfigured',
        bootstrap: {
          state: 'awaiting-owner-configuration',
          portableIdentitySha256,
        },
      },
      releaseCheck: { status: 'pass', code: 'release-verified' },
      checkedAt: '2026-07-19T19:30:00.000Z',
    })

    expect(report.checks).toEqual(
      expect.arrayContaining([
        {
          id: 'portable-identity',
          status: 'pass',
          code: 'identity-runtime-matches',
        },
        {
          id: 'runtime-health',
          status: 'pass',
          code: 'runtime-healthy',
        },
      ]),
    )

    expect(
      healthObservationFromDoctorReport(report, {
        runtimeHealth: {
          status: 'ok',
          service: 'fellowship42-instance',
          topology: 'single-church',
          storage: 'd1',
          outbox: 'clear',
          paymentWebhooks: 'unconfigured',
          bootstrap: {
            state: 'awaiting-owner-configuration',
            portableIdentitySha256,
          },
        },
      }),
    ).toMatchObject({
      formatVersion: 1,
      portableInstanceId: manifest.instance.id,
      observedAt: '2026-07-19T19:30:00.000Z',
      source: 'instance-doctor',
      release: {
        applicationVersion: manifest.instance.release.applicationVersion,
        schemaVersion: manifest.instance.release.schemaVersion,
        managementProtocolWireVersion:
          manifest.instance.release.managementProtocolWireVersion,
      },
      connection: { status: 'unknown', grantVersion: null },
      checks: {
        database: 'ready',
        objectStorage: 'ready',
        authentication: 'ready',
        migrations: 'current',
        realtime: 'ready',
        paymentWebhooks: 'unconfigured',
        outbox: 'clear',
      },
      traffic: {
        availability: 'unknown',
        errorRate: 'unknown',
        latency: 'unknown',
        window: 'unknown',
      },
    })
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
    const published = publishedRelease(manifest.instance.release.sourceCommit)
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

    const published = publishedRelease('a'.repeat(40))
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

describe('f42ctl portable export', () => {
  it('assembles and verifies an identity-bound export without logging payloads', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-export-'))
    try {
      const source = path.join(root, 'source')
      await mkdir(path.join(source, 'r2'), { recursive: true })
      const manifestPath = path.join(source, 'deployment.json')
      const d1Path = path.join(source, 'database.sql')
      const indexPath = path.join(source, 'r2-source.json')
      await writeFile(manifestPath, JSON.stringify(manifest))
      await writeFile(
        d1Path,
        `CREATE TABLE instance_metadata (instance_id TEXT);\nINSERT INTO instance_metadata VALUES ('${manifest.instance.id}');\n-- private member payload`,
      )
      await writeFile(
        path.join(source, 'r2/first.bin'),
        'private media payload',
      )
      await writeFile(
        indexPath,
        JSON.stringify({
          formatVersion: 1,
          objects: [
            { key: 'sermons/first.bin', file: 'r2/first.bin' },
            { key: 'sermons/copy.bin', file: 'r2/first.bin' },
          ],
        }),
      )
      const output = path.join(root, 'bundle')
      const assembled = await assemblePortableExport({
        deploymentManifestPath: manifestPath,
        d1ExportPath: d1Path,
        r2SourceIndexPath: indexPath,
        r2SourceRoot: source,
        outputDirectory: output,
        quiescedAt: '2026-07-19T21:00:00.000Z',
        exportedAt: '2026-07-19T21:01:00.000Z',
      })
      const evidence = await verifyPortableExport({
        directory: output,
        verifiedAt: '2026-07-19T21:02:00.000Z',
        evidenceId: '42424242-1234-4678-9abc-123456789abc',
      })

      expect(assembled.instanceId).toBe(manifest.instance.id)
      expect(evidence.verificationStatus).toBe('verified')
      expect(JSON.stringify(evidence)).not.toContain('private')
      const cli = await execFileAsync(process.execPath, [
        path.resolve('dist/cli.js'),
        'verify-export',
        '--directory',
        output,
        '--verified-at',
        '2026-07-19T21:03:00.000Z',
        '--evidence-id',
        '42424242-1234-4678-9abc-123456789abd',
      ])
      expect(cli.stderr).toBe('')
      expect(JSON.parse(cli.stdout)).toMatchObject({
        instanceId: manifest.instance.id,
        verificationStatus: 'verified',
      })
      expect(cli.stdout).not.toContain('private')
      expect(
        (await readFile(path.join(output, 'r2/index.json'), 'utf8')).match(
          /r2\/objects\//g,
        ),
      ).toHaveLength(2)
      const objectFiles = await import('node:fs/promises').then(({ readdir }) =>
        readdir(path.join(output, 'r2/objects')),
      )
      expect(objectFiles).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects tampering, extra files, and mismatched D1 identity', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-export-invalid-'))
    try {
      const manifestPath = path.join(root, 'deployment.json')
      const d1Path = path.join(root, 'database.sql')
      const indexPath = path.join(root, 'r2-source.json')
      await writeFile(manifestPath, JSON.stringify(manifest))
      await writeFile(
        d1Path,
        'CREATE TABLE instance_metadata (instance_id TEXT);',
      )
      await writeFile(
        indexPath,
        JSON.stringify({ formatVersion: 1, objects: [] }),
      )
      await expect(
        assemblePortableExport({
          deploymentManifestPath: manifestPath,
          d1ExportPath: d1Path,
          r2SourceIndexPath: indexPath,
          r2SourceRoot: root,
          outputDirectory: path.join(root, 'rejected'),
          quiescedAt: '2026-07-19T21:00:00.000Z',
          exportedAt: '2026-07-19T21:01:00.000Z',
        }),
      ).rejects.toThrow('portable instance identity')

      await writeFile(d1Path, `instance_metadata ${manifest.instance.id}`)
      const output = path.join(root, 'bundle')
      await assemblePortableExport({
        deploymentManifestPath: manifestPath,
        d1ExportPath: d1Path,
        r2SourceIndexPath: indexPath,
        r2SourceRoot: root,
        outputDirectory: output,
        quiescedAt: '2026-07-19T21:00:00.000Z',
        exportedAt: '2026-07-19T21:01:00.000Z',
      })
      await writeFile(path.join(output, 'unexpected.txt'), 'not referenced')
      await expect(verifyPortableExport({ directory: output })).rejects.toThrow(
        'unreferenced',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('f42ctl portable import and cutover planning', () => {
  it('binds a complete plan and approval to a verified export and new destination shape', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-import-'))
    try {
      const sourceManifestPath = path.join(root, 'source-deployment.json')
      const d1Path = path.join(root, 'database.sql')
      const r2IndexPath = path.join(root, 'r2-source.json')
      const bundle = path.join(root, 'export')
      await writeFile(sourceManifestPath, JSON.stringify(manifest))
      await writeFile(d1Path, `instance_metadata ${manifest.instance.id}`)
      await writeFile(path.join(root, 'media.bin'), 'restored media')
      await writeFile(
        r2IndexPath,
        JSON.stringify({
          formatVersion: 1,
          objects: [{ key: 'sermons/restored.bin', file: 'media.bin' }],
        }),
      )
      await assemblePortableExport({
        deploymentManifestPath: sourceManifestPath,
        d1ExportPath: d1Path,
        r2SourceIndexPath: r2IndexPath,
        r2SourceRoot: root,
        outputDirectory: bundle,
        quiescedAt: '2026-07-19T21:00:00.000Z',
        exportedAt: '2026-07-19T21:01:00.000Z',
      })
      const destination = deploymentManifestSchema.parse({
        ...manifest,
        target: {
          ...manifest.target,
          environment: 'production',
          accountAlias: 'destination-account',
        },
        worker: { name: 'fellowship42-restored', domains: ['new.example.org'] },
        resources: {
          ...manifest.resources,
          d1: { ...manifest.resources.d1, name: 'fellowship42-restored' },
          r2: { ...manifest.resources.r2, name: 'fellowship42-media-restored' },
          outboxQueue: {
            ...manifest.resources.outboxQueue,
            name: 'fellowship42-outbox-restored',
            deadLetterName: 'fellowship42-outbox-restored-dlq',
          },
        },
        configuration: {
          ...manifest.configuration,
          accessTeamDomain: 'https://fellowship42.cloudflareaccess.com',
          accessAudienceConfigured: true,
        },
      })
      const destinationPath = path.join(root, 'destination.json')
      await writeFile(destinationPath, JSON.stringify(destination))
      const operationId = '42424242-1234-4678-9abc-123456789abc'
      const plan = await buildPortableImportPlan({
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        operationId,
        generatedAt: '2026-07-19T22:00:00.000Z',
      })

      expect(plan.steps).toHaveLength(17)
      expect(plan.steps.slice(3, 5)).toEqual([
        expect.objectContaining({
          kind: 'verify-new-empty-d1',
          risk: 'read-only',
        }),
        expect.objectContaining({
          kind: 'verify-new-empty-r2',
          risk: 'read-only',
        }),
      ])
      expect(
        plan.steps
          .filter((step) => step.approvalRequired)
          .map((step) => step.kind),
      ).toEqual(['cutover-domains', 'retire-source-routing'])
      const approval = {
        formatVersion: 1,
        operationId,
        instanceId: manifest.instance.id,
        exportManifestSha256: plan.exportManifestSha256,
        destinationManifestSha256: plan.destinationManifestSha256,
        approvedAt: '2026-07-19T22:30:00.000Z',
        approvedBy: 'user:operator_42',
        sourceVerifiedAt: '2026-07-19T22:20:00.000Z',
        destinationVerifiedAt: '2026-07-19T22:25:00.000Z',
        credentialDisposition: {
          deployment: 'rotated',
          applicationSecrets: 'rotated',
          management: 'disconnected',
        },
        domains: destination.worker.domains,
        rollbackDeadline: '2026-07-20T22:30:00.000Z',
      }
      expect(verifyCutoverApproval(plan, destination, approval)).toEqual(
        approval,
      )
      const planPath = path.join(root, 'import-plan.json')
      const approvalPath = path.join(root, 'cutover-approval.json')
      await writeFile(planPath, JSON.stringify(plan))
      await writeFile(approvalPath, JSON.stringify(approval))
      const approvalCli = await execFileAsync(process.execPath, [
        path.resolve('dist/cli.js'),
        'verify-cutover',
        '--plan',
        planPath,
        '--destination',
        destinationPath,
        '--approval',
        approvalPath,
      ])
      expect(JSON.parse(approvalCli.stdout)).toEqual(approval)

      const events: string[] = []
      const adapter: PortableImportAdapter = {
        async preflight() {
          events.push('preflight')
          return {
            formatVersion: 1,
            operationId,
            instanceId: manifest.instance.id,
            destinationManifestSha256: plan.destinationManifestSha256,
            observedAt: '2026-07-19T22:01:00.000Z',
            d1: {
              state: 'empty',
              createdAt: '2026-07-19T22:00:30.000Z',
            },
            r2: {
              state: 'empty',
              createdAt: '2026-07-19T22:00:30.000Z',
            },
            worker: 'absent',
            outboxQueue: 'absent',
            deadLetterQueue: 'absent',
            durableObjectNamespace: 'absent',
          }
        },
        async restoreD1() {
          events.push('restore-d1')
        },
        async restoreR2Object(input) {
          events.push(`restore-r2:${input.key}`)
        },
        async applyForwardMigrations() {
          events.push('migrate')
        },
        async deployWithoutDomains() {
          events.push('deploy-domainless')
        },
        async rotateDeploymentCredentials() {
          events.push('rotate-deployment')
        },
        async rotateApplicationSecrets() {
          events.push('rotate-application')
        },
        async rotateManagementCredentials() {
          events.push('rotate-management')
        },
        async verifyRestoredIdentity() {
          events.push('verify-identity')
          return manifest.instance.id
        },
        async verifyRuntime() {
          events.push('verify-runtime')
          return true
        },
        async cutoverDomains() {
          events.push('cutover')
        },
        async verifyIndependentOperation() {
          events.push('verify-independent')
          return true
        },
        async retireSourceRouting() {
          events.push('retire-source-routing')
        },
      }
      const restored = await executePortableImportRestore({
        plan,
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        adapter,
        now: () => '2026-07-19T22:10:00.000Z',
      })
      expect(restored.status).toBe('awaiting-cutover')
      expect(
        restored.steps
          .slice(0, 14)
          .every((step) => step.status === 'succeeded'),
      ).toBe(true)
      expect(
        restored.steps.slice(14).every((step) => step.status === 'pending'),
      ).toBe(true)
      expect(events).toEqual([
        'preflight',
        'restore-d1',
        'restore-r2:sermons/restored.bin',
        'migrate',
        'deploy-domainless',
        'rotate-deployment',
        'rotate-application',
        'rotate-management',
        'verify-identity',
        'verify-runtime',
      ])
      const completed = await executePortableCutover({
        plan,
        report: restored,
        destinationManifest: destination,
        approval,
        adapter,
        now: () => '2026-07-19T22:31:00.000Z',
      })
      expect(completed.status).toBe('succeeded')
      expect(events.slice(-3)).toEqual([
        'cutover',
        'verify-independent',
        'retire-source-routing',
      ])
      const rehearsalEvidence = buildMigrationRehearsalEvidence({
        plan,
        destinationManifest: destination,
        restoreReport: restored,
        approval,
        completionReport: completed,
        evidenceId: '42424242-1234-4678-9abc-123456789abd',
        sourceCustody: 'fellowship42-hosted',
        observations: {
          exportVerified: true,
          destinationWasNewAndEmpty: true,
          d1RestoredExactly: true,
          r2RestoredExactly: true,
          credentialsRotated: true,
          portableIdentityPreserved: true,
          runtimeHealthy: true,
          cutoverApplied: true,
          independentOperationVerified: true,
          sourceRoutingRetired: true,
        },
      })
      expect(migrationRehearsalEvidenceSchema.parse(rehearsalEvidence)).toEqual(
        rehearsalEvidence,
      )
      expect(rehearsalEvidence.assertions).toHaveLength(10)
      expect(JSON.stringify(rehearsalEvidence)).not.toContain('new.example.org')
      expect(() =>
        buildMigrationRehearsalEvidence({
          plan,
          destinationManifest: destination,
          restoreReport: restored,
          approval,
          completionReport: completed,
          evidenceId: '42424242-1234-4678-9abc-123456789abe',
          sourceCustody: 'fellowship42-hosted',
          observations: {
            exportVerified: true,
            destinationWasNewAndEmpty: true,
            d1RestoredExactly: false,
            r2RestoredExactly: true,
            credentialsRotated: true,
            portableIdentityPreserved: true,
            runtimeHealthy: true,
            cutoverApplied: true,
            independentOperationVerified: true,
            sourceRoutingRetired: true,
          },
        }),
      ).toThrow('Every hosted-to-church-owned rehearsal observation must pass')

      const unsafeEvents: string[] = []
      const unsafeAdapter: PortableImportAdapter = {
        ...adapter,
        async preflight() {
          unsafeEvents.push('preflight')
          return {
            formatVersion: 1,
            operationId,
            instanceId: manifest.instance.id,
            destinationManifestSha256: plan.destinationManifestSha256,
            observedAt: '2026-07-19T22:01:00.000Z',
            d1: { state: 'empty', createdAt: '2026-07-19T21:59:00.000Z' },
            r2: { state: 'empty', createdAt: '2026-07-19T22:00:30.000Z' },
            worker: 'absent',
            outboxQueue: 'absent',
            deadLetterQueue: 'absent',
            durableObjectNamespace: 'absent',
          }
        },
        async restoreD1() {
          unsafeEvents.push('unsafe-write')
        },
      }
      const rejected = await executePortableImportRestore({
        plan,
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        adapter: unsafeAdapter,
        now: () => '2026-07-19T22:10:00.000Z',
      })
      expect(rejected).toMatchObject({
        status: 'failed',
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: 'verify-new-empty-d1',
            status: 'failed',
            code: 'destination-preflight-time-invalid',
          }),
        ]),
      })
      expect(unsafeEvents).toEqual(['preflight'])

      const occupiedEvents: string[] = []
      const occupiedAdapter: PortableImportAdapter = {
        ...adapter,
        async preflight() {
          occupiedEvents.push('preflight')
          return {
            formatVersion: 1,
            operationId,
            instanceId: manifest.instance.id,
            destinationManifestSha256: plan.destinationManifestSha256,
            observedAt: '2026-07-19T22:01:00.000Z',
            d1: {
              state: 'empty',
              createdAt: '2026-07-19T22:00:30.000Z',
            },
            r2: {
              state: 'occupied',
              createdAt: '2026-07-19T22:00:30.000Z',
            },
            worker: 'absent',
            outboxQueue: 'absent',
            deadLetterQueue: 'absent',
            durableObjectNamespace: 'absent',
          }
        },
        async restoreD1() {
          occupiedEvents.push('unsafe-write')
        },
      }
      const occupied = await executePortableImportRestore({
        plan,
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        adapter: occupiedAdapter,
        now: () => '2026-07-19T22:10:00.000Z',
      })
      expect(occupied).toMatchObject({
        status: 'failed',
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: 'verify-new-empty-r2',
            status: 'failed',
            code: 'destination-r2-not-empty',
          }),
        ]),
      })
      expect(occupiedEvents).toEqual(['preflight'])

      const cli = await execFileAsync(process.execPath, [
        path.resolve('dist/cli.js'),
        'plan-import',
        '--directory',
        bundle,
        '--destination',
        destinationPath,
        '--operation-id',
        operationId,
        '--generated-at',
        '2026-07-19T22:00:00.000Z',
      ])
      expect(JSON.parse(cli.stdout)).toEqual(plan)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects identity drift, release drift, and unbound cutover approval', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-import-invalid-'))
    try {
      const sourceManifestPath = path.join(root, 'source.json')
      const d1Path = path.join(root, 'database.sql')
      const indexPath = path.join(root, 'index.json')
      const bundle = path.join(root, 'export')
      await writeFile(sourceManifestPath, JSON.stringify(manifest))
      await writeFile(d1Path, `instance_metadata ${manifest.instance.id}`)
      await writeFile(
        indexPath,
        JSON.stringify({ formatVersion: 1, objects: [] }),
      )
      await assemblePortableExport({
        deploymentManifestPath: sourceManifestPath,
        d1ExportPath: d1Path,
        r2SourceIndexPath: indexPath,
        r2SourceRoot: root,
        outputDirectory: bundle,
        quiescedAt: '2026-07-19T21:00:00.000Z',
        exportedAt: '2026-07-19T21:01:00.000Z',
      })
      const destinationPath = path.join(root, 'destination.json')
      await writeFile(
        destinationPath,
        JSON.stringify({
          ...manifest,
          instance: {
            ...manifest.instance,
            id: 'instance_deadbeef-1234-5678-9abc-123456789abc',
          },
        }),
      )
      await expect(
        buildPortableImportPlan({
          exportDirectory: bundle,
          destinationManifestPath: destinationPath,
          generatedAt: '2026-07-19T22:00:00.000Z',
        }),
      ).rejects.toThrow('preserve')

      await writeFile(
        path.join(root, 'release-drift.json'),
        JSON.stringify({
          ...manifest,
          instance: {
            ...manifest.instance,
            release: {
              ...manifest.instance.release,
              applicationVersion: '0.6.1',
              tag: 'v0.6.1',
              manifestUrl:
                'https://github.com/idea7-cc/fellowship42/releases/download/v0.6.1/release-manifest.json',
            },
          },
        }),
      )
      await expect(
        buildPortableImportPlan({
          exportDirectory: bundle,
          destinationManifestPath: path.join(root, 'release-drift.json'),
          generatedAt: '2026-07-19T22:00:00.000Z',
        }),
      ).rejects.toThrow('exact source and destination release')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

const identitySha256 = createHash('sha256')
  .update(manifest.instance.id)
  .digest('hex')

const websiteWrangler = {
  name: 'fellowship42-website',
  main: './src/worker.ts',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [
    {
      binding: 'DB',
      database_name: 'fellowship42-website',
      database_id: '00000000-0000-0000-0000-000000000000',
    },
  ],
  r2_buckets: [{ binding: 'MEDIA', bucket_name: 'fellowship42-website-media' }],
  kv_namespaces: [{ binding: 'SESSION', id: '0'.repeat(32) }],
  services: [{ binding: 'FELLOWSHIP42', service: 'fellowship42' }],
  routes: [{ pattern: 'www.church.example.test', custom_domain: true }],
  triggers: { crons: ['* * * * *'] },
  vars: {
    EMDASH_SITE_URL: 'https://www.church.example.test',
    FELLOWSHIP42_URL: 'https://app.church.example.test',
    FELLOWSHIP42_INSTANCE_SHA256: identitySha256,
  },
}

const instanceWranglerWithWebsite = {
  ...wrangler,
  routes: [{ pattern: 'app.church.example.test', custom_domain: true }],
  vars: {
    ...wrangler.vars,
    WEBSITE_ORIGIN: 'https://www.church.example.test',
  },
}

const websiteDisposition = {
  encryptionKey: 'preserved',
  setupSecret: 'removed',
  sessionStore: 'recreated',
} as const

async function websiteDoctor(
  instanceOverrides: Record<string, unknown>,
  websiteOverrides: Record<string, unknown>,
  targetManifest: DeploymentManifest = websiteManifest,
) {
  return inspectDeployment({
    manifest: targetManifest,
    wrangler: { ...instanceWranglerWithWebsite, ...instanceOverrides },
    websiteWrangler: { ...websiteWrangler, ...websiteOverrides },
    migrationFiles: ['0001_initial.sql'],
    releaseCheck: { status: 'pass', code: 'release-verified' },
    checkedAt: '2026-07-19T19:30:00.000Z',
  })
}

function checkFor(
  report: Awaited<ReturnType<typeof inspectDeployment>>,
  id: string,
) {
  return report.checks.find((item) => item.id === id)
}

describe('f42ctl website component', () => {
  it('appends website provisioning, deploy, domain, and verification steps', async () => {
    const plan = buildDeployPlan(websiteManifest)
    const { website, ...rest } = websiteManifest
    expect(buildDeployPlan({ website, ...rest })).toEqual(plan)
    expect(plan.steps).toHaveLength(17)
    expect(plan.steps.slice(0, 11)).toEqual(
      buildDeployPlan(rest).steps.slice(0, 11),
    )
    expect(plan.steps.slice(11)).toEqual([
      {
        id: 'step-12',
        kind: 'ensure-website-d1',
        resourceName: 'fellowship42-website',
        dependsOn: ['step-01'],
        destructive: false,
      },
      {
        id: 'step-13',
        kind: 'ensure-website-r2',
        resourceName: 'fellowship42-website-media',
        dependsOn: ['step-01'],
        destructive: false,
      },
      {
        id: 'step-14',
        kind: 'ensure-website-session-kv',
        resourceName: 'fellowship42-website-session',
        dependsOn: ['step-01'],
        destructive: false,
      },
      {
        id: 'step-15',
        kind: 'deploy-website-worker',
        resourceName: 'fellowship42-website',
        dependsOn: ['step-08', 'step-12', 'step-13', 'step-14'],
        destructive: false,
      },
      {
        id: 'step-16',
        kind: 'configure-website-domains',
        resourceName: 'fellowship42-website',
        dependsOn: ['step-15'],
        destructive: false,
      },
      {
        id: 'step-17',
        kind: 'verify-website',
        resourceName: 'fellowship42-website',
        dependsOn: ['step-11', 'step-16'],
        destructive: false,
      },
    ])
    expect(deployPlanSchema.parse(plan)).toEqual(plan)

    const { stdout } = await execFileAsync(process.execPath, [
      path.resolve('dist/cli.js'),
      'plan',
      '--manifest',
      path.resolve('examples/deployment-manifest.website.json'),
    ])
    expect(JSON.parse(stdout)).toEqual(plan)
  })

  it('keeps instance-only doctor evidence to the instance checks', async () => {
    const report = await inspectDeployment({
      manifest,
      wrangler,
      migrationFiles: ['0001_initial.sql'],
      checkedAt: '2026-07-19T19:30:00.000Z',
    })
    expect(report.checks.map(({ id }) => id)).toEqual(instanceDoctorCheckIds)
    await expect(
      inspectDeployment({
        manifest,
        wrangler,
        websiteWrangler,
        migrationFiles: ['0001_initial.sql'],
      }),
    ).rejects.toThrow('manifest without a website')
  })

  it('inspects the website Worker bindings, schedule, domains, and identity pin', async () => {
    const report = await websiteDoctor({}, {})
    expect(doctorReportSchema.parse(report)).toEqual(report)
    expect(report.checks.map(({ id }) => id)).toEqual([
      ...instanceDoctorCheckIds,
      ...websiteDoctorCheckIds,
    ])
    expect(
      report.checks.filter(({ id }) =>
        (websiteDoctorCheckIds as readonly string[]).includes(id),
      ),
    ).toEqual(
      websiteDoctorCheckIds.map((id) =>
        expect.objectContaining({ id, status: 'pass' }),
      ),
    )
    expect(checkFor(report, 'domains')?.status).toBe('pass')
    expect(report.status).toBe('attention')
    expect(JSON.stringify(report)).not.toContain(identitySha256)

    const failures: Array<
      [Record<string, unknown>, Record<string, unknown>, string, string]
    > = [
      [{}, { name: 'fellowship42' }, 'website-worker-name', 'fail'],
      [{}, { d1_databases: [] }, 'website-d1-binding', 'fail'],
      [
        {},
        {
          r2_buckets: [{ binding: 'MEDIA', bucket_name: 'fellowship42-media' }],
        },
        'website-r2-binding',
        'fail',
      ],
      [{}, { kv_namespaces: [] }, 'website-session-kv', 'fail'],
      [
        {},
        { kv_namespaces: [{ binding: 'SESSION' }] },
        'website-session-kv',
        'fail',
      ],
      [
        {},
        { kv_namespaces: [{ binding: 'SESSION', id: '' }] },
        'website-session-kv',
        'fail',
      ],
      [
        {},
        { services: [{ binding: 'FELLOWSHIP42', service: 'another-church' }] },
        'website-instance-service',
        'fail',
      ],
      [
        {},
        { triggers: { crons: ['*/1 * * * *'] } },
        'website-schedule',
        'fail',
      ],
      [{}, { routes: [] }, 'website-domains', 'fail'],
      [
        {},
        {
          vars: {
            ...websiteWrangler.vars,
            FELLOWSHIP42_INSTANCE_SHA256: 'f'.repeat(64),
          },
        },
        'website-instance-pin',
        'fail',
      ],
      [
        {},
        {
          vars: {
            ...websiteWrangler.vars,
            EMDASH_SITE_URL: 'https://www.church.example.test/blog',
          },
        },
        'website-origins',
        'fail',
      ],
      [
        {},
        {
          vars: {
            ...websiteWrangler.vars,
            FELLOWSHIP42_URL: 'https://www.church.example.test',
          },
        },
        'website-origins',
        'fail',
      ],
      [
        { vars: { ...instanceWranglerWithWebsite.vars, WEBSITE_ORIGIN: '' } },
        {},
        'website-origins',
        'warning',
      ],
      [
        {
          vars: {
            ...instanceWranglerWithWebsite.vars,
            WEBSITE_ORIGIN: 'https://app.church.example.test',
          },
        },
        {},
        'website-origins',
        'fail',
      ],
    ]
    for (const [instanceOverrides, overrides, id, status] of failures) {
      const failed = await websiteDoctor(instanceOverrides, overrides)
      expect(checkFor(failed, id)?.status, id).toBe(status)
    }
    expect((await websiteDoctor({}, { vars: {} })).status).toBe('failed')

    const unbound = deploymentManifestSchema.parse({
      ...websiteManifest,
      website: {
        ...websiteManifest.website,
        resources: {
          ...websiteManifest.website!.resources,
          instanceService: null,
        },
      },
    })
    expect(
      checkFor(await websiteDoctor({}, {}, unbound), 'website-instance-service')
        ?.status,
    ).toBe('fail')
    expect(
      checkFor(
        await websiteDoctor({}, { services: [] }, unbound),
        'website-instance-service',
      )?.status,
    ).toBe('pass')

    // The first declared domain is the canonical origin. `EMDASH_SITE_URL`
    // and `WEBSITE_ORIGIN` must both name it, because the setup claim the
    // instance mints for `WEBSITE_ORIGIN` must match the website's audience.
    const twoDomains = deploymentManifestSchema.parse({
      ...websiteManifest,
      website: {
        ...websiteManifest.website,
        worker: {
          ...websiteManifest.website!.worker,
          domains: ['www.church.example.test', 'church.example.test'],
        },
      },
    })
    const twoRoutes = {
      routes: ['www.church.example.test', 'church.example.test'].map(
        (pattern) => ({ pattern, custom_domain: true }),
      ),
    }
    const secondaryOrigin = 'https://church.example.test'
    for (const [instanceOverrides, websiteOverrides, code] of [
      [{}, {}, 'website-origins-match'],
      [
        {},
        {
          vars: { ...websiteWrangler.vars, EMDASH_SITE_URL: secondaryOrigin },
        },
        'website-origins-mismatch',
      ],
      [
        {
          vars: {
            ...instanceWranglerWithWebsite.vars,
            WEBSITE_ORIGIN: secondaryOrigin,
          },
        },
        {},
        'instance-website-origin-mismatch',
      ],
    ] as const) {
      expect(
        checkFor(
          await websiteDoctor(
            instanceOverrides,
            { ...twoRoutes, ...websiteOverrides },
            twoDomains,
          ),
          'website-origins',
        )?.code,
        code,
      ).toBe(code)
    }
  })

  it('reads the website Wrangler file only for a website manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-website-doctor-'))
    try {
      const instancePath = path.join(root, 'instance.jsonc')
      const websitePath = path.join(root, 'website.jsonc')
      await writeFile(instancePath, JSON.stringify(instanceWranglerWithWebsite))
      await writeFile(
        websitePath,
        `// EmDash website\n${JSON.stringify(websiteWrangler)}`,
      )
      const cli = path.resolve('dist/cli.js')
      const { stdout } = await execFileAsync(process.execPath, [
        cli,
        'doctor',
        '--manifest',
        path.resolve('examples/deployment-manifest.website.json'),
        '--wrangler',
        instancePath,
        '--migrations',
        path.resolve('../../apps/instance/migrations'),
        '--website-wrangler',
        websitePath,
        '--offline',
      ])
      const report = doctorReportSchema.parse(JSON.parse(stdout))
      expect(report.status).toBe('attention')
      expect(report.checks).toHaveLength(23)
      await expect(
        execFileAsync(process.execPath, [
          cli,
          'doctor',
          '--manifest',
          path.resolve('examples/deployment-manifest.local.json'),
          '--website-wrangler',
          websitePath,
          '--offline',
        ]),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('declares no website'),
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the checked-in instance example consistent with the committed Worker configuration', async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      path.resolve('dist/cli.js'),
      'doctor',
      '--manifest',
      path.resolve('examples/deployment-manifest.local.json'),
      '--wrangler',
      path.resolve('../../apps/instance/wrangler.jsonc'),
      '--migrations',
      path.resolve('../../apps/instance/migrations'),
      '--offline',
    ])
    const report = doctorReportSchema.parse(JSON.parse(stdout))
    expect(
      report.checks.filter(({ status }) => status !== 'pass'),
      'update examples/deployment-manifest.local.json with the committed release coordinates',
    ).toEqual([
      {
        id: 'release-manifest',
        status: 'unknown',
        code: 'release-not-checked',
      },
      {
        id: 'portable-identity',
        status: 'unknown',
        code: 'identity-runtime-check-required',
      },
      { id: 'runtime-health', status: 'unknown', code: 'runtime-not-checked' },
    ])
  })

  // The website template ships with the website app. Where it is present, the
  // website example must match its structure; only the values a deployment
  // fills in may differ: routes, the derived origins, the identity pin, and
  // the optional same-account service binding.
  const websiteTemplate = path.resolve('../../apps/website/wrangler.jsonc')
  it.skipIf(!existsSync(websiteTemplate))(
    'keeps the checked-in website example consistent with the committed Worker templates',
    async () => {
      const report = await doctorFromFiles({
        manifestPath: path.resolve('examples/deployment-manifest.website.json'),
        wranglerPath: path.resolve('../../apps/instance/wrangler.jsonc'),
        migrationsPath: path.resolve('../../apps/instance/migrations'),
        websiteWranglerPath: websiteTemplate,
        offline: true,
      })
      const deploymentValues = new Set([
        'domains',
        'website-domains',
        'website-origins',
        'website-instance-pin',
        'website-instance-service',
      ])
      expect(
        report.checks.filter(
          ({ id, status }) => status !== 'pass' && !deploymentValues.has(id),
        ),
        'update examples/deployment-manifest.website.json to match the committed Worker templates',
      ).toEqual([
        {
          id: 'release-manifest',
          status: 'unknown',
          code: 'release-not-checked',
        },
        {
          id: 'portable-identity',
          status: 'unknown',
          code: 'identity-runtime-check-required',
        },
        {
          id: 'runtime-health',
          status: 'unknown',
          code: 'runtime-not-checked',
        },
      ])
    },
  )
})

async function websiteExport(root: string) {
  const sourceManifestPath = path.join(root, 'source-deployment.json')
  const d1Path = path.join(root, 'database.sql')
  const r2IndexPath = path.join(root, 'r2-source.json')
  const websiteD1Path = path.join(root, 'website.sql')
  const websiteR2IndexPath = path.join(root, 'website-r2-source.json')
  const bundle = path.join(root, 'export')
  await writeFile(sourceManifestPath, JSON.stringify(websiteManifest))
  await writeFile(d1Path, `instance_metadata ${websiteManifest.instance.id}`)
  await writeFile(
    websiteD1Path,
    'CREATE TABLE _emdash_migrations (name TEXT);\n-- website pages',
  )
  await writeFile(path.join(root, 'shared.bin'), 'shared logo')
  await writeFile(path.join(root, 'media.bin'), 'sermon audio')
  await writeFile(path.join(root, 'hero.bin'), 'website hero')
  await writeFile(
    r2IndexPath,
    JSON.stringify({
      formatVersion: 1,
      objects: [
        { key: 'sermons/audio.bin', file: 'media.bin' },
        { key: 'brand/logo.bin', file: 'shared.bin' },
      ],
    }),
  )
  await writeFile(
    websiteR2IndexPath,
    JSON.stringify({
      formatVersion: 1,
      objects: [
        { key: 'uploads/hero.bin', file: 'hero.bin' },
        { key: 'uploads/logo.bin', file: 'shared.bin' },
      ],
    }),
  )
  const website = {
    d1ExportPath: websiteD1Path,
    r2SourceIndexPath: websiteR2IndexPath,
    r2SourceRoot: root,
  }
  const assembled = await assemblePortableExport({
    deploymentManifestPath: sourceManifestPath,
    d1ExportPath: d1Path,
    r2SourceIndexPath: r2IndexPath,
    r2SourceRoot: root,
    website,
    outputDirectory: bundle,
    quiescedAt: '2026-07-19T21:00:00.000Z',
    exportedAt: '2026-07-19T21:01:00.000Z',
  })
  return {
    assembled,
    bundle,
    sourceManifestPath,
    d1Path,
    r2IndexPath,
    website,
  }
}

/**
 * Drops the website steps from an import plan or execution report and
 * renumbers the rest, yielding a schema-valid instance-only document.
 */
function withoutWebsiteSteps<
  T extends { steps: ReadonlyArray<{ id: string; kind: string }> },
>(value: T): T {
  return {
    ...value,
    steps: value.steps
      .filter((step) => !isWebsiteImportStepKind(step.kind))
      .map((step, index) => ({
        ...step,
        id: `import-${String(index + 1).padStart(2, '0')}`,
        ...('dependsOn' in step ? { dependsOn: [] } : {}),
      })),
  }
}

function websiteDestination(
  overrides: Partial<DeploymentManifest> = {},
): DeploymentManifest {
  return deploymentManifestSchema.parse({
    ...websiteManifest,
    target: { environment: 'production', accountAlias: 'destination-account' },
    worker: { name: 'fellowship42-restored', domains: ['new.example.org'] },
    resources: {
      ...websiteManifest.resources,
      d1: { ...websiteManifest.resources.d1, name: 'fellowship42-restored' },
      r2: {
        ...websiteManifest.resources.r2,
        name: 'fellowship42-media-restored',
      },
      outboxQueue: {
        ...websiteManifest.resources.outboxQueue,
        name: 'fellowship42-outbox-restored',
        deadLetterName: 'fellowship42-outbox-restored-dlq',
      },
    },
    configuration: {
      ...websiteManifest.configuration,
      accessTeamDomain: 'https://fellowship42.cloudflareaccess.com',
      accessAudienceConfigured: true,
    },
    website: {
      ...websiteManifest.website,
      worker: {
        name: 'fellowship42-website-restored',
        domains: ['www.new.example.org'],
      },
      resources: {
        ...websiteManifest.website!.resources,
        d1: { binding: 'DB', name: 'fellowship42-website-restored' },
        r2: { binding: 'MEDIA', name: 'fellowship42-website-media-restored' },
        sessionKv: {
          binding: 'SESSION',
          name: 'fellowship42-website-session-restored',
        },
      },
    },
    ...overrides,
  })
}

describe('f42ctl website portability', () => {
  it('exports and verifies website D1 and R2 beside the instance artifacts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-website-export-'))
    try {
      const { assembled, bundle, sourceManifestPath, d1Path, r2IndexPath } =
        await websiteExport(root)
      expect(assembled.artifacts.map(({ kind, file }) => [kind, file])).toEqual(
        [
          ['d1-sql', 'd1/database.sql'],
          ['portable-configuration', 'config/portable.json'],
          ['r2-index', 'r2/index.json'],
          ['website-d1-sql', 'website/d1/database.sql'],
          ['website-r2-index', 'website/r2/index.json'],
        ],
      )
      expect(
        portableConfigurationSchema.parse(
          JSON.parse(
            await readFile(path.join(bundle, 'config/portable.json'), 'utf8'),
          ),
        ).website,
      ).toEqual({ cms: { name: 'emdash', version: '1.0.1' } })
      const { readdir } = await import('node:fs/promises')
      expect(await readdir(path.join(bundle, 'r2/objects'))).toHaveLength(3)
      const evidence = await verifyPortableExport({
        directory: bundle,
        verifiedAt: '2026-07-19T21:02:00.000Z',
        evidenceId: '42424242-1234-4678-9abc-123456789abc',
      })
      expect(evidence.verificationStatus).toBe('verified')
      expect(JSON.stringify(evidence)).not.toContain('uploads/')

      const cli = path.resolve('dist/cli.js')
      const viaCli = await execFileAsync(process.execPath, [
        cli,
        'export',
        '--manifest',
        sourceManifestPath,
        '--d1',
        d1Path,
        '--r2-index',
        r2IndexPath,
        '--r2-root',
        root,
        '--website-d1',
        path.join(root, 'website.sql'),
        '--website-r2-index',
        path.join(root, 'website-r2-source.json'),
        '--website-r2-root',
        root,
        '--directory',
        path.join(root, 'cli-export'),
        '--quiesced-at',
        '2026-07-19T21:00:00.000Z',
        '--exported-at',
        '2026-07-19T21:01:00.000Z',
      ])
      expect(JSON.parse(viaCli.stdout)).toEqual(assembled)
      for (const extra of [
        ['--website-d1', path.join(root, 'website.sql')],
        [],
      ]) {
        await expect(
          execFileAsync(process.execPath, [
            cli,
            'export',
            '--manifest',
            sourceManifestPath,
            '--d1',
            d1Path,
            '--r2-index',
            r2IndexPath,
            '--r2-root',
            root,
            ...extra,
            '--directory',
            path.join(root, `rejected-${extra.length}`),
            '--quiesced-at',
            '2026-07-19T21:00:00.000Z',
          ]),
        ).rejects.toMatchObject({ code: 1 })
      }

      await writeFile(
        path.join(bundle, 'website/d1/database.sql'),
        'CREATE TABLE _emdash_migrations (name TEXT);\n-- tampered',
      )
      await expect(verifyPortableExport({ directory: bundle })).rejects.toThrow(
        'website/d1/database.sql',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects re-digested bundles whose website database or configuration disagree', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-website-verify-'))
    try {
      const { bundle } = await websiteExport(root)
      // Rewrites one artifact and its manifest digest, so only the semantic
      // website checks can reject the copy.
      const rewrite = async (name: string, file: string, contents: string) => {
        const copy = path.join(root, name)
        await cp(bundle, copy, { recursive: true })
        await writeFile(path.join(copy, file), contents)
        const manifestPath = path.join(copy, 'export-manifest.json')
        const exportManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        for (const artifact of exportManifest.artifacts) {
          if (artifact.file === file) {
            artifact.bytes = Buffer.byteLength(contents)
            artifact.sha256 = createHash('sha256')
              .update(contents)
              .digest('hex')
          }
        }
        await writeFile(manifestPath, JSON.stringify(exportManifest))
        return copy
      }
      await expect(
        verifyPortableExport({
          directory: await rewrite(
            're-exported',
            'website/d1/database.sql',
            'CREATE TABLE _emdash_migrations (name TEXT);\n-- re-exported',
          ),
        }),
      ).resolves.toMatchObject({ verificationStatus: 'verified' })
      await expect(
        verifyPortableExport({
          directory: await rewrite(
            'unmarked',
            'website/d1/database.sql',
            'CREATE TABLE ec_pages (id TEXT);\n',
          ),
        }),
      ).rejects.toThrow('not an EmDash database export')
      const { website: _website, ...instanceConfiguration } = JSON.parse(
        await readFile(path.join(bundle, 'config/portable.json'), 'utf8'),
      )
      await expect(
        verifyPortableExport({
          directory: await rewrite(
            'instance-configuration',
            'config/portable.json',
            JSON.stringify(instanceConfiguration),
          ),
        }),
      ).rejects.toThrow('disagree about the website')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects website inputs that are missing, misplaced, or not EmDash databases', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-website-invalid-'))
    try {
      const { sourceManifestPath, d1Path, r2IndexPath, website } =
        await websiteExport(root)
      const common = {
        d1ExportPath: d1Path,
        r2SourceIndexPath: r2IndexPath,
        r2SourceRoot: root,
        quiescedAt: '2026-07-19T21:00:00.000Z',
        exportedAt: '2026-07-19T21:01:00.000Z',
      }
      await expect(
        assemblePortableExport({
          ...common,
          deploymentManifestPath: sourceManifestPath,
          outputDirectory: path.join(root, 'missing'),
        }),
      ).rejects.toThrow('declares a website')
      const instancePath = path.join(root, 'instance.json')
      await writeFile(instancePath, JSON.stringify(manifest))
      await expect(
        assemblePortableExport({
          ...common,
          deploymentManifestPath: instancePath,
          website,
          outputDirectory: path.join(root, 'unexpected'),
        }),
      ).rejects.toThrow('declares no website')
      await expect(
        assemblePortableExport({
          ...common,
          deploymentManifestPath: sourceManifestPath,
          website: { ...website, d1ExportPath: d1Path },
          outputDirectory: path.join(root, 'swapped'),
        }),
      ).rejects.toThrow('not an EmDash database export')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stages, restores, cuts over, and rehearses the website with the instance', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-website-import-'))
    try {
      const { bundle } = await websiteExport(root)
      const destination = websiteDestination()
      const destinationPath = path.join(root, 'destination.json')
      await writeFile(destinationPath, JSON.stringify(destination))
      const operationId = '42424242-1234-4678-9abc-123456789abc'
      const plan = await buildPortableImportPlan({
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        operationId,
        generatedAt: '2026-07-19T22:00:00.000Z',
      })
      expect(plan.steps.map(({ kind }) => kind)).toEqual(
        importStepKindsFor(true),
      )
      const byKind = Object.fromEntries(
        plan.steps.map((step) => [step.kind, step]),
      )
      expect(byKind['restore-website-d1']).toMatchObject({
        risk: 'writes-destination',
        resourceName: 'fellowship42-website-restored',
      })
      expect(byKind['deploy-website-without-domains']).toMatchObject({
        resourceName: 'fellowship42-website-restored',
        dependsOn: [
          byKind['restore-website-d1']!.id,
          byKind['restore-website-r2']!.id,
          byKind['deploy-without-domains']!.id,
        ],
      })
      expect(byKind['cutover-domains']!.dependsOn).toEqual([
        byKind['verify-website-runtime']!.id,
      ])
      expect(installationDomains(destination)).toEqual([
        'new.example.org',
        'www.new.example.org',
      ])

      const approval = {
        formatVersion: 1,
        operationId,
        instanceId: destination.instance.id,
        exportManifestSha256: plan.exportManifestSha256,
        destinationManifestSha256: plan.destinationManifestSha256,
        approvedAt: '2026-07-19T22:30:00.000Z',
        approvedBy: 'user:operator_42',
        sourceVerifiedAt: '2026-07-19T22:20:00.000Z',
        destinationVerifiedAt: '2026-07-19T22:25:00.000Z',
        credentialDisposition: {
          deployment: 'rotated',
          applicationSecrets: 'rotated',
          management: 'disconnected',
          website: websiteDisposition,
        },
        domains: installationDomains(destination),
        rollbackDeadline: '2026-07-20T22:30:00.000Z',
      }
      expect(verifyCutoverApproval(plan, destination, approval)).toEqual(
        approval,
      )
      for (const invalid of [
        { ...approval, domains: destination.worker.domains },
        {
          ...approval,
          credentialDisposition: {
            deployment: 'rotated',
            applicationSecrets: 'rotated',
            management: 'disconnected',
          },
        },
      ]) {
        expect(() =>
          verifyCutoverApproval(plan, destination, invalid),
        ).toThrow()
      }

      const empty = {
        state: 'empty' as const,
        createdAt: '2026-07-19T22:00:30.000Z',
      }
      const preflight = (
        website: DestinationImportPreflight['website'],
      ): DestinationImportPreflight => ({
        formatVersion: 1,
        operationId,
        instanceId: destination.instance.id,
        destinationManifestSha256: plan.destinationManifestSha256,
        observedAt: '2026-07-19T22:01:00.000Z',
        d1: empty,
        r2: empty,
        worker: 'absent',
        outboxQueue: 'absent',
        deadLetterQueue: 'absent',
        durableObjectNamespace: 'absent',
        ...(website ? { website } : {}),
      })
      const newWebsite = {
        d1: empty,
        r2: empty,
        worker: 'absent' as const,
        sessionKv: 'absent' as const,
      }
      const events: string[] = []
      const adapter: PortableImportAdapter = {
        async preflight() {
          events.push('preflight')
          return preflight(newWebsite)
        },
        async restoreD1() {
          events.push('restore-d1')
        },
        async restoreR2Object(input) {
          events.push(`restore-r2:${input.key}`)
        },
        async restoreWebsiteD1(input) {
          events.push(`restore-website-d1:${path.basename(input.sqlPath)}`)
        },
        async restoreWebsiteR2Object(input) {
          events.push(`restore-website-r2:${input.key}`)
        },
        async applyForwardMigrations() {
          events.push('migrate')
        },
        async deployWithoutDomains() {
          events.push('deploy-domainless')
        },
        async deployWebsiteWithoutDomains() {
          events.push('deploy-website-domainless')
        },
        async rotateDeploymentCredentials() {
          events.push('rotate-deployment')
        },
        async rotateApplicationSecrets() {
          events.push('rotate-application')
        },
        async rotateManagementCredentials() {
          events.push('rotate-management')
        },
        async verifyRestoredIdentity() {
          events.push('verify-identity')
          return destination.instance.id
        },
        async verifyRuntime() {
          events.push('verify-runtime')
          return true
        },
        async verifyWebsiteRuntime() {
          events.push('verify-website-runtime')
          return true
        },
        async cutoverDomains(input) {
          events.push(`cutover:${input.approval.domains.join(',')}`)
        },
        async verifyIndependentOperation() {
          events.push('verify-independent')
          return true
        },
        async retireSourceRouting() {
          events.push('retire-source-routing')
        },
      }
      const restored = await executePortableImportRestore({
        plan,
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        adapter,
        now: () => '2026-07-19T22:10:00.000Z',
      })
      expect(restored.status).toBe('awaiting-cutover')
      expect(events).toEqual([
        'preflight',
        'restore-d1',
        'restore-r2:brand/logo.bin',
        'restore-r2:sermons/audio.bin',
        'restore-website-d1:database.sql',
        'restore-website-r2:uploads/hero.bin',
        'restore-website-r2:uploads/logo.bin',
        'migrate',
        'deploy-domainless',
        'deploy-website-domainless',
        'rotate-deployment',
        'rotate-application',
        'rotate-management',
        'verify-identity',
        'verify-runtime',
        'verify-website-runtime',
      ])
      const completed = await executePortableCutover({
        plan,
        report: restored,
        destinationManifest: destination,
        approval,
        adapter,
        now: () => '2026-07-19T22:31:00.000Z',
      })
      expect(completed.status).toBe('succeeded')
      expect(events.slice(-3)).toEqual([
        'cutover:new.example.org,www.new.example.org',
        'verify-independent',
        'retire-source-routing',
      ])

      // A report that skipped the website, renumbered as a valid
      // instance-only report, never binds to the website plan; nor does the
      // website report bind to an instance-only plan.
      const skippedWebsite = withoutWebsiteSteps(restored)
      const instancePlan = withoutWebsiteSteps(plan)
      expect(() =>
        verifyCutoverApproval(instancePlan, destination, approval),
      ).toThrow('exactly when the destination has a website')
      for (const [forgedPlan, forgedReport] of [
        [plan, skippedWebsite],
        [instancePlan, restored],
      ] as const) {
        const before = events.length
        await expect(
          executePortableCutover({
            plan: forgedPlan,
            report: forgedReport,
            destinationManifest: destination,
            approval,
            adapter,
            now: () => '2026-07-19T22:31:00.000Z',
          }),
        ).rejects.toThrow('does not bind to the supplied import plan')
        expect(events).toHaveLength(before)
      }

      const observations = {
        exportVerified: true,
        destinationWasNewAndEmpty: true,
        d1RestoredExactly: true,
        r2RestoredExactly: true,
        websiteD1RestoredExactly: true,
        websiteR2RestoredExactly: true,
        credentialsRotated: true,
        portableIdentityPreserved: true,
        runtimeHealthy: true,
        websiteRuntimeHealthy: true,
        cutoverApplied: true,
        independentOperationVerified: true,
        sourceRoutingRetired: true,
      }
      const rehearsal = {
        plan,
        destinationManifest: destination,
        restoreReport: restored,
        approval,
        completionReport: completed,
        evidenceId: '42424242-1234-4678-9abc-123456789abd',
        sourceCustody: 'fellowship42-hosted' as const,
      }
      const evidence = buildMigrationRehearsalEvidence({
        ...rehearsal,
        observations,
      })
      expect(evidence.assertions.map(({ id }) => id)).toEqual([
        'export-verified',
        'new-empty-destination',
        'd1-restored',
        'r2-restored',
        'website-d1-restored',
        'website-r2-restored',
        'credentials-rotated',
        'portable-identity-preserved',
        'runtime-healthy',
        'website-runtime-healthy',
        'cutover-approved',
        'independent-operation-verified',
        'source-routing-retired',
      ])
      expect(JSON.stringify(evidence)).not.toContain('www.new.example.org')
      const { websiteRuntimeHealthy: _omitted, ...incomplete } = observations
      for (const invalid of [
        incomplete,
        { ...observations, websiteR2RestoredExactly: false },
      ]) {
        expect(() =>
          buildMigrationRehearsalEvidence({
            ...rehearsal,
            observations: invalid,
          }),
        ).toThrow('Every hosted-to-church-owned rehearsal observation')
      }
      for (const forged of [
        { restoreReport: skippedWebsite },
        { completionReport: withoutWebsiteSteps(completed) },
      ]) {
        expect(() =>
          buildMigrationRehearsalEvidence({
            ...rehearsal,
            ...forged,
            observations,
          }),
        ).toThrow('bound awaiting-cutover and succeeded execution reports')
      }

      const failures: Array<[PortableImportAdapter, string, string, string[]]> =
        [
          [
            (() => {
              const instanceOnly: PortableImportAdapter = { ...adapter }
              delete instanceOnly.restoreWebsiteD1
              return instanceOnly
            })(),
            'verify-destination-manifest',
            'website-adapter-unsupported',
            [],
          ],
          [
            { ...adapter, preflight: async () => preflight(undefined) },
            'verify-new-empty-d1',
            'destination-preflight-component-mismatch',
            [],
          ],
          [
            {
              ...adapter,
              preflight: async () =>
                preflight({
                  ...newWebsite,
                  d1: { ...empty, state: 'occupied' },
                }),
            },
            'verify-new-empty-website-d1',
            'destination-website-d1-not-empty',
            [],
          ],
          [
            {
              ...adapter,
              preflight: async () =>
                preflight({
                  ...newWebsite,
                  r2: { ...empty, createdAt: '2026-07-19T21:59:00.000Z' },
                }),
            },
            'verify-new-empty-d1',
            'destination-preflight-time-invalid',
            [],
          ],
          [
            {
              ...adapter,
              async restoreWebsiteR2Object() {
                throw new Error('synthetic website R2 failure')
              },
            },
            'restore-website-r2',
            'website-r2-restore-failed',
            ['restore-d1'],
          ],
          [
            { ...adapter, verifyWebsiteRuntime: async () => false },
            'verify-website-runtime',
            'destination-website-unhealthy',
            ['verify-runtime'],
          ],
        ]
      for (const [failing, kind, code, reached] of failures) {
        events.length = 0
        const failed = await executePortableImportRestore({
          plan,
          exportDirectory: bundle,
          destinationManifestPath: destinationPath,
          adapter: failing,
          now: () => '2026-07-19T22:10:00.000Z',
        })
        const position = failed.steps.findIndex((step) => step.kind === kind)
        expect(failed.status, code).toBe('failed')
        expect(failed.steps[position], code).toMatchObject({
          status: 'failed',
          code,
        })
        expect(
          failed.steps
            .slice(position + 1)
            .every((step) => step.status === 'pending'),
          code,
        ).toBe(true)
        for (const event of reached) expect(events, code).toContain(event)
        if (reached.length === 0) {
          // The replaced preflights record nothing, and an adapter without
          // website support is refused before any provider call, preflight
          // included.
          expect(events, code).toEqual([])
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses destinations whose components or CMS differ from the export', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-website-mismatch-'))
    try {
      const { bundle } = await websiteExport(root)
      const { website: _website, ...instanceOnly } = websiteDestination()
      for (const [destination, message] of [
        [instanceOnly, 'same installation components'],
        [
          websiteDestination({
            website: {
              ...websiteDestination().website!,
              cms: { name: 'emdash', version: '1.1.0' },
            },
          }),
          'website CMS',
        ],
      ] as const) {
        const destinationPath = path.join(root, `${message.length}.json`)
        await writeFile(destinationPath, JSON.stringify(destination))
        await expect(
          buildPortableImportPlan({
            exportDirectory: bundle,
            destinationManifestPath: destinationPath,
            generatedAt: '2026-07-19T22:00:00.000Z',
          }),
        ).rejects.toThrow(message)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
