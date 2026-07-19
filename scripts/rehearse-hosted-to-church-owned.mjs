import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  migrationRehearsalEvidenceSchema,
  portableExportManifestSchema,
} from '../packages/management-protocol/dist/index.js'
import {
  assemblePortableExport,
  buildMigrationRehearsalEvidence,
  buildPortableImportPlan,
  canonicalJson,
  executePortableCutover,
  executePortableImportRestore,
  verifyPortableExport,
} from '../tooling/f42ctl/dist/index.js'

const root = path.resolve(import.meta.dirname, '..')
const fixturePath = path.join(
  root,
  'packages/management-protocol/fixtures/migration-rehearsal.v1.json',
)
const printFixture = process.argv.includes('--print-fixture')
const instanceId = 'instance_62626262-1234-5678-9abc-123456789abc'
const operationId = '62626262-1234-4678-9abc-123456789abd'
const release = {
  tag: 'v0.9.0',
  applicationVersion: '0.9.0',
  schemaVersion: 5,
  managementProtocolPackageVersion: '0.5.0',
  managementProtocolWireVersion: '1',
  sourceCommit: 'dc07e6aaa3b8a5f3a4ab25b7b52a6ffd6673840c',
  manifestUrl:
    'https://github.com/idea7-cc/fellowship42/releases/download/v0.9.0/release-manifest.json',
  manifestSha256:
    'ab99fc33f365584f18ed200fd3fbf13e91132e93509a3f5d2d64af30d2b73d1c',
}

const sourceManifest = {
  formatVersion: 1,
  instance: { id: instanceId, topology: 'single-church', release },
  custody: {
    infrastructureOwner: 'fellowship42',
    operator: 'fellowship42',
  },
  target: { environment: 'production', accountAlias: 'hosted-source' },
  worker: { name: 'fellowship42-hosted', domains: ['rehearsal.example.org'] },
  resources: {
    d1: { binding: 'DB', name: 'fellowship42-hosted' },
    r2: { binding: 'MEDIA', name: 'fellowship42-hosted-media' },
    outboxQueue: {
      binding: 'OUTBOX_QUEUE',
      name: 'fellowship42-hosted-outbox',
      deadLetterName: 'fellowship42-hosted-outbox-dlq',
    },
    durableObject: { binding: 'CHURCH_ROOMS', className: 'ChurchRoom' },
    schedules: ['*/1 * * * *'],
  },
  configuration: {
    accessTeamDomain: 'https://fellowship42.cloudflareaccess.com',
    accessAudienceConfigured: true,
    paymentWebhookProvider: null,
  },
}

