import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deploymentManifestSchema,
  portableRestoreConformanceReportSchema,
} from '@fellowship42/management-protocol'
import type { PortableImportAdapter } from './portable-import'
import {
  runPortableRestoreConformance,
  type RestoreConformanceAdapterScenario,
} from './restore-conformance'

const sourceManifest = deploymentManifestSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../examples/deployment-manifest.local.json', import.meta.url),
      'utf8',
    ),
  ),
)

describe('portable isolated-restore conformance', () => {
  it('proves integrity, empty-destination, restore, identity, and failure boundaries', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'f42-restore-conformance-'))
    try {
      const sourceManifestPath = path.join(root, 'source.json')
      const destinationManifestPath = path.join(root, 'destination.json')
      const d1Path = path.join(root, 'database.sql')
      const mediaPath = path.join(root, 'media.bin')
      const r2IndexPath = path.join(root, 'r2-source.json')
      const outputDirectory = path.join(root, 'portable-export')
      const destination = deploymentManifestSchema.parse({
        ...sourceManifest,
        target: {
          ...sourceManifest.target,
          environment: 'staging',
          accountAlias: 'isolated-restore-test',
        },
        worker: {
          name: 'fellowship42-isolated-restore',
          domains: ['restore.example.test'],
        },
        resources: {
          ...sourceManifest.resources,
          d1: {
            ...sourceManifest.resources.d1,
            name: 'fellowship42-isolated-restore',
          },
          r2: {
            ...sourceManifest.resources.r2,
            name: 'fellowship42-isolated-restore-media',
          },
          outboxQueue: {
            ...sourceManifest.resources.outboxQueue,
            name: 'fellowship42-isolated-restore-outbox',
            deadLetterName: 'fellowship42-isolated-restore-outbox-dlq',
          },
        },
      })
      await writeFile(sourceManifestPath, JSON.stringify(sourceManifest))
      await writeFile(destinationManifestPath, JSON.stringify(destination))
      await writeFile(
        d1Path,
        `CREATE TABLE instance_metadata (instance_id TEXT);\nINSERT INTO instance_metadata VALUES ('${sourceManifest.instance.id}');\n`,
      )
      await writeFile(mediaPath, 'portable restore conformance media')
      await writeFile(
        r2IndexPath,
        JSON.stringify({
          formatVersion: 1,
          objects: [{ key: 'media/conformance.bin', file: 'media.bin' }],
        }),
      )

      const events = new Map<RestoreConformanceAdapterScenario, string[]>()
      const createAdapter = (
        scenario: RestoreConformanceAdapterScenario,
      ): PortableImportAdapter => {
        const scenarioEvents: string[] = []
        events.set(scenario, scenarioEvents)
        return {
          async preflight(context) {
            scenarioEvents.push('preflight')
            return {
              formatVersion: 1,
              operationId: context.plan.operationId,
              instanceId: context.plan.instanceId,
              destinationManifestSha256:
                context.plan.destinationManifestSha256,
              observedAt: '2026-07-20T05:03:30.000Z',
              d1: {
                state:
                  scenario === 'nonempty-destination'
                    ? 'occupied'
                    : 'empty',
                createdAt: '2026-07-20T05:03:15.000Z',
              },
              r2: {
                state: 'empty',
                createdAt: '2026-07-20T05:03:15.000Z',
              },
              worker: 'absent',
              outboxQueue: 'absent',
              deadLetterQueue: 'absent',
              durableObjectNamespace: 'absent',
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
        }
      }

      const report = await runPortableRestoreConformance({
        deploymentManifestPath: sourceManifestPath,
        d1ExportPath: d1Path,
        r2SourceIndexPath: r2IndexPath,
        r2SourceRoot: root,
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

      expect(portableRestoreConformanceReportSchema.parse(report)).toEqual(
        report,
      )
      const fixture = JSON.parse(
        await readFile(
          new URL(
            '../../../packages/management-protocol/fixtures/portable-restore-conformance.v1.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      expect(report).toEqual(fixture)
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
      expect(JSON.stringify(report)).not.toContain('restore.example.test')
      expect(JSON.stringify(report)).not.toContain('media/conformance.bin')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
