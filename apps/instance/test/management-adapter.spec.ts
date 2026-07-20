import { env, exports } from 'cloudflare:workers'
import {
  MANAGEMENT_PROTOCOL_VERSION,
  managementExitDispositionSchema,
  runManagementAdapterConformance,
  managementPublicKeySchema,
  signManagementPayload,
  verifyManagementJws,
  type EnrollmentChallenge,
  type ManagementCommandResult,
  type ManagementJws,
  type ManagementPublicKey,
} from '@fellowship42/management-protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import conformanceFixture from '../../../packages/management-protocol/fixtures/management-adapter-conformance.v1.json'
import {
  approveEnrollment,
  createEnrollmentChallenge,
  disconnectManagement,
  managementExitDisposition,
  managementStatus,
  rotateManagementIdentity,
  submitEnrollmentProposal,
  type ManagementBindings,
} from '../worker/management/service'
import { syncManagementOnce } from '../worker/management/sync'
import {
  approveUpdatePreparation,
  listUpdatePreparations,
} from '../worker/management/updates'

const managementEnv = env as ManagementBindings
const ownerId = 'user_demo_owner'
const encoder = new TextEncoder()

type OperatorIdentity = {
  publicKey: ManagementPublicKey
  privateKey: CryptoKey
}

type Enrollment = {
  challenge: EnrollmentChallenge
  operator: OperatorIdentity
  connectionId: string
  approval: ManagementJws
}

function nonce(): string {
  return 'AAAAAAAAAAAAAAAAAAAAAA'
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function operatorIdentity(): Promise<OperatorIdentity> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return {
    publicKey: managementPublicKeySchema.parse({
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      kid: `operator-key-${crypto.randomUUID()}`,
      use: 'sig',
      alg: 'EdDSA',
    }),
    privateKey: pair.privateKey,
  }
}

async function enroll(now = Date.now()): Promise<Enrollment> {
  const challenge = await createEnrollmentChallenge(
    env.DB,
    managementEnv,
    ownerId,
    'request-challenge',
    now,
  )
  const operator = await operatorIdentity()
  const proposal = await signManagementPayload(
    {
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      type: 'enrollment.proposal',
      messageId: crypto.randomUUID(),
      challengeId: challenge.challengeId,
      instanceId: challenge.instanceId,
      senderKeyId: operator.publicKey.kid,
      audienceKeyId: challenge.instanceKey.kid,
      nonce: nonce(),
      operator: {
        id: 'operator_test',
        displayName: 'Test Operator',
        key: operator.publicKey,
        syncUrl: 'https://operator.example.test/v1/sync',
      },
      requestedCapabilities: [
        'instance.status.read',
        'instance.health.read',
        'backup.export',
        'update.prepare',
        'update.apply',
        'management.disconnect',
      ],
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    },
    operator.privateKey,
  )
  await submitEnrollmentProposal(
    env.DB,
    {
      challengeId: challenge.challengeId,
      oneTimeCode: challenge.oneTimeCode,
      operatorKey: operator.publicKey,
      proposal,
    },
    'request-proposal',
    now,
  )
  const approved = await approveEnrollment(
    env.DB,
    managementEnv,
    challenge.challengeId,
    {
      grantVersion: 1,
      grants: [
        {
          capability: 'instance.status.read',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: false,
        },
        {
          capability: 'instance.health.read',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: false,
        },
        {
          capability: 'backup.export',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: false,
        },
        {
          capability: 'update.prepare',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: false,
        },
        {
          capability: 'update.apply',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: true,
        },
        {
          capability: 'management.disconnect',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: true,
        },
      ],
      approvedAt: new Date(now).toISOString(),
      reviewDueAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
    },
    ownerId,
    'request-approval',
    now,
  )
  return { challenge, operator, ...approved }
}

