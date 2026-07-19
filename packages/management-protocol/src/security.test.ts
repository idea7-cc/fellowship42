import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  MANAGEMENT_PROTOCOL_VERSION,
  assertFreshManagementPayload,
  commandResultsSchema,
  enrollmentChallengeSchema,
  enrollmentProposalSchema,
  managementCommandResultSchema,
  managementCommandSchema,
  managementGrantSetSchema,
  managementInteroperabilityFixtureSchema,
  managementJwsSchema,
  managementPublicKeySchema,
  managementPublicKeyFingerprint,
  managementReplayKey,
  signManagementPayload,
  verifyManagementJws,
  type ManagementPublicKey,
  type SignedManagementPayload,
} from './index.js'

const now = '2026-07-19T17:00:00.000Z'
const later = '2026-07-19T17:05:00.000Z'

function grantSet() {
  return {
    grantVersion: 1,
    grants: [
      {
        capability: 'instance.status.read',
        grantedAt: now,
        expiresAt: '2027-07-19T17:00:00.000Z',
        requiresLocalApproval: false,
      },
      {
        capability: 'update.apply',
        grantedAt: now,
        expiresAt: '2027-07-19T17:00:00.000Z',
        requiresLocalApproval: true,
      },
    ],
    approvedAt: now,
    reviewDueAt: '2027-01-19T17:00:00.000Z',
  } as const
}

function syncRequest(senderKeyId = 'instance-key-2026-07') {
  return {
    protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
    type: 'sync.request',
    messageId: 'fe07666a-2949-4d52-a528-2f07399858f8',
    connectionId: '50a0a906-fdac-4737-b8b3-76d7f4144be0',
    instanceId: 'instance_demo',
    senderKeyId,
    audienceKeyId: 'operator-key-2026-07',
    issuedAt: now,
    expiresAt: later,
    nonce: 'IGL7Q6VKMg31ewB4wOJdXQ',
    descriptor: {
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      instanceId: 'instance_demo',
      topology: 'single-church',
      applicationVersion: '0.12.0',
      schemaVersion: 5,
      infrastructure: { owner: 'church', operator: 'church' },
      capabilities: ['instance.status.read', 'update.apply'],
    },
    grantVersion: 1,
    commandCursor: null,
  } as const satisfies SignedManagementPayload
}

async function keyPair(keyId: string) {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const publicKey = managementPublicKeySchema.parse({
    kty: exported.kty,
    crv: exported.crv,
    x: exported.x,
    kid: keyId,
    use: 'sig',
    alg: 'EdDSA',
  })
  return { pair, publicKey }
}

