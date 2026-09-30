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
  website: {
    cms: { name: 'emdash', version: '1.0.1' },
    worker: {
      name: 'fellowship42-hosted-website',
      domains: ['www.rehearsal.example.org'],
    },
    resources: {
      d1: { binding: 'DB', name: 'fellowship42-hosted-website' },
      r2: { binding: 'MEDIA', name: 'fellowship42-hosted-website-media' },
      sessionKv: {
        binding: 'SESSION',
        name: 'fellowship42-hosted-website-session',
      },
      instanceService: { binding: 'FELLOWSHIP42' },
      schedules: ['* * * * *'],
    },
  },
}

const destinationManifest = {
  ...sourceManifest,
  custody: { infrastructureOwner: 'church', operator: 'church' },
  target: { environment: 'production', accountAlias: 'church-owned' },
  worker: {
    name: 'fellowship42-church',
    domains: sourceManifest.worker.domains,
  },
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
  website: {
    ...sourceManifest.website,
    worker: {
      name: 'fellowship42-church-website',
      domains: sourceManifest.website.worker.domains,
    },
    resources: {
      ...sourceManifest.website.resources,
      d1: { binding: 'DB', name: 'fellowship42-church-website' },
      r2: { binding: 'MEDIA', name: 'fellowship42-church-website-media' },
      sessionKv: {
        binding: 'SESSION',
        name: 'fellowship42-church-website-session',
      },
    },
  },
}
const installationDomains = [
  ...destinationManifest.worker.domains,
  ...destinationManifest.website.worker.domains,
]

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function restoredExactly(restored, expected) {
  return (
    restored.size === expected.size &&
    [...expected].every(
      ([key, digest]) =>
        restored.has(key) && sha256(restored.get(key)) === digest,
    )
  )
}

class RehearsalAdapter {
  constructor({
    destinationD1,
    destinationR2,
    destinationWebsiteD1,
    destinationWebsiteR2,
    sourceD1Bytes,
    sourceWebsiteD1Bytes,
    expectedObjects,
    expectedWebsiteObjects,
    websiteSecrets,
  }) {
    this.destinationD1 = destinationD1
    this.destinationR2 = destinationR2
    this.destinationWebsiteD1 = destinationWebsiteD1
    this.destinationWebsiteR2 = destinationWebsiteR2
    this.sourceD1Bytes = sourceD1Bytes
    this.sourceWebsiteD1Bytes = sourceWebsiteD1Bytes
    this.expectedObjects = expectedObjects
    this.expectedWebsiteObjects = expectedWebsiteObjects
    this.websiteSecrets = websiteSecrets
    this.objects = new Map()
    this.websiteObjects = new Map()
    this.destinationWasNewAndEmpty = false
    this.d1Bytes = null
    this.websiteD1Bytes = null
    this.workerDeployed = false
    this.website = null
    this.forwardMigrationsApplied = false
    this.rotations = new Set()
    this.identityPreserved = false
    this.runtimeVerified = false
    this.websiteRuntimeVerified = false
    this.cutoverApplied = false
    this.independentVerified = false
    this.sourceRoutingRetired = false
  }

  async preflight({ plan }) {
    const entries = await Promise.all(
      [
        this.destinationD1,
        this.destinationR2,
        this.destinationWebsiteD1,
        this.destinationWebsiteR2,
      ].map((directory) => readdir(directory)),
    )
    this.destinationWasNewAndEmpty =
      entries.every((directory) => directory.length === 0) &&
      !this.workerDeployed &&
      this.website === null
    if (!this.destinationWasNewAndEmpty) {
      throw new Error('Destination account boundary is not new and empty.')
    }
    const empty = { state: 'empty', createdAt: '2026-07-19T22:00:30.000Z' }
    return {
      formatVersion: 1,
      operationId: plan.operationId,
      instanceId: plan.instanceId,
      destinationManifestSha256: plan.destinationManifestSha256,
      observedAt: '2026-07-19T22:01:00.000Z',
      d1: empty,
      r2: empty,
      worker: 'absent',
      outboxQueue: 'absent',
      deadLetterQueue: 'absent',
      durableObjectNamespace: 'absent',
      website: { d1: empty, r2: empty, worker: 'absent', sessionKv: 'absent' },
    }
  }