async function bodyJws(requestInit?: RequestInit): Promise<ManagementJws> {
  const parsed = JSON.parse(String(requestInit?.body)) as { jws: ManagementJws }
  return parsed.jws
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM management_command_records'),
    env.DB.prepare('DELETE FROM management_replay_records'),
    env.DB.prepare('DELETE FROM management_grants'),
    env.DB.prepare('DELETE FROM management_connections'),
    env.DB.prepare('DELETE FROM management_enrollment_challenges'),
    env.DB.prepare('DELETE FROM management_identities'),
    env.DB.prepare("DELETE FROM audit_events WHERE action LIKE 'management.%'"),
  ])
})

describe('optional management adapter', () => {
  it('passes the published instance-management adapter conformance suite', async () => {
    const now = Date.parse('2026-07-19T23:30:00.000Z')
    const report = await runManagementAdapterConformance(
      {
        createEnrollmentChallenge: (time) =>
          createEnrollmentChallenge(
            env.DB,
            managementEnv,
            ownerId,
            'conformance-challenge',
            time,
          ),
        async submitEnrollmentProposal(input, time) {
          await submitEnrollmentProposal(
            env.DB,
            input,
            'conformance-proposal',
            time,
          )
        },
        approveEnrollment: (challengeId, grants, time) =>
          approveEnrollment(
            env.DB,
            managementEnv,
            challengeId,
            grants,
            ownerId,
            'conformance-approval',
            time,
          ),
        syncOnce: (time, transport) =>
          syncManagementOnce(managementEnv, time, transport),
        async rotateInstanceIdentity(time) {
          await rotateManagementIdentity(
            env.DB,
            managementEnv,
            ownerId,
            'conformance-rotation',
            time,
          )
        },
        async disconnectLocally(time) {
          await disconnectManagement(
            env.DB,
            ownerId,
            'conformance-disconnect',
            'Public conformance completed',
            time,
          )
        },
      },
      {
        applicationVersion: '0.17.0',
        schemaVersion: 6,
        managementProtocolPackageVersion: '1.5.0',
        managementProtocolWireVersion: '1',
      },
      now,
    )
    expect(report).toEqual(conformanceFixture)
  })

  it('keeps enrollment owner-controlled and private keys encrypted at rest', async () => {
    const now = Date.now()
    const challenge = await createEnrollmentChallenge(
      env.DB,
      managementEnv,
      ownerId,
      'request-enrollment',
      now,
    )
    expect(challenge.oneTimeCode).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const identity = await env.DB.prepare(
      `SELECT public_jwk_json, private_jwk_ciphertext, private_jwk_iv
       FROM management_identities WHERE singleton = 1`,
    ).first<{
      public_jwk_json: string
      private_jwk_ciphertext: string
      private_jwk_iv: string
    }>()
    expect(identity?.public_jwk_json).not.toContain('"d"')
    expect(identity?.private_jwk_ciphertext).not.toContain('"d"')
    expect(identity?.private_jwk_ciphertext).not.toContain(challenge.instanceKey.x)
    expect(identity?.private_jwk_iv).toMatch(/^[A-Za-z0-9_-]{16}$/)

    const storedChallenge = await env.DB.prepare(
      'SELECT code_sha256 FROM management_enrollment_challenges WHERE challenge_id = ?',
    )
      .bind(challenge.challengeId)
      .first<{ code_sha256: string }>()
    expect(storedChallenge?.code_sha256).toHaveLength(64)
    expect(storedChallenge?.code_sha256).not.toBe(challenge.oneTimeCode)

    const enrolled = await enroll(now + 1_000)
    const status = await managementStatus(env.DB, now + 1_000)
    expect(status.enabled).toBe(true)
    expect(status.connection?.connectionId).toBe(enrolled.connectionId)
    expect(status.connection?.operator.displayName).toBe('Test Operator')
    expect(status.connection?.grants).toHaveLength(6)
  })

  it('polls outbound, executes only granted status, and returns byte-identical replay results', async () => {
    const now = Date.now()
    const enrolled = await enroll(now)
    let batch: ManagementJws | null = null
    const postedResults: ManagementJws[] = []
    let syncRequestCount = 0

    const transport = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const jws = await bodyJws(init)
      const payload = await verifyManagementJws(jws, enrolled.challenge.instanceKey)
      if (payload.type === 'enrollment.approval') {
        return new Response(null, { status: 204 })
      }
      if (payload.type === 'sync.request') {
        syncRequestCount += 1
        if (!batch) {
          batch = await signManagementPayload(
            {
              protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
              type: 'command.batch',
              messageId: crypto.randomUUID(),
              connectionId: enrolled.connectionId,
              instanceId: enrolled.challenge.instanceId,
              senderKeyId: enrolled.operator.publicKey.kid,
              audienceKeyId: enrolled.challenge.instanceKey.kid,
              issuedAt: new Date(now).toISOString(),
              expiresAt: new Date(now + 5 * 60_000).toISOString(),
              nonce: nonce(),
              commands: [
                {
                  protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
                  commandId: crypto.randomUUID(),
                  instanceId: enrolled.challenge.instanceId,
                  type: 'instance.status.read',
                  capability: 'instance.status.read',
                  issuedAt: new Date(now).toISOString(),
                  expiresAt: new Date(now + 5 * 60_000).toISOString(),
                  nonce: 'BBBBBBBBBBBBBBBBBBBBBB',
                  input: {},
                },
                {
                  protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
                  commandId: crypto.randomUUID(),
                  instanceId: enrolled.challenge.instanceId,
                  type: 'instance.health.read',
                  capability: 'instance.health.read',
                  issuedAt: new Date(now).toISOString(),
                  expiresAt: new Date(now + 5 * 60_000).toISOString(),
                  nonce: 'HHHHHHHHHHHHHHHHHHHHHH',
                  input: {},
                },
              ],
              nextCommandCursor: 'cursor-1',
            },
            enrolled.operator.privateKey,
          )
        }
        return Response.json({ jws: batch })
      }
      if (payload.type === 'command.results') {
        postedResults.push(jws)
        expect(payload.results[0]).toMatchObject({
          commandType: 'instance.status.read',
          status: 'succeeded',
          output: {
            kind: 'instance.status',
            application: 'healthy',
            database: 'ready',
            objectStorage: 'ready',
            backupFreshness: 'unknown',
          },
        })
        expect(payload.results[1]).toMatchObject({
          commandType: 'instance.health.read',
          status: 'succeeded',
          output: {
            kind: 'instance.health',
            observation: {
              formatVersion: 1,
              portableInstanceId: enrolled.challenge.instanceId,
              observedAt: new Date(now).toISOString(),
              source: 'management-sync',
              release: {
                applicationVersion: '0.21.0',
                schemaVersion: 7,
                managementProtocolWireVersion: '1',
              },
              connection: { status: 'connected', grantVersion: 1 },
              checks: {
                database: 'ready',
                objectStorage: 'ready',
              },
            },
          },
        })
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected message type: ${payload.type}`)
    }

    await expect(syncManagementOnce(managementEnv, now, transport)).resolves.toEqual({
      state: 'succeeded',
      commandCount: 2,
    })
    await expect(
      syncManagementOnce(managementEnv, now + 1_000, transport),
    ).resolves.toEqual({ state: 'succeeded', commandCount: 2 })
    expect(syncRequestCount).toBe(2)
    expect(postedResults).toHaveLength(2)
    expect(JSON.stringify(postedResults[1])).toBe(JSON.stringify(postedResults[0]))

    const connection = await env.DB.prepare(
      `SELECT approval_delivered_at, command_cursor, last_sync_status
       FROM management_connections WHERE connection_id = ?`,
    )
      .bind(enrolled.connectionId)
      .first<{
        approval_delivered_at: number | null
        command_cursor: string | null
        last_sync_status: string | null
      }>()
    expect(connection).toEqual({
      approval_delivered_at: now,
      command_cursor: 'cursor-1',
      last_sync_status: 'succeeded',
    })
  })

  it('prepares an exact release and consumes a fresh owner approval into deployment authorization', async () => {
    const now = Date.parse('2026-07-20T04:00:00.000Z')
    const sourceManifestSha256 = 'a'.repeat(64)
    const updateEnv = new Proxy(managementEnv, {
      get(target, property, receiver) {
        if (property === 'F42_RELEASE_TAG') return 'v0.21.0'
        if (property === 'F42_RELEASE_MANIFEST_SHA256') {
          return sourceManifestSha256
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const enrolled = await enroll(now)
    const targetManifest = {
      formatVersion: 1,
      application: {
        name: 'fellowship42',
        version: '0.22.0',
        schemaVersion: 7,
      },
      managementProtocol: {
        package: '@fellowship42/management-protocol',
        packageVersion: '1.9.0',
        wireVersion: '1',
      },
      source: {
        repository: 'https://github.com/idea7-cc/fellowship42',
        commit: 'b'.repeat(40),
        committedAt: '2026-07-20T03:00:00.000Z',
      },
      upgrade: {
        formatVersion: 1,
        strategy: 'in-place-expand-contract',
        rollbackPolicy: 'roll-forward-after-migration',
        target: {
          applicationVersion: '0.22.0',
          schemaVersion: 7,
          managementProtocolWireVersion: '1',
        },
        eligibleSources: [
          {
            releaseTag: 'v0.21.0',
            releaseManifestSha256: sourceManifestSha256,
            applicationVersion: '0.21.0',
            schemaVersion: 7,
            managementProtocolWireVersion: '1',
          },
        ],
        requiredEvidence: [
          'release-artifacts-verified',
          'doctor-pass',
          'portable-export-verified',
          'explicit-approval',
        ],
      },
      artifacts: [
        {
          file: 'fellowship42-0.22.0-source.tgz',
          kind: 'portable-instance-source',
          bytes: 42,
          sha256: 'c'.repeat(64),
        },
        {
          file: 'fellowship42-management-protocol-1.9.0.tgz',
          kind: 'management-protocol-package',
          bytes: 42,
          sha256: 'd'.repeat(64),
        },
      ],
    }
    const targetText = JSON.stringify(targetManifest)
    const targetManifestSha256 = await sha256Text(targetText)
    const releaseTransport = async () =>
      new Response(targetText, {
        headers: { 'content-type': 'application/json' },
      })
    let phase: 'prepare' | 'apply' = 'prepare'
    let lastResult: ManagementCommandResult | null = null
    let localApprovalId = ''
    let preparationId = ''
    const operatorTransport = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const jws = await bodyJws(init)
      const payload = await verifyManagementJws(
        jws,
        enrolled.challenge.instanceKey,
      )
      if (payload.type === 'enrollment.approval') {
        return new Response(null, { status: 204 })
      }
      if (payload.type === 'sync.request') {
        const issuedAt = phase === 'prepare' ? now : now + 1_000
        const command =
          phase === 'prepare'
            ? {
                protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
                commandId: '11111111-1111-4111-8111-111111111111',
                instanceId: enrolled.challenge.instanceId,
                type: 'update.prepare' as const,
                capability: 'update.prepare' as const,
                issuedAt: new Date(issuedAt).toISOString(),
                expiresAt: new Date(issuedAt + 5 * 60_000).toISOString(),
                nonce: 'PPPPPPPPPPPPPPPPPPPPPP',
                input: { releaseTag: 'v0.22.0', releaseManifestSha256: targetManifestSha256 },
              }
            : {
                protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
                commandId: '22222222-2222-4222-8222-222222222222',
                instanceId: enrolled.challenge.instanceId,
                type: 'update.apply' as const,
                capability: 'update.apply' as const,
                issuedAt: new Date(issuedAt).toISOString(),
                expiresAt: new Date(issuedAt + 5 * 60_000).toISOString(),
                nonce: 'UUUUUUUUUUUUUUUUUUUUUU',
                input: { preparationId, localApprovalId },
              }
        return Response.json({
          jws: await signManagementPayload(
            {
              protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
              type: 'command.batch',
              messageId:
                phase === 'prepare'
                  ? '33333333-3333-4333-8333-333333333333'
                  : '44444444-4444-4444-8444-444444444444',
              connectionId: enrolled.connectionId,
              instanceId: enrolled.challenge.instanceId,
              senderKeyId: enrolled.operator.publicKey.kid,
              audienceKeyId: enrolled.challenge.instanceKey.kid,
              issuedAt: new Date(issuedAt).toISOString(),
              expiresAt: new Date(issuedAt + 5 * 60_000).toISOString(),
              nonce: phase === 'prepare' ? nonce() : 'VVVVVVVVVVVVVVVVVVVVVV',
              commands: [command],
              nextCommandCursor: `cursor-${phase}`,
            },
            enrolled.operator.privateKey,
          ),
        })
      }
      if (payload.type === 'command.results') {
        lastResult = payload.results[0] ?? null
        return new Response(null, { status: 204 })
      }
      throw new Error('Unexpected management message')
    }

    await syncManagementOnce(
      updateEnv,
      now,
      operatorTransport,
      releaseTransport,
    )
    expect(lastResult).toMatchObject({
      commandType: 'update.prepare',
      status: 'succeeded',
      output: {
        kind: 'update.preparation',
        preparation: {
          source: { releaseTag: 'v0.21.0' },
          target: {
            releaseTag: 'v0.22.0',
            releaseManifestSha256: targetManifestSha256,
          },
          state: 'awaiting-local-approval',
        },
      },
    })
    const prepared = (await listUpdatePreparations(updateEnv, now))[0]!
    preparationId = prepared.preparationId
    const approved = await approveUpdatePreparation(
      updateEnv,
      preparationId,
      { releaseTag: 'v0.22.0', releaseManifestSha256: targetManifestSha256 },
      ownerId,
      'church_demo',
      'request-update-approval',
      now + 500,
    )
    localApprovalId = approved.localApproval!.localApprovalId
    phase = 'apply'
    lastResult = null

    await syncManagementOnce(
      updateEnv,
      now + 1_000,
      operatorTransport,
      releaseTransport,
    )
    expect(lastResult).toMatchObject({
      commandType: 'update.apply',
      status: 'succeeded',
      output: {
        kind: 'update.authorization',
        authorization: {
          preparationId,
          localApprovalId,
          target: {
            releaseTag: 'v0.22.0',
            releaseManifestSha256: targetManifestSha256,
          },
          strategy: 'in-place-expand-contract',
          rollbackPolicy: 'roll-forward-after-migration',
        },
      },
    })
    expect((await listUpdatePreparations(updateEnv, now + 1_000))[0]).toMatchObject({
      state: 'authorized',
      localApproval: { localApprovalId, consumedAt: new Date(now + 1_000).toISOString() },
    })
  })

  it('rejects unimplemented commands without claiming that work occurred', async () => {
    const now = Date.now()
    const enrolled = await enroll(now)
    let resultStatus: unknown
    const transport = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const jws = await bodyJws(init)
      const payload = await verifyManagementJws(jws, enrolled.challenge.instanceKey)
      if (payload.type === 'enrollment.approval') return new Response(null, { status: 204 })
      if (payload.type === 'sync.request') {
        const command = await signManagementPayload(
          {
            protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
            type: 'command.batch',
            messageId: crypto.randomUUID(),
            connectionId: enrolled.connectionId,
            instanceId: enrolled.challenge.instanceId,
            senderKeyId: enrolled.operator.publicKey.kid,
            audienceKeyId: enrolled.challenge.instanceKey.kid,
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 5 * 60_000).toISOString(),
            nonce: nonce(),
            commands: [
              {
                protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
                commandId: crypto.randomUUID(),
                instanceId: enrolled.challenge.instanceId,
                type: 'backup.export',
                capability: 'backup.export',
                issuedAt: new Date(now).toISOString(),
                expiresAt: new Date(now + 5 * 60_000).toISOString(),
                nonce: 'CCCCCCCCCCCCCCCCCCCCCC',
                input: { reason: 'test', retentionDays: 7 },
              },
            ],
            nextCommandCursor: 'cursor-unimplemented',
          },
          enrolled.operator.privateKey,
        )
        return Response.json({ jws: command })
      }
      if (payload.type === 'command.results') {
        resultStatus = payload.results[0]
        return new Response(null, { status: 204 })
      }
      throw new Error('Unexpected management message')
    }
    await syncManagementOnce(managementEnv, now, transport)
    expect(resultStatus).toMatchObject({
      commandType: 'backup.export',
      status: 'rejected',
      error: { code: 'command_not_implemented' },
    })
  })

  it('refreshes an expired rotation notice before activating the replacement key', async () => {
    const now = Date.now()
    const delayed = now + 10 * 60_000
    const enrolled = await enroll(now)
    const rotatingEnv = new Proxy(managementEnv, {
      get(target, property, receiver) {
        if (property === 'MANAGEMENT_KEY_ENCRYPTION_KEY') {
          return 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
        }
        if (property === 'MANAGEMENT_KEY_ENCRYPTION_KEY_PREVIOUS') {
          return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        }
        return Reflect.get(target, property, receiver)
      },
    })
    await env.DB.prepare(
      `UPDATE management_connections SET approval_delivered_at = ?
       WHERE connection_id = ?`,
    )
      .bind(now, enrolled.connectionId)
      .run()
    const originalNotice = await rotateManagementIdentity(
      env.DB,
      rotatingEnv,
      ownerId,
      'request-delayed-rotation',
      now,
    )
    const originalPayload = await verifyManagementJws(
      originalNotice,
      enrolled.challenge.instanceKey,
    )
    if (originalPayload.type !== 'key.rotate') {
      throw new Error('Expected key rotation')
    }
    const replacementKey = originalPayload.replacementKey
    let refreshedNotice: ManagementJws | null = null

    const transport = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const jws = await bodyJws(init)
      if (!refreshedNotice) {
        const rotation = await verifyManagementJws(
          jws,
          enrolled.challenge.instanceKey,
        )
        expect(rotation).toMatchObject({
          type: 'key.rotate',
          replacementKey: { kid: replacementKey.kid },
          issuedAt: new Date(delayed).toISOString(),
        })
        refreshedNotice = jws
        expect(JSON.stringify(jws)).not.toBe(JSON.stringify(originalNotice))
        return new Response(null, { status: 204 })
      }

      const payload = await verifyManagementJws(jws, replacementKey)
      if (payload.type === 'sync.request') {
        const emptyBatch = await signManagementPayload(
          {
            protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
            type: 'command.batch',
            messageId: crypto.randomUUID(),
            connectionId: enrolled.connectionId,
            instanceId: enrolled.challenge.instanceId,
            senderKeyId: enrolled.operator.publicKey.kid,
            audienceKeyId: replacementKey.kid,
            issuedAt: new Date(delayed).toISOString(),
            expiresAt: new Date(delayed + 5 * 60_000).toISOString(),
            nonce: nonce(),
            commands: [],
            nextCommandCursor: 'cursor-after-rotation',
          },
          enrolled.operator.privateKey,
        )
        return Response.json({ jws: emptyBatch })
      }
      if (payload.type === 'command.results') {
        expect(payload.results).toEqual([])
        return new Response(null, { status: 204 })
      }
      throw new Error('Unexpected post-rotation management message')
    }

    await expect(
      syncManagementOnce(rotatingEnv, delayed, transport),
    ).resolves.toEqual({ state: 'succeeded', commandCount: 0 })
    const state = await env.DB.prepare(
      `SELECT i.key_id, c.pending_replacement_key_id,
              c.pending_control_jws_json
       FROM management_identities i
       JOIN management_connections c ON c.instance_id = i.instance_id
       WHERE i.singleton = 1 AND c.connection_id = ?`,
    )
      .bind(enrolled.connectionId)
      .first<{
        key_id: string
        pending_replacement_key_id: string | null
        pending_control_jws_json: string | null
      }>()
    expect(state).toEqual({
      key_id: replacementKey.kid,
      pending_replacement_key_id: null,
      pending_control_jws_json: null,
    })
  })

  it('queues old-key-authorized rotation and permits unconditional local disconnect', async () => {
    const now = Date.now()
    const enrolled = await enroll(now)
    const rotation = await rotateManagementIdentity(
      env.DB,
      managementEnv,
      ownerId,
      'request-rotation',
      now + 1_000,
    )
    const rotationPayload = await verifyManagementJws(
      rotation,
      enrolled.challenge.instanceKey,
    )
    expect(rotationPayload.type).toBe('key.rotate')

    const pending = await env.DB.prepare(
      'SELECT pending_control_jws_json FROM management_connections WHERE connection_id = ?',
    )
      .bind(enrolled.connectionId)
      .first<{ pending_control_jws_json: string | null }>()
    expect(JSON.parse(pending?.pending_control_jws_json ?? '{}')).toEqual(rotation)

    await expect(
      disconnectManagement(
        env.DB,
        ownerId,
        'request-disconnect',
        'Church chose local operation',
        now + 2_000,
      ),
    ).resolves.toEqual({ disconnected: true, alreadyDisconnected: false })
    await expect(
      disconnectManagement(
        env.DB,
        ownerId,
        'request-disconnect-again',
        'Already local',
        now + 3_000,
      ),
    ).resolves.toEqual({ disconnected: false, alreadyDisconnected: true })
    expect(await managementStatus(env.DB, now + 3_000)).toMatchObject({
      enabled: false,
      identity: null,
      connection: null,
      pendingEnrollment: null,
      lastDisposition: {
        connectionId: enrolled.connectionId,
        operatorId: 'operator_test',
        disconnectedAt: new Date(now + 2_000).toISOString(),
      },
    })
    const disposition = await managementExitDisposition(env.DB, now + 3_000)
    expect(managementExitDispositionSchema.parse(disposition)).toEqual(
      disposition,
    )
    expect(disposition).toMatchObject({
      instanceId: enrolled.challenge.instanceId,
      connectionId: enrolled.connectionId,
      operatorId: 'operator_test',
      checks: {
        activeConnectionAbsent: true,
        activeGrantsRevoked: true,
        localKeyMaterialRemoved: true,
        replayStateRemoved: true,
        commandStateRemoved: true,
        churchOperationsAvailable: true,
      },
    })
    const disconnectedState = await env.DB
      .prepare(
        `SELECT pending_replacement_private_jwk_ciphertext,
                pending_control_jws_json, command_cursor
         FROM management_connections WHERE connection_id = ?`,
      )
      .bind(enrolled.connectionId)
      .first<{
        pending_replacement_private_jwk_ciphertext: string | null
        pending_control_jws_json: string | null
        command_cursor: string | null
      }>()
    expect(disconnectedState).toEqual({
      pending_replacement_private_jwk_ciphertext: null,
      pending_control_jws_json: null,
      command_cursor: null,
    })
    const retainedGrants = await env.DB
      .prepare('SELECT COUNT(*) AS count FROM management_grants WHERE connection_id = ?')
      .bind(enrolled.connectionId)
      .first<{ count: number }>()
    expect(retainedGrants?.count).toBe(0)
    await env.DB
      .prepare('DELETE FROM audit_events WHERE id = ?')
      .bind(`management-disconnect:${enrolled.connectionId}`)
      .run()
    await expect(
      managementExitDisposition(env.DB, now + 4_000),
    ).rejects.toMatchObject({ code: 'management_exit_evidence_incomplete' })
  })

  it('does not expose owner management actions without local authentication', async () => {
    const response = await exports.default.fetch(
      new Request('https://fellowship42.test/api/management'),
    )
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'authentication_required' },
    })

    const exitResponse = await exports.default.fetch(
      new Request(
        'https://fellowship42.test/api/management/exit-disposition',
      ),
    )
    expect(exitResponse.status).toBe(401)

    const invalidProposal = await exports.default.fetch(
      new Request('https://fellowship42.test/api/management/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: encoder.encode('invalid') }),
      }),
    )
    expect(invalidProposal.status).toBe(422)
    await expect(invalidProposal.json()).resolves.toMatchObject({
      error: { code: 'invalid_enrollment_submission' },
    })
  })
})
