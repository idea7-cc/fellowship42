# ADR 0010: Management protocol v1 security profile

- Status: Accepted
- Date: 2026-07-19

## Context

An instance and its optional operator can live in unrelated Cloudflare accounts.
The connection therefore needs interoperable application identity in addition
to TLS, without giving the operator a Cloudflare deployment credential or
making Fellowship42 Cloud necessary. The protocol must resist database-only
control-plane compromise, wrong-instance delivery, replay, stale commands,
capability escalation, key compromise, and a malicious or unavailable operator.

The assets at risk are church data, instance availability, portable identity,
local authorization, backup material, release integrity, management keys, and
the church's ability to disconnect or leave. Principals are the local church
owner, one portable instance, an approved operator, operator staff, the private
or third-party control plane, and a separately credentialed infrastructure
orchestrator. Browser and MCP sessions are not instance identities.

The principal threats and v1 controls are:

| Threat | Required control |
|---|---|
| Passive or active network interception | HTTPS, endpoint validation, and signed application messages |
| Forged or wrong-instance command | Ed25519 sender proof plus connection, instance, audience, and capability binding |
| Replay or delayed delivery | Five-minute expiry, clock bound, atomic message and command replay records |
| Control-plane database theft | Private keys outside D1 and no infrastructure or church-data credentials in protocol state |
| Compromised operator account | Per-instance key, minimum local grants, local approval for high-risk actions, local revocation |
| Compromised instance key | One-instance blast radius, rotation/disconnect, no Cloudflare deployment authority |
| Malicious payload or confused deputy | Strict schemas, typed commands/results, no generic execution or fetch primitive |
| Operator outage or coercive lock-in | Instance-initiated sync, independent local operation, local disconnect, portable export |
| Telemetry becoming data replication | Explicit privacy-bounded status/result schemas and bounded audit metadata |

## Decision

### Cryptographic profile