  async restoreD1({ sqlPath }) {
    this.d1Bytes = await readFile(sqlPath)
    await writeFile(
      path.join(this.destinationD1, 'database.sql'),
      this.d1Bytes,
      {
        flag: 'wx',
      },
    )
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

  async restoreWebsiteD1({ sqlPath }) {
    this.websiteD1Bytes = await readFile(sqlPath)
    await writeFile(
      path.join(this.destinationWebsiteD1, 'database.sql'),
      this.websiteD1Bytes,
      { flag: 'wx' },
    )
  }

  async restoreWebsiteR2Object({
    key,
    filePath,
    bytes,
    sha256: expectedSha256,
  }) {
    const contents = await readFile(filePath)
    if (
      contents.byteLength !== bytes ||
      sha256(contents) !== expectedSha256 ||
      this.websiteObjects.has(key)
    ) {
      throw new Error(
        'Website R2 rehearsal object failed integrity verification.',
      )
    }
    this.websiteObjects.set(key, contents)
    await writeFile(
      path.join(this.destinationWebsiteR2, `${expectedSha256}.object`),
      contents,
      { flag: 'wx' },
    )
  }

  async applyForwardMigrations({ plan }) {
    if (
      plan.sourceRelease.schemaVersion !== plan.destinationRelease.schemaVersion
    ) {
      throw new Error('Rehearsal unexpectedly requires a schema migration.')
    }
    this.forwardMigrationsApplied = true
  }

  async deployWithoutDomains() {
    if (!this.forwardMigrationsApplied)
      throw new Error('Migrations were not applied.')
    this.workerDeployed = true
  }

  async deployWebsiteWithoutDomains({ destination }) {
    if (!this.workerDeployed || this.websiteD1Bytes === null) {
      throw new Error('The instance and website data must precede the website.')
    }
    // A fresh, empty session namespace; the preserved encryption key; and the
    // identity digest pinned to the destination's portable identity.
    this.website = {
      sessions: new Map(),
      encryptionKey: this.websiteSecrets.encryptionKey,
      setupSecret: this.websiteSecrets.setupSecret,
      instanceSha256: sha256(destination.instance.id),
    }
  }

  async rotateDeploymentCredentials() {
    this.rotations.add('deployment')
  }

  async rotateApplicationSecrets() {
    // The first administrator was claimed at the source, so the shared setup
    // secret is removed rather than rotated.
    if (this.website) this.website.setupSecret = null
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
    this.runtimeVerified =
      d1Matches &&
      restoredExactly(this.objects, this.expectedObjects) &&
      this.workerDeployed &&
      this.rotations.size === 3 &&
      this.identityPreserved
    return this.runtimeVerified
  }

  async verifyWebsiteRuntime({ plan }) {
    const website = this.website
    this.websiteRuntimeVerified =
      this.runtimeVerified &&
      website !== null &&
      this.websiteD1Bytes !== null &&
      sha256(this.websiteD1Bytes) === sha256(this.sourceWebsiteD1Bytes) &&
      restoredExactly(this.websiteObjects, this.expectedWebsiteObjects) &&
      website.sessions.size === 0 &&
      website.encryptionKey === this.websiteSecrets.encryptionKey &&
      website.setupSecret === null &&
      website.instanceSha256 === sha256(plan.instanceId)
    return this.websiteRuntimeVerified
  }

  async cutoverDomains({ approval }) {
    if (
      !this.runtimeVerified ||
      !this.websiteRuntimeVerified ||
      JSON.stringify(approval.domains) !== JSON.stringify(installationDomains)
    ) {
      throw new Error('Destination was not ready for routing cutover.')
    }
    this.cutoverApplied = true
  }

  async verifyIndependentOperation() {
    this.independentVerified =
      this.cutoverApplied && this.runtimeVerified && this.websiteRuntimeVerified
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
      r2RestoredExactly: restoredExactly(this.objects, this.expectedObjects),
      websiteD1RestoredExactly:
        this.websiteD1Bytes !== null &&
        sha256(this.websiteD1Bytes) === sha256(this.sourceWebsiteD1Bytes),
      websiteR2RestoredExactly: restoredExactly(
        this.websiteObjects,
        this.expectedWebsiteObjects,
      ),
      credentialsRotated: this.rotations.size === 3,
      portableIdentityPreserved: this.identityPreserved,
      runtimeHealthy: this.runtimeVerified,
      websiteRuntimeHealthy: this.websiteRuntimeVerified,
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
  const sourceWebsiteR2 = path.join(sourceRoot, 'website-r2')
  const destinationRoot = path.join(temporaryRoot, 'church-account')
  const destinationD1 = path.join(destinationRoot, 'd1')
  const destinationR2 = path.join(destinationRoot, 'r2')
  const destinationWebsiteD1 = path.join(destinationRoot, 'website-d1')
  const destinationWebsiteR2 = path.join(destinationRoot, 'website-r2')
  const bundle = path.join(temporaryRoot, 'portable-export')
  await Promise.all(
    [
      sourceR2,
      sourceWebsiteR2,
      destinationD1,
      destinationR2,
      destinationWebsiteD1,
      destinationWebsiteR2,
    ].map((directory) => mkdir(directory, { recursive: true })),
  )
  const sourceManifestPath = path.join(sourceRoot, 'deployment-manifest.json')
  const destinationManifestPath = path.join(
    destinationRoot,
    'deployment-manifest.json',
  )
  const d1Path = path.join(sourceRoot, 'database.sql')
  const r2IndexPath = path.join(sourceRoot, 'r2-index.json')
  const websiteD1Path = path.join(sourceRoot, 'website.sql')
  const websiteR2IndexPath = path.join(sourceRoot, 'website-r2-index.json')
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
  const websiteD1Contents = Buffer.from(
    `CREATE TABLE _emdash_migrations (name TEXT PRIMARY KEY, timestamp TEXT NOT NULL);\n` +
      `INSERT INTO _emdash_migrations VALUES ('001_initial', '2026-07-19T20:00:00.000Z');\n` +
      `CREATE TABLE ec_pages (id TEXT PRIMARY KEY, slug TEXT NOT NULL);\n` +
      `INSERT INTO ec_pages VALUES ('page_1', 'welcome');\n`,
  )
  // The welcome image is shared with the instance bucket to exercise the
  // single content-addressed object store.
  const websiteMedia = new Map([
    ['uploads/welcome.txt', Buffer.from('Welcome to the portable church.')],
    ['uploads/hero.txt', Buffer.from('Synthetic website hero image.')],
  ])
  const writeCapture = async (root, objects, indexPath) => {
    await Promise.all(
      [...objects.values()].map((contents, index) =>
        writeFile(path.join(root, `object-${index + 1}.bin`), contents, {
          flag: 'wx',
        }),
      ),
    )
    await writeFile(
      indexPath,
      JSON.stringify({
        formatVersion: 1,
        objects: [...objects.keys()].map((key, index) => ({
          key,
          file: `object-${index + 1}.bin`,
        })),
      }),
      { flag: 'wx' },
    )
  }
  await Promise.all([
    writeFile(sourceManifestPath, JSON.stringify(sourceManifest), {
      flag: 'wx',
    }),
    writeFile(destinationManifestPath, JSON.stringify(destinationManifest), {
      flag: 'wx',
    }),
    writeFile(d1Path, d1Contents, { flag: 'wx' }),
    writeFile(websiteD1Path, websiteD1Contents, { flag: 'wx' }),
    writeCapture(sourceR2, media, r2IndexPath),
    writeCapture(sourceWebsiteR2, websiteMedia, websiteR2IndexPath),
  ])
  const exportManifest = portableExportManifestSchema.parse(
    await assemblePortableExport({
      deploymentManifestPath: sourceManifestPath,
      d1ExportPath: d1Path,
      r2SourceIndexPath: r2IndexPath,
      r2SourceRoot: sourceR2,
      website: {
        d1ExportPath: websiteD1Path,
        r2SourceIndexPath: websiteR2IndexPath,
        r2SourceRoot: sourceWebsiteR2,
      },
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
  const digests = (objects) =>
    new Map([...objects].map(([key, contents]) => [key, sha256(contents)]))
  const adapter = new RehearsalAdapter({
    destinationD1,
    destinationR2,
    destinationWebsiteD1,
    destinationWebsiteR2,
    sourceD1Bytes: d1Contents,
    sourceWebsiteD1Bytes: websiteD1Contents,
    expectedObjects: digests(media),
    expectedWebsiteObjects: digests(websiteMedia),
    websiteSecrets: {
      encryptionKey: 'synthetic-emdash-encryption-key',
      setupSecret: 'synthetic-website-setup-secret',
    },
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
      website: {
        encryptionKey: 'preserved',
        setupSecret: 'removed',
        sessionStore: 'recreated',
      },
    },
    domains: installationDomains,
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
