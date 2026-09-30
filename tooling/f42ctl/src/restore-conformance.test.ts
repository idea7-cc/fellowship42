import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deploymentManifestSchema,
  portableRestoreConformanceReportSchema,
  type DeploymentManifest,
} from '@fellowship42/management-protocol'
import type { PortableImportAdapter } from './portable-import'
import {
  runPortableRestoreConformance,
  type RestoreConformanceAdapterScenario,
} from './restore-conformance'

async function example(name: string) {
  return deploymentManifestSchema.parse(
    JSON.parse(
      await readFile(new URL(`../examples/${name}`, import.meta.url), 'utf8'),
    ),
  )
}

const instanceManifest = await example('deployment-manifest.local.json')
const websiteManifest = await example('deployment-manifest.website.json')

const fixture = JSON.parse(
  await readFile(
    new URL(
      '../../../packages/management-protocol/fixtures/portable-restore-conformance.v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

function isolatedDestination(source: DeploymentManifest): DeploymentManifest {
  return deploymentManifestSchema.parse({
    ...source,
    target: {
      ...source.target,
      environment: 'staging',
      accountAlias: 'isolated-restore-test',
    },
    worker: {
      name: 'fellowship42-isolated-restore',
      domains: ['restore.example.test'],
    },
    resources: {
      ...source.resources,
      d1: { ...source.resources.d1, name: 'fellowship42-isolated-restore' },
      r2: {
        ...source.resources.r2,
        name: 'fellowship42-isolated-restore-media',
      },
      outboxQueue: {
        ...source.resources.outboxQueue,
        name: 'fellowship42-isolated-restore-outbox',
        deadLetterName: 'fellowship42-isolated-restore-outbox-dlq',
      },
    },
    ...(source.website
      ? {
          website: {
            ...source.website,
            worker: {
              name: 'fellowship42-isolated-website',
              domains: ['www.restore.example.test'],
            },
            resources: {
              ...source.website.resources,
              d1: {
                ...source.website.resources.d1,
                name: 'fellowship42-isolated-website',
              },
              r2: {
                ...source.website.resources.r2,
                name: 'fellowship42-isolated-website-media',
              },
              sessionKv: {
                ...source.website.resources.sessionKv,
                name: 'fellowship42-isolated-website-session',
              },
            },
          },
        }
      : {}),
  })
}

async function runConformance(
  sourceManifest: DeploymentManifest,
  { emptyWebsiteBucket = false } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'f42-restore-conformance-'))
  try {
    const sourceManifestPath = path.join(root, 'source.json')
    const destinationManifestPath = path.join(root, 'destination.json')
    const d1Path = path.join(root, 'database.sql')
    const r2IndexPath = path.join(root, 'r2-source.json')
    const websiteD1Path = path.join(root, 'website.sql')
    const websiteR2IndexPath = path.join(root, 'website-r2-source.json')
    const outputDirectory = path.join(root, 'portable-export')
    const website = Boolean(sourceManifest.website)
    await writeFile(sourceManifestPath, JSON.stringify(sourceManifest))
    await writeFile(
      destinationManifestPath,
      JSON.stringify(isolatedDestination(sourceManifest)),
    )
    await writeFile(
      d1Path,
      `CREATE TABLE instance_metadata (instance_id TEXT);\nINSERT INTO instance_metadata VALUES ('${sourceManifest.instance.id}');\n`,
    )
    await writeFile(
      path.join(root, 'media.bin'),
      'portable restore conformance media',
    )
    await writeFile(
      r2IndexPath,
      JSON.stringify({
        formatVersion: 1,
        objects: [{ key: 'media/conformance.bin', file: 'media.bin' }],
      }),
    )
    if (website) {
      await writeFile(
        websiteD1Path,
        'CREATE TABLE _emdash_migrations (name TEXT PRIMARY KEY);\n',
      )
      await writeFile(path.join(root, 'website.bin'), 'website hero image')
      await writeFile(
        websiteR2IndexPath,
        JSON.stringify({
          formatVersion: 1,
          objects: emptyWebsiteBucket
            ? []
            : [{ key: 'uploads/hero.bin', file: 'website.bin' }],
        }),
      )
    }

    const events = new Map<RestoreConformanceAdapterScenario, string[]>()
    const createAdapter = (
      scenario: RestoreConformanceAdapterScenario,
    ): PortableImportAdapter => {
      const scenarioEvents: string[] = []
      events.set(scenario, scenarioEvents)
      const empty = {
        state: 'empty' as const,
        createdAt: '2026-07-20T05:03:15.000Z',
      }
      return {
        async preflight(context) {
          scenarioEvents.push('preflight')
          return {
            formatVersion: 1,
            operationId: context.plan.operationId,
            instanceId: context.plan.instanceId,
            destinationManifestSha256: context.plan.destinationManifestSha256,
            observedAt: '2026-07-20T05:03:30.000Z',
            d1: {
              ...empty,
              state: scenario === 'nonempty-destination' ? 'occupied' : 'empty',
            },
            r2: empty,
            worker: 'absent',
            outboxQueue: 'absent',
            deadLetterQueue: 'absent',
            durableObjectNamespace: 'absent',
            ...(website
              ? {
                  website: {
                    d1: empty,
                    r2: empty,
                    worker: 'absent' as const,
                    sessionKv: 'absent' as const,
                  },
                }
              : {}),
          }
        },
        async restoreD1() {
          scenarioEvents.push('restore-d1')
        },
        async restoreR2Object() {
          scenarioEvents.push('restore-r2')
          if (scenario === 'partial-restore') {
            throw new Error('synthetic R2 restore failure')
          }
        },
        async applyForwardMigrations() {
          scenarioEvents.push('migrate')
        },
        async deployWithoutDomains() {
          scenarioEvents.push('deploy-domainless')
        },
        async rotateDeploymentCredentials() {
          scenarioEvents.push('rotate-deployment')
        },
        async rotateApplicationSecrets() {
          scenarioEvents.push('rotate-application')
        },
        async rotateManagementCredentials() {
          scenarioEvents.push('rotate-management')
        },
        async verifyRestoredIdentity() {
          scenarioEvents.push('verify-identity')
          return sourceManifest.instance.id
        },
        async verifyRuntime() {
          scenarioEvents.push('verify-runtime')
          return true
        },
        async cutoverDomains() {
          scenarioEvents.push('cutover')
        },
        async verifyIndependentOperation() {
          scenarioEvents.push('verify-independent')
          return true
        },
        async retireSourceRouting() {
          scenarioEvents.push('retire-source')
        },
        ...(website
          ? {
              async restoreWebsiteD1() {
                scenarioEvents.push('restore-website-d1')
              },
              async restoreWebsiteR2Object() {
                scenarioEvents.push('restore-website-r2')
              },
              async deployWebsiteWithoutDomains() {
                scenarioEvents.push('deploy-website-domainless')
              },
              async verifyWebsiteRuntime() {
                scenarioEvents.push('verify-website-runtime')
                return true
              },
            }
          : {}),
      }
    }

    const report = await runPortableRestoreConformance({
      deploymentManifestPath: sourceManifestPath,
      d1ExportPath: d1Path,
      r2SourceIndexPath: r2IndexPath,
      r2SourceRoot: root,
      ...(website
        ? {
            website: {
              d1ExportPath: websiteD1Path,
              r2SourceIndexPath: websiteR2IndexPath,
              r2SourceRoot: root,
            },
          }
        : {}),
      destinationManifestPath,
      outputDirectory,
      harness: { createAdapter },
      release: {
        applicationVersion: '0.17.0',
        schemaVersion: 6,
        managementProtocolPackageVersion: '1.5.0',
        lifecycleCliVersion: '0.8.0',
        exportFormatVersion: 1,
        importFormatVersion: 1,
      },
      startedAt: '2026-07-20T05:00:00.000Z',
    })
    return { report, events }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('portable isolated-restore conformance', () => {
  it('proves integrity, empty-destination, restore, identity, and failure boundaries for the generated installation', async () => {
    const { report, events } = await runConformance(websiteManifest)

    expect(portableRestoreConformanceReportSchema.parse(report)).toEqual(report)
    expect(report).toEqual(fixture)
    expect(report.scenarios).toHaveLength(10)
    expect(events.get('isolated-restore')).toEqual([
      'preflight',
      'restore-d1',
      'restore-r2',
      'restore-website-d1',
      'restore-website-r2',
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
    expect(events.get('nonempty-destination')).toEqual(['preflight'])
    expect(events.get('partial-restore')).toEqual([
      'preflight',
      'restore-d1',
      'restore-r2',
    ])
    for (const privateValue of [
      'restore.example.test',
      'media/conformance.bin',
      'uploads/hero.bin',
    ]) {
      expect(JSON.stringify(report)).not.toContain(privateValue)
    }
  })

  it('refuses a website capture whose bucket would leave website R2 restore unexercised', async () => {
    await expect(
      runConformance(websiteManifest, { emptyWebsiteBucket: true }),
    ).rejects.toThrow('at least one website R2 object')
  })

  it('reports the instance-only profile without the website scenario', async () => {
    const { report, events } = await runConformance(instanceManifest)

    expect(report).toEqual({
      ...fixture,
      scenarios: fixture.scenarios.filter(
        (scenario: { id: string }) => scenario.id !== 'website-restored',
      ),
    })
    expect(report.scenarios).toHaveLength(9)
    expect(events.get('isolated-restore')).toEqual([
      'preflight',
      'restore-d1',
      'restore-r2',
      'migrate',
      'deploy-domainless',
      'rotate-deployment',
      'rotate-application',
      'rotate-management',
      'verify-identity',
      'verify-runtime',
    ])
    expect(events.get('nonempty-destination')).toEqual(['preflight'])
    expect(events.get('partial-restore')).toEqual([
      'preflight',
      'restore-d1',
      'restore-r2',
    ])
  })
})