Protocol v1 uses HTTPS plus application-layer signatures. Every signed message
uses the flattened JSON serialization from [JWS (RFC 7515)](https://www.rfc-editor.org/rfc/rfc7515),
`alg: EdDSA` with Ed25519 keys as registered by
[RFC 8037](https://www.rfc-editor.org/rfc/rfc8037), and public JWKs. The exact
profile identifier is `f42-jws-eddsa-v1`; the media-type marker is
`f42-management+jws`.

JWS signs the exact base64url-encoded protected header and payload bytes, so the
profile does not invent a JSON canonicalization algorithm. Implementations must
verify the signature before parsing or acting on the payload. The public package
uses Web Crypto only. Cloudflare Workers supports standard Ed25519 signing,
verification, generation, import, and export through Web Crypto:
<https://developers.cloudflare.com/workers/runtime-apis/web-crypto/>.

Encryption is TLS's responsibility. Optional Cloudflare Access or mTLS may add
transport defense in depth, but neither changes the public identity, capability,
or replay rules. Management keys are never Cloudflare API tokens.

### Enrollment and trust establishment

1. A locally authenticated church owner enables management. The instance
   creates its Ed25519 identity and a random, single-use enrollment challenge
   valid for at most 15 minutes.
2. The challenge communicates the portable instance ID, instance public key,
   challenge ID, and one-time code. The code is a bearer secret until consumed
   and must not enter logs, D1 audit metadata, URLs, or source control.
3. The proposed operator proves possession of its private key by signing an
   `enrollment.proposal`. The instance validates the challenge and displays the
   operator identity, sync origin, public-key fingerprint, and requested
   capabilities to the local owner.
4. The local owner explicitly approves a bounded grant set. Empty grants are
   valid. The instance signs `enrollment.approval`, stores only public operator
   identity and local grant state, consumes the challenge atomically, and begins
   instance-initiated synchronization.
5. Reusing a challenge, changing a key or origin after display, skipping local
   approval, or requesting an unknown capability fails closed and is audited.

Private keys never cross the enrollment exchange. Operator display names and
URLs are descriptive, not trust anchors; key possession plus local approval is
the trust decision.

### Authorization and command safety

Grants are deny-by-default, versioned, expiring, unique by capability, and
replace the preceding complete grant set. Unknown messages, commands,
capabilities, fields, or protocol profiles are rejected. `update.apply`,
`support.session.request`, and `management.disconnect` always require a fresh
local approval reference in addition to an active grant. No v1 command accepts
SQL, JavaScript, shell, arbitrary fetch URLs, credentials, or secret-return
values.

The instance evaluates the intersection of a verified sender key, connection,
portable instance ID, current grant version, active capability, command-specific
preconditions, and required local approval. Control-plane policy cannot widen a
local grant.

### Transport, freshness, and replay

The universal route is HTTPS under `/api/management/v1`. The instance initiates
sync; no inbound control-plane network path is required. Signed payloads bind
message, connection, instance, sender key, audience key, issue time, expiry,
nonce, and message type. Their maximum lifetime is five minutes, allowed clock
skew is 60 seconds, and replay state is retained through expiry plus skew.

Replay identity is the tuple `senderKeyId`, `messageId`, and `nonce`. A receiver
must atomically reserve it before returning success or executing a command.
Byte-identical repeats return the prior bounded outcome; a conflicting repeat is
rejected and audited. Command IDs and nonces receive the same atomic treatment,
so replaying a fresh batch cannot rerun a completed command.

Synchronization is a leased, cursor-based exchange. A response can contain at
most 20 typed commands. Results are signed by the instance. Network ambiguity is
resolved through idempotent retries and stored outcomes, never assumed success.

### Rotation, revocation, and outage behavior

Rotation messages are signed by the current key, name the replacement public
key, and define a bounded overlap. Activation requires local approval for the
instance identity and current authorization for the operator identity. Old keys
are rejected after overlap. Suspected compromise skips overlap and disconnects.

A local owner can revoke one capability, replace all grants, rotate the instance
identity, or disconnect without contacting the operator. Disconnect deletes
instance-side operator trust and replay/command leases after retaining bounded
audit evidence. It does not delete church data, change portable identity, stop
local operation, or prevent export. During a control-plane outage, ordinary
instance operation continues and management commands do not execute.

### Privacy and audit

Routine sync is limited to portable identity, release/schema/protocol versions,
custody classification, configured capability names, backup freshness, and
aggregate non-identifying health. It excludes people, donors, contributions,
attendance, pastoral records, documents, messages, authentication material,
provider identifiers, and content payloads.

Both sides audit enrollment, challenge consumption, signature/freshness/replay
decisions, grants, commands, rotation, and disconnect using bounded identifiers
and outcomes. They never log one-time codes, private keys, signatures as bearer
credentials, church records, or Cloudflare credentials.

### Compatibility

Wire major `1` and security profile `f42-jws-eddsa-v1` are stable. Additive
optional message fields require a protocol-package minor release; implementations
must still reject unknown fields until explicitly updated. New required fields,
changed signature bytes, relaxed security rules, capability semantic changes, or
message reinterpretation require a new wire major and a parallel API prefix.

Every implementation must verify the packaged `management-jws.v1.json` public
test vector. Release manifests continue to pin the exact package version and
wire major. No management endpoint is enabled by this ADR; the adapter follows
in a separate change using these contracts.

## Consequences

- Instances and independent operators can interoperate without shared provider
  accounts or proprietary cryptography.
- A database-only control-plane compromise cannot forge operator signatures
  without the separately held private key, though a fully compromised operator
  runtime remains in scope and is bounded by local grants and approvals.
- Implementations must persist replay, grant, key, and prior-result state
  transactionally before enabling commands.
- Clock quality matters within a documented bound; grossly incorrect clocks
  fail closed and surface a diagnostic.
- Payload confidentiality depends on HTTPS endpoints and operational security;
  protocol messages intentionally contain no church-record payloads.
