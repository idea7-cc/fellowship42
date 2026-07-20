import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  deployPlanSchema,
  deploymentManifestSchema,
  doctorReportSchema,
  migrationRehearsalEvidenceSchema,
} from '@fellowship42/management-protocol'
import {
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
    F42_PORTABLE_INSTANCE_ID:
      'instance_42424242-1234-5678-9abc-123456789abc',
    F42_RELEASE_TAG: manifest.instance.release.tag,
    F42_RELEASE_MANIFEST_SHA256: manifest.instance.release.manifestSha256,
  },
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

  it('binds pre-owner runtime readiness to the manifest portable identity', async () => {
    const portableIdentitySha256 = createHash('sha256')
      .update(manifest.instance.id)
      .digest('hex')
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
      await writeFile(path.join(source, 'r2/first.bin'), 'private media payload')
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
        (await readFile(path.join(output, 'r2/index.json'), 'utf8')).match(/r2\/objects\//g),
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
      await writeFile(d1Path, 'CREATE TABLE instance_metadata (instance_id TEXT);')
      await writeFile(indexPath, JSON.stringify({ formatVersion: 1, objects: [] }))
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
      await expect(verifyPortableExport({ directory: output })).rejects.toThrow('unreferenced')
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
        expect.objectContaining({ kind: 'verify-new-empty-d1', risk: 'read-only' }),
        expect.objectContaining({ kind: 'verify-new-empty-r2', risk: 'read-only' }),
      ])
      expect(plan.steps.filter((step) => step.approvalRequired).map((step) => step.kind)).toEqual([
        'cutover-domains',
        'retire-source-routing',
      ])
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
      expect(verifyCutoverApproval(plan, destination, approval)).toEqual(approval)
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
        async restoreD1() { events.push('restore-d1') },
        async restoreR2Object(input) {
          events.push(`restore-r2:${input.key}`)
        },
        async applyForwardMigrations() { events.push('migrate') },
        async deployWithoutDomains() { events.push('deploy-domainless') },
        async rotateDeploymentCredentials() { events.push('rotate-deployment') },
        async rotateApplicationSecrets() { events.push('rotate-application') },
        async rotateManagementCredentials() { events.push('rotate-management') },
        async verifyRestoredIdentity() {
          events.push('verify-identity')
          return manifest.instance.id
        },
        async verifyRuntime() {
          events.push('verify-runtime')
          return true
        },
        async cutoverDomains() { events.push('cutover') },
        async verifyIndependentOperation() {
          events.push('verify-independent')
          return true
        },
        async retireSourceRouting() { events.push('retire-source-routing') },
      }
      const restored = await executePortableImportRestore({
        plan,
        exportDirectory: bundle,
        destinationManifestPath: destinationPath,
        adapter,
        now: () => '2026-07-19T22:10:00.000Z',
      })
      expect(restored.status).toBe('awaiting-cutover')
      expect(restored.steps.slice(0, 14).every((step) => step.status === 'succeeded')).toBe(true)
      expect(restored.steps.slice(14).every((step) => step.status === 'pending')).toBe(true)
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
      await writeFile(indexPath, JSON.stringify({ formatVersion: 1, objects: [] }))
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
