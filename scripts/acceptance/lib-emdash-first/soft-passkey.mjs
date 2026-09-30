import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

/**
 * A software WebAuthn authenticator (ES256, "none" attestation, user present
 * and verified). It answers the same registration and assertion ceremonies a
 * browser passkey would, so EmDash and Fellowship42 verify real signatures
 * over real challenges; nothing on the server side is bypassed.
 */

const b64u = (bytes) => Buffer.from(bytes).toString('base64url')
const sha256 = (value) => createHash('sha256').update(value).digest()

function cborHead(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length])
  if (length < 256) return Buffer.from([(major << 5) | 24, length])
  if (length < 65536) {
    const head = Buffer.alloc(3)
    head[0] = (major << 5) | 25
    head.writeUInt16BE(length, 1)
    return head
  }
  const head = Buffer.alloc(5)
  head[0] = (major << 5) | 26
  head.writeUInt32BE(length, 1)
  return head
}

/** Minimal CBOR encoder: integers, text, bytes, and maps. */
function cbor(value) {
  if (typeof value === 'number')
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value)
  if (typeof value === 'string') {
    const text = Buffer.from(value, 'utf8')
    return Buffer.concat([cborHead(3, text.length), text])
  }
  if (Buffer.isBuffer(value))
    return Buffer.concat([cborHead(2, value.length), value])
  if (value instanceof Map)
    return Buffer.concat([
      cborHead(5, value.size),
      ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)]),
    ])
  throw new Error(`CBOR: unsupported value ${typeof value}`)
}

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40

export class SoftPasskey {
  constructor(label) {
    this.label = label
    this.credentials = []
  }

  /** navigator.credentials.create() for the given server options. */
  create(options, origin) {
    const rpId = options.rp?.id ?? new URL(origin).hostname
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    })
    const jwk = publicKey.export({ format: 'jwk' })
    const coseKey = cbor(
      new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ]),
    )
    const id = randomBytes(16)
    const idLength = Buffer.alloc(2)
    idLength.writeUInt16BE(id.length)
    const authenticatorData = Buffer.concat([
      sha256(rpId),
      Buffer.from([FLAG_UP | FLAG_UV | FLAG_AT]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      idLength,
      id,
      coseKey,
    ])
    const attestationObject = cbor(
      new Map([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authenticatorData],
      ]),
    )
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: options.challenge,
        origin,
        crossOrigin: false,
      }),
    )
    this.credentials.push({
      id: b64u(id),
      rpId,
      origin,
      privateKey,
      userHandle: options.user?.id,
      counter: 0,
    })
    return {
      id: b64u(id),
      rawId: b64u(id),
      type: 'public-key',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ['internal'],
      },
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
    }
  }

  /** navigator.credentials.get() for the given server options. */
  get(options, origin) {
    const rpId = options.rpId ?? new URL(origin).hostname
    const allowed = (options.allowCredentials ?? []).map((entry) => entry.id)
    const credential = this.credentials.find(
      (entry) =>
        entry.rpId === rpId &&
        entry.origin === origin &&
        (allowed.length === 0 || allowed.includes(entry.id)),
    )
    if (!credential)
      throw new Error(`${this.label} has no passkey for ${rpId} (${origin})`)
    credential.counter += 1
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(credential.counter)
    const authenticatorData = Buffer.concat([
      sha256(rpId),
      Buffer.from([FLAG_UP | FLAG_UV]),
      counter,
    ])
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: options.challenge,
        origin,
        crossOrigin: false,
      }),
    )
    const signature = sign(
      'sha256',
      Buffer.concat([authenticatorData, sha256(clientDataJSON)]),
      credential.privateKey,
    )
    return {
      id: credential.id,
      rawId: credential.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authenticatorData),
        signature: b64u(signature),
        ...(credential.userHandle ? { userHandle: credential.userHandle } : {}),
      },
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
    }
  }
}
