import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  reconciliationObservationSetSchema,
  reconciliationPreviewSchema,
  reconciliationReportSchema,
  type ReconciliationAdapterResult,
} from '@fellowship42/management-protocol'
import {
  ReconciliationError,
  buildReconciliationPreview,
  executeDeploymentReconciliation,
  inspectDeploymentReconciliation,
  sha256Canonical,
  type DeploymentReconciliationAdapter,
} from './reconciliation'
import {
  executeAuthorizedUpdateReconciliation,
  releaseCoordinateVariables,
  verifyUpdateDeploymentAuthorization,
} from './updates'

const fixture = JSON.parse(
  await readFile(
    new URL('../fixtures/reconciliation.staging.json', import.meta.url),
    'utf8',
  ),
)

const operationId = '42424242-1234-4678-9abc-123456789abc'
const approvedAt = '2026-07-20T03:31:00.000Z'
const expiresAt = '2026-07-20T04:31:00.000Z'

async function approval(preview: unknown) {
  return {
    formatVersion: 1,
    approvalId: '42424242-1234-4678-9abc-123456789abd',
    previewSha256: await sha256Canonical(preview),
    manifestSha256: fixture.observation.manifestSha256,
    instanceId: fixture.manifest.instance.id,
    accountAlias: fixture.manifest.target.accountAlias,
    approvedBy: 'staging-operator@example.test',
    approvedAt,
    expiresAt,
  }
}

function outcomeFor(
  action: string,
  fingerprint: string,
): ReconciliationAdapterResult {
  const statuses = {
    create: 'created',
    update: 'updated',
    execute: 'executed',
    verify: 'verified',
  } as const
  return {
    status: statuses[action as keyof typeof statuses],
    code: `${action}-succeeded`,
    resultingFingerprint: fingerprint,
  }
}