const destinationManifest = {
  ...sourceManifest,
  custody: { infrastructureOwner: 'church', operator: 'church' },
  target: { environment: 'production', accountAlias: 'church-owned' },
  worker: { name: 'fellowship42-church', domains: sourceManifest.worker.domains },
  resources: {
    ...sourceManifest.resources,
    d1: { binding: 'DB', name: 'fellowship42-church' },
    r2: { binding: 'MEDIA', name: 'fellowship42-church-media' },
    outboxQueue: {
      binding: 'OUTBOX_QUEUE',
      name: 'fellowship42-church-outbox',
      deadLetterName: 'fellowship42-church-outbox-dlq',
    },
  },
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

class RehearsalAdapter {
  constructor({ destinationD1, destinationR2, sourceD1Bytes, expectedObjects }) {
    this.destinationD1 = destinationD1
    this.destinationR2 = destinationR2
    this.sourceD1Bytes = sourceD1Bytes
    this.expectedObjects = expectedObjects
    this.objects = new Map()
    this.destinationWasNewAndEmpty = false
    this.d1Bytes = null
    this.workerDeployed = false
    this.forwardMigrationsApplied = false
    this.rotations = new Set()
    this.identityPreserved = false
    this.runtimeVerified = false
    this.cutoverApplied = false
    this.independentVerified = false
    this.sourceRoutingRetired = false
  }

  async preflight({ plan }) {
    const [d1Entries, r2Entries] = await Promise.all([
      readdir(this.destinationD1),
      readdir(this.destinationR2),
    ])
    this.destinationWasNewAndEmpty =
      d1Entries.length === 0 &&
      r2Entries.length === 0 &&
      !this.workerDeployed
    if (!this.destinationWasNewAndEmpty) {
      throw new Error('Destination account boundary is not new and empty.')
    }
    return {
      formatVersion: 1,
      operationId: plan.operationId,
      instanceId: plan.instanceId,
      destinationManifestSha256: plan.destinationManifestSha256,
      observedAt: '2026-07-19T22:01:00.000Z',
      d1: { state: 'empty', createdAt: '2026-07-19T22:00:30.000Z' },
      r2: { state: 'empty', createdAt: '2026-07-19T22:00:30.000Z' },
      worker: 'absent',
      outboxQueue: 'absent',
      deadLetterQueue: 'absent',
      durableObjectNamespace: 'absent',
    }
  }

  async restoreD1({ sqlPath }) {
    this.d1Bytes = await readFile(sqlPath)
    await writeFile(path.join(this.destinationD1, 'database.sql'), this.d1Bytes, {
      flag: 'wx',
    })
  }

  async restoreR2Object({ key, filePath, bytes, sha256: expectedSha256 }) {
    const contents = await readFile(filePath)
    if (
      contents.byteLength !== bytes ||
      sha256(contents) !== expectedSha256 ||
      this.objects.has(key)
    ) {
      throw new Error('R2 rehearsal object failed integrity verification.')
    }
    this.objects.set(key, contents)
    await writeFile(
      path.join(this.destinationR2, `${expectedSha256}.object`),
      contents,
      { flag: 'wx' },
    )
  }

  async applyForwardMigrations({ plan }) {
    if (plan.sourceRelease.schemaVersion !== plan.destinationRelease.schemaVersion) {
      throw new Error('Rehearsal unexpectedly requires a schema migration.')
    }
    this.forwardMigrationsApplied = true
  }

  async deployWithoutDomains() {
    if (!this.forwardMigrationsApplied) throw new Error('Migrations were not applied.')
    this.workerDeployed = true
  }

  async rotateDeploymentCredentials() {
    this.rotations.add('deployment')
  }

  async rotateApplicationSecrets() {
    this.rotations.add('application')
  }

  async rotateManagementCredentials() {
    this.rotations.add('management')
  }

  async verifyRestoredIdentity({ plan }) {
    const sql = this.d1Bytes?.toString('utf8') ?? ''
    this.identityPreserved = sql.includes(`'${plan.instanceId}'`)
    return this.identityPreserved ? plan.instanceId : 'identity-mismatch'
  }

  async verifyRuntime() {
    const d1Matches =
      this.d1Bytes !== null &&
      sha256(this.d1Bytes) === sha256(this.sourceD1Bytes)
    const r2Matches =
      this.objects.size === this.expectedObjects.size &&
      [...this.expectedObjects].every(
        ([key, digest]) =>
          this.objects.has(key) && sha256(this.objects.get(key)) === digest,
      )
    this.runtimeVerified =
      d1Matches &&
      r2Matches &&
      this.workerDeployed &&
      this.rotations.size === 3 &&
      this.identityPreserved
    return this.runtimeVerified
  }

  async cutoverDomains({ approval }) {
    if (!this.runtimeVerified || approval.domains.length !== 1) {
      throw new Error('Destination was not ready for routing cutover.')
    }
    this.cutoverApplied = true
  }

  async verifyIndependentOperation() {
    this.independentVerified = this.cutoverApplied && this.runtimeVerified
    return this.independentVerified
  }

  async retireSourceRouting() {
    if (!this.independentVerified) {
      throw new Error('Independent operation was not verified.')
    }
    this.sourceRoutingRetired = true
  }

  observations(exportVerified) {
    return {
      exportVerified,
      destinationWasNewAndEmpty: this.destinationWasNewAndEmpty,
      d1RestoredExactly:
        this.d1Bytes !== null &&
        sha256(this.d1Bytes) === sha256(this.sourceD1Bytes),
      r2RestoredExactly:
        this.objects.size === this.expectedObjects.size &&
        [...this.expectedObjects].every(
          ([key, digest]) =>
            this.objects.has(key) && sha256(this.objects.get(key)) === digest,
        ),
      credentialsRotated: this.rotations.size === 3,
      portableIdentityPreserved: this.identityPreserved,
      runtimeHealthy: this.runtimeVerified,
      cutoverApplied: this.cutoverApplied,
      independentOperationVerified: this.independentVerified,
      sourceRoutingRetired: this.sourceRoutingRetired,
    }
  }
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'f42-rehearsal-'))
try {
  const sourceRoot = path.join(temporaryRoot, 'hosted-account')
  const sourceR2 = path.join(sourceRoot, 'r2')
  const destinationRoot = path.join(temporaryRoot, 'church-account')
  const destinationD1 = path.join(destinationRoot, 'd1')
  const destinationR2 = path.join(destinationRoot, 'r2')
  const bundle = path.join(temporaryRoot, 'portable-export')
  await Promise.all([
    mkdir(sourceR2, { recursive: true }),
    mkdir(destinationD1, { recursive: true }),
    mkdir(destinationR2, { recursive: true }),
  ])
  const sourceManifestPath = path.join(sourceRoot, 'deployment-manifest.json')
  const destinationManifestPath = path.join(
    destinationRoot,
    'deployment-manifest.json',
  )
  const d1Path = path.join(sourceRoot, 'database.sql')
  const r2IndexPath = path.join(sourceRoot, 'r2-index.json')
  const d1Contents = Buffer.from(
    `CREATE TABLE instance_metadata (instance_id TEXT PRIMARY KEY);\n` +
      `INSERT INTO instance_metadata VALUES ('${instanceId}');\n` +
      `CREATE TABLE rehearsal_records (id TEXT PRIMARY KEY, value TEXT NOT NULL);\n` +
      `INSERT INTO rehearsal_records VALUES ('record_1', 'portable-data');\n`,
  )
  const media = new Map([
    ['publishing/welcome.txt', Buffer.from('Welcome to the portable church.')],
    ['sermons/rehearsal.txt', Buffer.from('Synthetic rehearsal media.')],
  ])
  await Promise.all([
    writeFile(sourceManifestPath, JSON.stringify(sourceManifest), { flag: 'wx' }),
    writeFile(destinationManifestPath, JSON.stringify(destinationManifest), {
      flag: 'wx',
    }),
    writeFile(d1Path, d1Contents, { flag: 'wx' }),
    ...[...media.entries()].map(([key, contents], index) =>
      writeFile(path.join(sourceR2, `object-${index + 1}.bin`), contents, {
        flag: 'wx',
      }),
    ),
  ])
  await writeFile(
    r2IndexPath,
    JSON.stringify({
      formatVersion: 1,
      objects: [...media.keys()].map((key, index) => ({
        key,
        file: `object-${index + 1}.bin`,
      })),
    }),
    { flag: 'wx' },
  )
  const exportManifest = portableExportManifestSchema.parse(
    await assemblePortableExport({
      deploymentManifestPath: sourceManifestPath,
      d1ExportPath: d1Path,
      r2SourceIndexPath: r2IndexPath,
      r2SourceRoot: sourceR2,
      outputDirectory: bundle,
      quiescedAt: '2026-07-19T21:00:00.000Z',
      exportedAt: '2026-07-19T21:01:00.000Z',
    }),
  )
  const exportEvidence = await verifyPortableExport({
    directory: bundle,
    verifiedAt: '2026-07-19T21:02:00.000Z',
    evidenceId: '62626262-1234-4678-9abc-123456789abe',
  })
  const plan = await buildPortableImportPlan({
    exportDirectory: bundle,
    destinationManifestPath,
    operationId,
    generatedAt: '2026-07-19T22:00:00.000Z',
  })
  const adapter = new RehearsalAdapter({
    destinationD1,
    destinationR2,
    sourceD1Bytes: d1Contents,
    expectedObjects: new Map(
      [...media].map(([key, contents]) => [key, sha256(contents)]),
    ),
  })
  const restoreReport = await executePortableImportRestore({
    plan,
    exportDirectory: bundle,
    destinationManifestPath,
    adapter,
    now: () => '2026-07-19T22:10:00.000Z',
  })
  const approval = {
    formatVersion: 1,
    operationId,
    instanceId,
    exportManifestSha256: plan.exportManifestSha256,
    destinationManifestSha256: plan.destinationManifestSha256,
    approvedAt: '2026-07-19T22:30:00.000Z',
    approvedBy: 'user:rehearsal-owner',
    sourceVerifiedAt: '2026-07-19T22:20:00.000Z',
    destinationVerifiedAt: '2026-07-19T22:25:00.000Z',
    credentialDisposition: {
      deployment: 'rotated',
      applicationSecrets: 'rotated',
      management: 'disconnected',
    },
    domains: destinationManifest.worker.domains,
    rollbackDeadline: '2026-07-20T22:30:00.000Z',
  }
  const completionReport = await executePortableCutover({
    plan,
    report: restoreReport,
    destinationManifest,
    approval,
    adapter,
    now: () => '2026-07-19T22:31:00.000Z',
  })
  const evidence = buildMigrationRehearsalEvidence({
    plan,
    destinationManifest,
    restoreReport,
    approval,
    completionReport,
    observations: adapter.observations(
      exportEvidence.verificationStatus === 'verified' &&
        exportEvidence.instanceId === exportManifest.instanceId,
    ),
    evidenceId: '62626262-1234-4678-9abc-123456789abf',
    sourceCustody: 'fellowship42-hosted',
  })
  migrationRehearsalEvidenceSchema.parse(evidence)
  if (printFixture) {
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } else {
    const fixture = migrationRehearsalEvidenceSchema.parse(
      JSON.parse(await readFile(fixturePath, 'utf8')),
    )
    if (canonicalJson(evidence) !== canonicalJson(fixture)) {
      throw new Error(
        'Migration rehearsal evidence differs from the published compatibility fixture.',
      )
    }
    console.log(
      `Verified hosted-to-church-owned rehearsal ${evidence.evidenceId} with ${evidence.assertions.length} passing assertions.`,
    )
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
