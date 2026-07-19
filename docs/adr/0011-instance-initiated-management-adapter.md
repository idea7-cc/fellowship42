# ADR 0011: Instance-initiated management adapter

- Status: Accepted
- Date: 2026-07-19

## Context

ADR 0010 fixes the public wire and security profile. The instance still needs a
concrete trust boundary that works in unrelated Cloudflare accounts, remains
optional for self-hosters, does not turn the private control plane into a data
dependency, and lets a local church owner leave without operator cooperation.

An implementation also has to reconcile two key-custody constraints. D1 is the
authoritative portable state store, but a database copy alone must not contain
a usable signing identity. At the same time, a church-owned deployment must not
need a Fellowship42-owned key service to operate or disconnect.

## Decision

### Local enrollment boundary

The instance exposes local-owner routes at `/api/management` for status,
challenge creation, explicit grant approval, identity rotation, and disconnect.
They use the normal application authorization model and require the
`management.admin` permission; the system owner role's `*` grant satisfies it.

`POST /api/management/proposals` is the only route without a local session. It
accepts a signed operator proposal plus the 256-bit, 15-minute, one-use
challenge code. D1 stores only the code's SHA-256 digest. The route verifies the
operator signature, key equality, instance/audience binding, freshness, and an
atomic unused challenge before recording a proposal for local review. It
neither enables a capability nor executes a command.

The owner approves a complete, current, expiring grant set. Initial enrollment
must use grant version 1 and may grant only capabilities requested in the
verified proposal. The resulting approval is signed by the instance and queued
for outbound delivery before regular synchronization.

### Instance key custody

The instance creates a per-installation Ed25519 identity with Web Crypto. It
exports the private JWK only long enough to encrypt it with AES-256-GCM. D1
stores the public JWK, random IV, and ciphertext; the 32-byte wrapping key is a
Worker secret named `MANAGEMENT_KEY_ENCRYPTION_KEY`. AES associated data binds
the ciphertext to the portable instance ID and key ID. Decrypted keys are
imported non-extractably and never logged.

Management remains absent and fully optional when that secret is not set. A
self-hoster configures it only before enrollment. During wrapping-key rotation,
the new key is configured as `MANAGEMENT_KEY_ENCRYPTION_KEY` and the old key as
`MANAGEMENT_KEY_ENCRYPTION_KEY_PREVIOUS`; a local identity rotation re-encrypts
under the new current key, after which the previous secret is removed. The
previous key is decrypt-only and is never used for newly generated ciphertext.

This wrapping secret is deployment configuration, not portable church identity
and not a management or Cloudflare API credential. Moving an active connection
requires transferring it through the church-authorized secret-handling process
or disconnecting and re-enrolling after migration.

### Outbound-only operator transport

The one-minute scheduled handler initiates every operator exchange. Before an
ordinary poll it delivers any undelivered enrollment approval or current-key-
signed rotation notice to the exact HTTPS URL approved during enrollment. It
then sends a privacy-bounded signed `sync.request`, receives a signed
`command.batch`, and posts signed `command.results`. Redirects fail closed and
responses have a strict size bound.

The instance verifies signature, freshness, connection, portable instance,
sender, and audience before reserving replay identity in D1. Command IDs and
nonces are independently unique. An exact completed retry returns the stored
signed result envelope byte-for-byte; conflicting reuse fails. Command records
and their bounded audit decision are committed in one D1 batch.

Release 0.12 implements only `instance.status.read`. It reports application,
D1, R2, and non-identifying backup-freshness state. Every other recognized
command is explicitly rejected as unimplemented or as requiring local approval;
the adapter never claims work occurred. Empty command batches are valid
heartbeats with empty results.

### Rotation and disconnect

Instance identity rotation creates a replacement encrypted key and a notice
signed by the old key. Replacing the key, queueing that notice, and writing the
local audit event are one D1 batch. The next outbound cycle delivers the notice
before signing with the replacement key.

Local disconnect is unconditional and idempotent. It marks the connection
disconnected and removes instance management identity, replay, and command
state without contacting the operator. Church data, local authentication,
portable instance identity, export, and ordinary workflows are unchanged.

## Consequences

- Independently hosted instances need no privileged inbound operator path and
  no shared Cloudflare account.
- A D1 copy cannot sign management messages without the separate Worker secret.
- Losing the only wrapping secret disables management signing but does not
  disable the church application or local disconnect.
- Operators must make control-message and result delivery idempotent because a
  successful HTTP response can be lost before the instance records delivery.
- The private dashboard can implement enrollment and fleet workflows entirely
  through this published protocol; it receives no direct D1 or R2 access.
- Backup, update, support, grant replacement, and remote disconnect execution
  remain separate, reviewable increments rather than generic command hooks.