describe('provider-neutral deployment reconciliation', () => {
  it('binds instance authorization to the exact deployment release before provider effects', async () => {
    const target = fixture.manifest.instance.release
    const authorization = {
      formatVersion: 1,
      authorizationId: '11111111-1111-4111-8111-111111111111',
      preparationId: '22222222-2222-4222-8222-222222222222',
      localApprovalId: '33333333-3333-4333-8333-333333333333',
      instanceId: fixture.manifest.instance.id,
      source: {
        releaseTag: 'v0.13.0',
        releaseManifestSha256: 'b'.repeat(64),
        applicationVersion: '0.13.0',
        schemaVersion: 6,
        managementProtocolWireVersion: '1',
      },
      target: {
        releaseTag: target.tag,
        releaseManifestSha256: target.manifestSha256,
        applicationVersion: target.applicationVersion,
        schemaVersion: target.schemaVersion,
        managementProtocolWireVersion: target.managementProtocolWireVersion,
      },
      strategy: 'in-place-expand-contract',
      rollbackPolicy: 'roll-forward-after-migration',
      authorizedAt: '2026-07-20T03:30:00.000Z',
      expiresAt: '2026-07-20T04:30:00.000Z',
    }
    expect(
      verifyUpdateDeploymentAuthorization(
        authorization,
        fixture.manifest,
        Date.parse('2026-07-20T03:32:00.000Z'),
      ),
    ).toEqual(authorization)
    expect(releaseCoordinateVariables(fixture.manifest)).toEqual({
      F42_RELEASE_TAG: target.tag,
      F42_RELEASE_MANIFEST_SHA256: target.manifestSha256,
    })
    expect(() =>
      verifyUpdateDeploymentAuthorization(
        {
          ...authorization,
          target: { ...authorization.target, releaseManifestSha256: 'f'.repeat(64) },
        },
        fixture.manifest,
        Date.parse('2026-07-20T03:32:00.000Z'),
      ),
    ).toThrowError(ReconciliationError)

    const preview = await buildReconciliationPreview(
      fixture.manifest,
      fixture.observation,
    )
    let calls = 0
    await expect(
      executeAuthorizedUpdateReconciliation({
        authorization: { ...authorization, expiresAt: '2026-07-20T03:31:00.000Z' },
        manifest: fixture.manifest,
        preview,
        approval: await approval(preview),
        adapter: {
          apply: async () => {
            calls += 1
            throw new Error('must not run')
          },
        },
        operationId,
        idempotencyKey: 'expired-update',
        now: Date.parse('2026-07-20T03:32:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'update_authorization_not_current' })
    expect(calls).toBe(0)
  })

  it('builds the exact non-destructive staging preview from bounded observations', async () => {
    const preview = await buildReconciliationPreview(
      fixture.manifest,
      fixture.observation,
    )

    expect(reconciliationPreviewSchema.parse(preview)).toEqual(preview)
    expect(preview.status).toBe('ready')
    expect(preview.changes.map(({ action }) => action)).toEqual([
      'verify',
      'create',
      'create',
      'create',
      'create',
      'create',
      'execute',
      'execute',
      'update',
      'update',
      'verify',
    ])
    expect(preview.changes.every(({ destructive }) => destructive === false)).toBe(
      true,
    )
    expect(JSON.stringify(preview)).not.toContain('accountId')
    expect(JSON.stringify(preview)).not.toContain('resourceId')

    const reordered = await buildReconciliationPreview(
      {
        configuration: fixture.manifest.configuration,
        resources: fixture.manifest.resources,
        worker: fixture.manifest.worker,
        target: fixture.manifest.target,
        custody: fixture.manifest.custody,
        instance: fixture.manifest.instance,
        formatVersion: fixture.manifest.formatVersion,
      },
      fixture.observation,
    )
    expect(reordered).toEqual(preview)
  })

  it('blocks unknown, foreign, unverified, and contradictory observations', async () => {
    const ready = await buildReconciliationPreview(
      fixture.manifest,
      fixture.observation,
    )
    for (const [state, ownership, fingerprint] of [
      ['unknown', 'not-applicable', null],
      ['drifted', 'foreign', 'a'.repeat(64)],
      ['drifted', 'unverified', 'a'.repeat(64)],
      ['matching', 'verified', 'a'.repeat(64)],
    ] as const) {
      const observation = structuredClone(fixture.observation)
      observation.steps[1] = {
        ...observation.steps[1],
        state,
        ownership,
        actualFingerprint: fingerprint,
      }
      const blocked = await buildReconciliationPreview(
        fixture.manifest,
        observation,
      )
      expect(blocked.status).toBe('blocked')
      expect(blocked.changes[1].action).toBe('blocked')
    }

    const matching = {
      ...fixture.observation,
      steps: fixture.observation.steps.map(
        (step: Record<string, unknown>, index: number) => ({
          ...step,
          state: 'matching',
          ownership: 'verified',
          actualFingerprint: ready.changes[index].desiredFingerprint,
          code: 'resource-matching',
        }),
      ),
    }
    const noop = await buildReconciliationPreview(fixture.manifest, matching)
    expect(noop.status).toBe('ready')
    expect(noop.changes.every(({ action }) => action === 'none')).toBe(true)
  })

  it('binds adapter observation to the exact manifest and account alias', async () => {
    const adapter = {
      observe: async () => fixture.observation,
    }
    await expect(
      inspectDeploymentReconciliation({ manifest: fixture.manifest, adapter }),
    ).resolves.toMatchObject({ status: 'ready' })

    await expect(
      buildReconciliationPreview(fixture.manifest, {
        ...fixture.observation,
        accountAlias: 'another-account',
      }),
    ).rejects.toMatchObject({ code: 'observation_binding_mismatch' })

    await expect(
      inspectDeploymentReconciliation({
        manifest: fixture.manifest,
        adapter: {
          observe: async () => {
            throw new Error('raw provider error with a token')
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'adapter_observation_failed',
      message: 'The provider observation could not be obtained or validated.',
    })
  })

  it('executes an approved preview idempotently through an injected adapter', async () => {
    const preview = await buildReconciliationPreview(
      fixture.manifest,
      fixture.observation,
    )
    const accepted = await approval(preview)
    const outcomes = new Map<string, ReconciliationAdapterResult>()
    const applied: string[] = []
    const adapter: Pick<DeploymentReconciliationAdapter, 'apply'> = {
      apply: async (input) => {
        const prior = outcomes.get(input.idempotencyKey)
        if (prior) return prior
        applied.push(input.idempotencyKey)
        const result = outcomeFor(
          input.step.action,
          input.step.desiredFingerprint,
        )
        outcomes.set(input.idempotencyKey, result)
        return result
      },
    }
    const execute = () =>
      executeDeploymentReconciliation({
        manifest: fixture.manifest,
        preview,
        approval: accepted,
        adapter,
        operationId,
        idempotencyKey: 'staging-reconciliation-1',
        now: Date.parse('2026-07-20T03:32:00.000Z'),
        clock: () => '2026-07-20T03:32:00.000Z',
      })

    const first = await execute()
    const replay = await execute()
    expect(reconciliationReportSchema.parse(first)).toEqual(first)
    expect(first).toEqual(replay)
    expect(first.status).toBe('succeeded')
    expect(first.steps).toHaveLength(11)
    expect(applied).toHaveLength(11)
    expect(JSON.stringify(first)).not.toContain('staging-reconciliation-1')
  })

  it('fails closed before or during provider effects with bounded evidence', async () => {
    const preview = await buildReconciliationPreview(
      fixture.manifest,
      fixture.observation,
    )
    const accepted = await approval(preview)
    let calls = 0
    const adapter: Pick<DeploymentReconciliationAdapter, 'apply'> = {
      apply: async (input) => {
        calls += 1
        if (input.step.stepId === 'step-03') throw new Error('raw provider payload')
        return outcomeFor(input.step.action, input.step.desiredFingerprint)
      },
    }

    const failed = await executeDeploymentReconciliation({
      manifest: fixture.manifest,
      preview,
      approval: accepted,
      adapter,
      operationId,
      idempotencyKey: 'staging-reconciliation-failure',
      now: Date.parse('2026-07-20T03:32:00.000Z'),
      clock: () => '2026-07-20T03:32:00.000Z',
    })
    expect(failed.status).toBe('failed')
    expect(failed.steps.at(-1)).toMatchObject({
      stepId: 'step-03',
      status: 'failed',
      code: 'adapter-call-failed',
    })
    expect(calls).toBe(3)
    expect(JSON.stringify(failed)).not.toContain('raw provider payload')

    await expect(
      executeDeploymentReconciliation({
        manifest: fixture.manifest,
        preview,
        approval: { ...accepted, previewSha256: 'a'.repeat(64) },
        adapter,
        operationId,
        idempotencyKey: 'approval-mismatch',
        now: Date.parse('2026-07-20T03:32:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ReconciliationError)
    expect(calls).toBe(3)

    const tampered = structuredClone(preview)
    tampered.changes[1].desiredFingerprint = 'b'.repeat(64)
    const tamperedApproval = await approval(tampered)
    await expect(
      executeDeploymentReconciliation({
        manifest: fixture.manifest,
        preview: tampered,
        approval: tamperedApproval,
        adapter,
        operationId,
        idempotencyKey: 'tampered-preview',
        now: Date.parse('2026-07-20T03:32:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'preview_plan_mismatch' })
    expect(calls).toBe(3)
  })

  it('rejects adapter success that does not prove the desired fingerprint', async () => {
    const preview = await buildReconciliationPreview(
      fixture.manifest,
      fixture.observation,
    )
    const accepted = await approval(preview)
    let calls = 0
    const failed = await executeDeploymentReconciliation({
      manifest: fixture.manifest,
      preview,
      approval: accepted,
      adapter: {
        apply: async () => {
          calls += 1
          return {
            status: 'verified',
            code: 'verification-succeeded',
            resultingFingerprint: 'a'.repeat(64),
          }
        },
      },
      operationId,
      idempotencyKey: 'wrong-result-fingerprint',
      now: Date.parse('2026-07-20T03:32:00.000Z'),
      clock: () => '2026-07-20T03:32:00.000Z',
    })

    expect(failed).toMatchObject({
      status: 'failed',
      steps: [{ status: 'failed', code: 'adapter-outcome-mismatch' }],
    })
    expect(calls).toBe(1)
  })

  it('publishes a Worker-safe reconciliation subpath', async () => {
    for (const compiledPath of [
      '../dist/canonical.js',
      '../dist/plan-shape.js',
      '../dist/reconciliation.js',
    ]) {
      const compiled = await readFile(new URL(compiledPath, import.meta.url), 'utf8')
      expect(compiled).not.toContain('node:')
      expect(compiled).not.toContain('process.')
    }
    expect(reconciliationObservationSetSchema.parse(fixture.observation)).toEqual(
      fixture.observation,
    )
  })
})
