import { env, exports } from 'cloudflare:workers'
import {
  MANAGEMENT_PROTOCOL_VERSION,
  runManagementAdapterConformance,
  managementPublicKeySchema,
  signManagementPayload,
  verifyManagementJws,
  type EnrollmentChallenge,
  type ManagementJws,
  type ManagementPublicKey,
} from '@fellowship42/management-protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import conformanceFixture from '../../../packages/management-protocol/fixtures/management-adapter-conformance.v1.json'
import {
  approveEnrollment,
  createEnrollmentChallenge,
  disconnectManagement,
  managementStatus,
  rotateManagementIdentity,
  submitEnrollmentProposal,
  type ManagementBindings,
} from '../worker/management/service'
import { syncManagementOnce } from '../worker/management/sync'

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
        'backup.export',
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
          capability: 'backup.export',
          grantedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
          requiresLocalApproval: false,
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
        applicationVersion: '0.16.0',
        schemaVersion: 6,
        managementProtocolPackageVersion: '1.4.0',
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
    expect(status.connection?.grants).toHaveLength(3)
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
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected message type: ${payload.type}`)
    }

    await expect(syncManagementOnce(managementEnv, now, transport)).resolves.toEqual({
      state: 'succeeded',
      commandCount: 1,
    })
    await expect(
      syncManagementOnce(managementEnv, now + 1_000, transport),
    ).resolves.toEqual({ state: 'succeeded', commandCount: 1 })
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
    })
  })

  it('does not expose owner management actions without local authentication', async () => {
    const response = await exports.default.fetch(
      new Request('https://fellowship42.test/api/management'),
    )
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'authentication_required' },
    })

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
