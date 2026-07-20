# ADR 0014: Public, independently verifiable hosted exit packet

- Status: accepted
- Date: 2026-07-20

## Context

A hosted church must be able to leave Fellowship42 Cloud without trusting a
private dashboard's success label. Export verification alone does not prove
that a new account was restored, credentials changed, domains cut over,
management disconnected locally, source routing retired, or custody actually
passed to the church. Conversely, copying provider identifiers or credentials
into a portable receipt would create a new sensitive dependency.

## Decision

1. The public management-protocol package defines a strict hosted-exit packet,
   local management-disposition record, operator handoff, and verification
   evidence.
2. Public `f42ctl` builds and verifies the packet from the exact export
   evidence, import plan, succeeded execution report, cutover approval, local
   disconnect evidence, and handoff. Canonical SHA-256 digests bind every
   source record.
3. Hosted exit requires the portable instance identity to remain unchanged,
   all 17 public import/cutover steps to succeed, credentials to be rotated,
   management to be disconnected, independent operation to pass, and source
   routing to be retired.
4. The instance provides owner-only local disconnect evidence and fails closed
   if active management, grants, identity/key material, replay state, command
   state, audit evidence, or church availability contradicts the claim.
5. The handoff lists portable resource classes, public domains, bounded actor
   subjects/dispositions, support expiry, and bounded risk codes. It excludes
   provider account/resource IDs, credentials, private keys, customer records,
   and payload locations.
6. Private software may orchestrate and retain the evidence, but custody must
   not change on its own authority. It consumes the published public verifier.

## Consequences

- Churches, partners, and Fellowship42 Cloud use one exit definition and can
  verify it outside the hosted service.
- A local disconnect now removes grants and pending replacement-key material,
  not only the active connection and primary management identity.
- The packet proves agreement among supplied evidence; it does not prove that
  an actor supplied truthful provider observations. Live transfer execution,
  scoped credentials, human approval, rollback rehearsal, and provider audit
  records remain operational responsibilities.
- Future packet changes require a new format version and additive protocol
  package release; private-only fields cannot silently redefine public exit.
