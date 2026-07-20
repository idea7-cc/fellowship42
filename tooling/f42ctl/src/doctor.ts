import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { parse as parseJsonc } from 'jsonc-parser'
import {
  doctorReportSchema,
  deploymentManifestSchema,
  instanceHealthObservationSchema,
  instanceRuntimeHealthSchema,
  releaseManifestSchema,
  type DeploymentManifest,
  type DoctorReport,
  type InstanceHealthObservation,
} from '@fellowship42/management-protocol'
import { canonicalJson } from './plan.js'

type Check = DoctorReport['checks'][number]
type ReleaseCheck = Pick<Check, 'status' | 'code'>
const MAX_RELEASE_MANIFEST_BYTES = 64 * 1024
const NETWORK_TIMEOUT_MS = 10_000

function componentFromDoctorCheck(
  report: DoctorReport,
  id: Check['id'],
): InstanceHealthObservation['checks']['database'] {
  const status = report.checks.find((item) => item.id === id)?.status
  if (status === 'pass') return 'ready'
  if (status === 'warning') return 'degraded'
  if (status === 'fail') return 'unavailable'
  return 'unknown'
}

export function healthObservationFromDoctorReport(
  reportInput: unknown,
  options: {
    runtimeHealth?: unknown
    connection?: InstanceHealthObservation['connection']
  } = {},
): InstanceHealthObservation {
  const report = doctorReportSchema.parse(reportInput)
  const runtimeResult =
    options.runtimeHealth === undefined
      ? null
      : instanceRuntimeHealthSchema.safeParse(options.runtimeHealth)
  const runtime = runtimeResult?.success ? runtimeResult.data : null
  const schemaCheck = report.checks.find(
    (item) => item.id === 'schema-version',
  )?.status
  const outboxCheck = report.checks.find(
    (item) => item.id === 'outbox-queue',
  )?.status
  const outbox = runtime
    ? runtime.outbox === 'clear'
      ? 'clear'
      : runtime.outbox === 'backlogged'
        ? 'backlog-small'
        : 'blocked'
    : outboxCheck === 'fail'
      ? 'blocked'
      : 'unknown'

  return instanceHealthObservationSchema.parse({
    formatVersion: 1,
    portableInstanceId: report.instanceId,
    observedAt: report.checkedAt,
    source: 'instance-doctor',
    overallStatus:
      report.status === 'healthy'
        ? 'healthy'
        : report.status === 'failed'
          ? 'degraded'
          : 'unknown',
    release: {
      applicationVersion: report.release.applicationVersion,
      schemaVersion: report.release.schemaVersion,
      managementProtocolWireVersion:
        report.release.managementProtocolWireVersion,
    },
    connection: options.connection ?? {
      status: 'unknown',
      grantVersion: null,
    },
    checks: {
      database: componentFromDoctorCheck(report, 'd1-binding'),
      objectStorage: componentFromDoctorCheck(report, 'r2-binding'),
      authentication: componentFromDoctorCheck(report, 'access'),
      migrations:
        schemaCheck === 'pass'
          ? 'current'
          : schemaCheck === 'fail'
            ? 'failed'
            : 'unknown',
      realtime: componentFromDoctorCheck(report, 'durable-object'),
      paymentWebhooks: runtime?.paymentWebhooks ?? 'unknown',
      outbox,
    },
    traffic: {
      availability: 'unknown',
      errorRate: 'unknown',
      latency: 'unknown',
      window: 'unknown',
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function namedBinding(
  collection: unknown,
  binding: string,
  expectedName: string,
  nameKey: string,
  bindingKey = 'binding',
) {
  if (!Array.isArray(collection)) return false
  return collection.some((item) => {
    const record = asRecord(item)
    return record[bindingKey] === binding && record[nameKey] === expectedName
  })
}

function check(
  id: Check['id'],
  passing: boolean,
  passCode: string,
  failCode: string,
): Check {
  return {
    id,
    status: passing ? 'pass' : 'fail',
    code: passing ? passCode : failCode,
  }
}

export async function verifyPublishedRelease(
  manifest: DeploymentManifest,
  fetcher: typeof fetch = fetch,
): Promise<ReleaseCheck> {
  try {
    const response = await fetcher(manifest.instance.release.manifestUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    })
    if (!response.ok) return { status: 'fail', code: 'release-download-failed' }
    const declaredLength = Number(response.headers.get('content-length'))
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_RELEASE_MANIFEST_BYTES
    ) {
      return { status: 'fail', code: 'release-manifest-too-large' }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_RELEASE_MANIFEST_BYTES) {
      return { status: 'fail', code: 'release-manifest-too-large' }
    }
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== manifest.instance.release.manifestSha256) {
      return { status: 'fail', code: 'release-digest-mismatch' }
    }
    const published = releaseManifestSchema.parse(
      JSON.parse(new TextDecoder().decode(bytes)),
    )
    const expected = manifest.instance.release
    const compatible =
      published.application.version === expected.applicationVersion &&
      published.application.schemaVersion === expected.schemaVersion &&
      published.source.commit === expected.sourceCommit &&
      published.managementProtocol.packageVersion ===
        expected.managementProtocolPackageVersion &&
      published.managementProtocol.wireVersion ===
        expected.managementProtocolWireVersion
    return compatible
      ? { status: 'pass', code: 'release-verified' }
      : { status: 'fail', code: 'release-version-mismatch' }
  } catch {
    return { status: 'fail', code: 'release-invalid' }
  }
}

export async function inspectDeployment(input: {
  manifest: unknown
  wrangler: unknown
  migrationFiles: string[]
  runtimeHealth?: unknown
  releaseCheck?: ReleaseCheck
  checkedAt?: string
}): Promise<DoctorReport> {
  const manifest = deploymentManifestSchema.parse(input.manifest)
  const wrangler = asRecord(input.wrangler)
  const resources = manifest.resources
  const queues = asRecord(wrangler.queues)
  const durableObjects = asRecord(wrangler.durable_objects)
  const triggers = asRecord(wrangler.triggers)
  const variables = asRecord(wrangler.vars)
  const migrations = input.migrationFiles
    .map((name) => Number(name.match(/^(\d+)_/)?.[1]))
    .filter((value) => Number.isInteger(value))
  const schemaVersion = migrations.length ? Math.max(...migrations) : 0
  const consumers = Array.isArray(queues.consumers) ? queues.consumers : []
  const consumerMatches = consumers.some((item) => {
    const record = asRecord(item)
    return (
      record.queue === resources.outboxQueue.name &&
      record.dead_letter_queue === resources.outboxQueue.deadLetterName
    )
  })
  const expectedDomains = [...manifest.worker.domains].sort()
  const configuredDomains = (
    Array.isArray(wrangler.routes) ? wrangler.routes : []
  )
    .map((route) =>
      typeof route === 'string'
        ? route
        : typeof asRecord(route).pattern === 'string'
          ? String(asRecord(route).pattern)
          : '',
    )
    .map((pattern) => pattern.replace(/^\*\./, '').replace(/\/\*$/, ''))
    .filter(Boolean)
    .sort()
  const runtimeChecked = input.runtimeHealth !== undefined
  const runtimeResult = runtimeChecked
    ? instanceRuntimeHealthSchema.safeParse(input.runtimeHealth)
    : null
  const runtime = runtimeResult?.success ? runtimeResult.data : null
  const runtimeReady =
    runtime?.status === 'ok' &&
    runtime.service === 'fellowship42-instance' &&
    runtime.topology === 'single-church'
  const portableIdentityConfigured =
    variables.F42_PORTABLE_INSTANCE_ID === manifest.instance.id
  const expectedIdentitySha256 = createHash('sha256')
    .update(manifest.instance.id)
    .digest('hex')
  const portableIdentityCheck: Check = !portableIdentityConfigured
    ? {
        id: 'portable-identity',
        status: 'fail',
        code: 'identity-configuration-mismatch',
      }
    : !runtimeChecked
      ? {
          id: 'portable-identity',
          status: 'unknown',
          code: 'identity-runtime-check-required',
        }
      : !runtimeResult?.success
        ? {
            id: 'portable-identity',
            status: 'fail',
            code: 'identity-runtime-evidence-invalid',
          }
        : runtimeResult.data.bootstrap.portableIdentitySha256 !==
              expectedIdentitySha256 ||
            ['configuration-invalid', 'identity-mismatch'].includes(
              runtimeResult.data.bootstrap.state,
            )
          ? {
              id: 'portable-identity',
              status: 'fail',
              code: 'identity-runtime-mismatch',
            }
          : {
              id: 'portable-identity',
              status: 'pass',
              code: 'identity-runtime-matches',
            }
  const accessConfigured =
    (manifest.configuration.accessTeamDomain === null ||
      variables.ACCESS_TEAM_DOMAIN ===
        manifest.configuration.accessTeamDomain) &&
    (!manifest.configuration.accessAudienceConfigured ||
      (typeof variables.ACCESS_AUD === 'string' &&
        variables.ACCESS_AUD.length > 0))

  const checks: Check[] = [
    {
      id: 'release-manifest',
      status: input.releaseCheck?.status ?? 'unknown',
      code: input.releaseCheck?.code ?? 'release-not-checked',
    },
    portableIdentityCheck,
    check(
      'worker-name',
      wrangler.name === manifest.worker.name,
      'worker-name-matches',
      'worker-name-mismatch',
    ),
    check(
      'd1-binding',
      namedBinding(
        wrangler.d1_databases,
        resources.d1.binding,
        resources.d1.name,
        'database_name',
      ),
      'd1-binding-matches',
      'd1-binding-mismatch',
    ),
    check(
      'schema-version',
      schemaVersion === manifest.instance.release.schemaVersion,
      'schema-version-matches',
      'schema-version-mismatch',
    ),
    check(
      'r2-binding',
      namedBinding(
        wrangler.r2_buckets,
        resources.r2.binding,
        resources.r2.name,
        'bucket_name',
      ),
      'r2-binding-matches',
      'r2-binding-mismatch',
    ),
    check(
      'outbox-queue',
      namedBinding(
        queues.producers,
        resources.outboxQueue.binding,
        resources.outboxQueue.name,
        'queue',
      ),
      'outbox-queue-matches',
      'outbox-queue-mismatch',
    ),
    check(
      'dead-letter-queue',
      consumerMatches,
      'dead-letter-queue-matches',
      'dead-letter-queue-mismatch',
    ),
    check(
      'durable-object',
      namedBinding(
        durableObjects.bindings,
        resources.durableObject.binding,
        resources.durableObject.className,
        'class_name',
        'name',
      ),
      'durable-object-matches',
      'durable-object-mismatch',
    ),
    check(
      'schedule',
      JSON.stringify(triggers.crons) === JSON.stringify(resources.schedules),
      'schedule-matches',
      'schedule-mismatch',
    ),
    check(
      'domains',
      JSON.stringify(configuredDomains) === JSON.stringify(expectedDomains),
      'domains-match',
      'domains-mismatch',
    ),
    check(
      'access',
      accessConfigured,
      'access-shape-matches',
      'access-shape-mismatch',
    ),
    runtimeChecked
      ? check(
          'runtime-health',
          runtimeReady,
          'runtime-healthy',
          'runtime-unhealthy',
        )
      : {
          id: 'runtime-health',
          status: 'unknown',
          code: 'runtime-not-checked',
        },
  ]
  const status = checks.some((item) => item.status === 'fail')
    ? 'failed'
    : checks.some((item) => ['warning', 'unknown'].includes(item.status))
      ? 'attention'
      : 'healthy'
  return doctorReportSchema.parse({
    formatVersion: 1,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    manifestSha256: createHash('sha256')
      .update(canonicalJson(manifest))
      .digest('hex'),
    instanceId: manifest.instance.id,
    release: manifest.instance.release,
    status,
    checks,
  })
}

export async function doctorFromFiles(options: {
  manifestPath: string
  wranglerPath: string
  migrationsPath: string
  runtimeUrl?: string
  offline?: boolean
}) {
  const manifest = deploymentManifestSchema.parse(
    JSON.parse(await readFile(options.manifestPath, 'utf8')),
  )
  const wrangler = parseJsonc(await readFile(options.wranglerPath, 'utf8'))
  const runtimeHealth = options.runtimeUrl
    ? await fetch(new URL('/api/health', options.runtimeUrl), {
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Runtime health request failed (${response.status})`)
        }
        return response.json()
      })
    : undefined
  const releaseCheck = options.offline
    ? { status: 'unknown' as const, code: 'release-not-checked' }
    : await verifyPublishedRelease(manifest)
  return inspectDeployment({
    manifest,
    wrangler,
    migrationFiles: await readdir(options.migrationsPath),
    runtimeHealth,
    releaseCheck,
  })
}