describe('management security profile', () => {
  it('keeps enrollment short-lived and grants explicit', async () => {
    const { publicKey } = await keyPair('instance-key-2026-07')
    const challenge = enrollmentChallengeSchema.parse({
      protocolVersion: MANAGEMENT_PROTOCOL_VERSION,
      challengeId: '81d12715-2fd8-4e30-83b9-25647733bba7',
      instanceId: 'instance_demo',
      instanceKey: publicKey,
      oneTimeCode: 'VdOZ87xgsudSd-CowZxDNYga4aN7akFD',
      issuedAt: now,
      expiresAt: '2026-07-19T17:15:00.000Z',
    })

    expect(challenge.oneTimeCode).toHaveLength(32)
    await expect(managementPublicKeyFingerprint(publicKey)).resolves.toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    )
    expect(managementGrantSetSchema.parse(grantSet()).grants).toHaveLength(2)
    expect(
      managementGrantSetSchema.safeParse({
        ...grantSet(),
        grants: [
          {
            ...grantSet().grants[1],
            requiresLocalApproval: false,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects capability confusion and unbounded result payloads', () => {
    expect(
      managementCommandSchema.safeParse({
        protocolVersion: '1',
        type: 'instance.status.read',
        commandId: '4d24acfd-eb67-4991-a961-a121135cbdd2',
        instanceId: 'instance_demo',
        issuedAt: now,
        expiresAt: later,
        nonce: '8f9rHt3fcqNlY4uYicpCsw',
        capability: 'update.apply',
        input: {},
      }).success,
    ).toBe(false)
    expect(
      managementCommandResultSchema.safeParse({
        protocolVersion: '1',
        commandId: '4d24acfd-eb67-4991-a961-a121135cbdd2',
        instanceId: 'instance_demo',
        commandType: 'instance.status.read',
        status: 'succeeded',
        completedAt: later,
        output: { memberRecords: ['not allowed'] },
      }).success,
    ).toBe(false)
  })

  it('represents an empty command-batch heartbeat with empty results', () => {
    expect(
      commandResultsSchema.parse({
        protocolVersion: '1',
        type: 'command.results',
        messageId: '10b33a13-ce4b-4c92-818b-b27396154abc',
        connectionId: 'd1947586-77b8-42a8-ad57-67a88cdf522f',
        instanceId: 'instance_demo',
        senderKeyId: 'instance-key',
        audienceKeyId: 'operator-key',
        issuedAt: now,
        expiresAt: later,
        nonce: '8f9rHt3fcqNlY4uYicpCsw',
        results: [],
      }).results,
    ).toEqual([])
  })

  it('rejects credentialed or non-public operator sync endpoints', () => {
    const proposal = {
      protocolVersion: '1',
      type: 'enrollment.proposal',
      messageId: '10b33a13-ce4b-4c92-818b-b27396154abc',
      challengeId: 'e9fbef46-9a83-4161-9f66-223f95c53de5',
      instanceId: 'instance_demo',
      senderKeyId: 'operator-key',
      audienceKeyId: 'instance-key',
      nonce: '8f9rHt3fcqNlY4uYicpCsw',
      operator: {
        id: 'operator',
        displayName: 'Operator',
        key: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: '11qYAYdk9J9c8j7M5X4A_L9smugxYrW8hF8gYazD5w0',
          kid: 'operator-key',
          use: 'sig',
          alg: 'EdDSA',
        },
        syncUrl: 'https://user:secret@localhost/sync#token',
      },
      requestedCapabilities: ['instance.status.read'],
      issuedAt: now,
      expiresAt: later,
    }
    expect(enrollmentProposalSchema.safeParse(proposal).success).toBe(false)
  })

  it('signs and verifies the standard flattened JWS profile', async () => {
    const { pair, publicKey } = await keyPair('instance-key-2026-07')
    const payload = syncRequest()
    const signed = await signManagementPayload(payload, pair.privateKey)
    const verified = await verifyManagementJws(signed, publicKey)

    expect(managementJwsSchema.parse(signed)).toEqual(signed)
    expect(verified).toEqual(payload)
    expect(managementReplayKey(verified)).toBe(
      'instance-key-2026-07:fe07666a-2949-4d52-a528-2f07399858f8:IGL7Q6VKMg31ewB4wOJdXQ',
    )
  })

  it('verifies the immutable cross-implementation fixture', async () => {
    const fixture = managementInteroperabilityFixtureSchema.parse(
      JSON.parse(
        await readFile(
          new URL('../fixtures/management-jws.v1.json', import.meta.url),
          'utf8',
        ),
      ),
    )

    await expect(
      verifyManagementJws(fixture.jws, fixture.publicKey),
    ).resolves.toEqual(fixture.payload)
  })

  it('rejects tampering, wrong keys, and stale messages', async () => {
    const signer = await keyPair('instance-key-2026-07')
    const stranger = await keyPair('instance-key-2026-07')
    const signed = await signManagementPayload(
      syncRequest(),
      signer.pair.privateKey,
    )
    const last = signed.payload.at(-1)
    const tampered = {
      ...signed,
      payload: `${signed.payload.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`,
    }

    await expect(
      verifyManagementJws(tampered, signer.publicKey),
    ).rejects.toThrow('Invalid management JWS signature')
    await expect(
      verifyManagementJws(signed, stranger.publicKey),
    ).rejects.toThrow('Invalid management JWS signature')
    expect(() =>
      assertFreshManagementPayload(
        syncRequest(),
        new Date('2026-07-19T17:07:00.001Z'),
      ),
    ).toThrow('outside the accepted clock window')
  })

  it('binds the JWS key identifier to the payload sender', async () => {
    const signer = await keyPair('actual-key')
    const publicKey: ManagementPublicKey = {
      ...signer.publicKey,
      kid: 'claimed-key',
    }
    const signed = await signManagementPayload(
      syncRequest('actual-key'),
      signer.pair.privateKey,
    )

    await expect(verifyManagementJws(signed, publicKey)).rejects.toThrow(
      'does not match the supplied key',
    )
  })
})
