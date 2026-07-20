# ADR 0017: Instance-owned update preparation and authorization

Status: accepted

Date: 2026-07-20

## Context

An optional operator needs to upgrade an independently deployed church
instance without receiving implicit authority from a fleet release decision.
The public release manifest can declare compatibility, but compatibility alone
does not prove that this instance is healthy, that its owner approved the exact
artifact, or that the operator may begin a deployment.

Putting Cloudflare deployment credentials in the instance would combine the
data plane, approval authority, and infrastructure authority. Allowing the
private control plane to write D1 directly would bypass the public contract.
Treating an MCP exchange as the durable workflow would couple correctness to an
AI-facing adapter.

## Decision

The public instance implements two management commands:

1. `update.prepare` downloads the immutable public release manifest, enforces
   its exact digest and source allowlist, checks local runtime/storage/schema
   readiness, and records a one-hour preparation in D1.
2. A locally authenticated church owner reviews the exact source, target tag,
   and target manifest SHA-256 in the instance UI. The resulting approval is
   bound to that preparation, expires within 30 minutes, and can be consumed
   once.
3. `update.apply` consumes that approval and returns a signed, one-hour
   deployment authorization. It does not deploy infrastructure.
4. An external operator with separately scoped infrastructure credentials may
   use the public reconciliation contract only while that authorization is
   current. After deployment, the new Worker declares the target tag and
   manifest digest; retained D1 state then records the preparation as applied.

Every deployment configures `F42_RELEASE_TAG` and
`F42_RELEASE_MANIFEST_SHA256` from the exact reviewed deployment manifest.
`f42ctl doctor` verifies both values. Application and schema versions remain
compiled facts. Updates use expand-contract migrations and become
roll-forward-only once migration begins.

`v0.21.0` is the bootstrap release for this protocol. A source older than that
cannot execute the new commands and must first be brought to a compatible
release through the existing public, explicitly approved reconciliation path.
Automated instance-authorized upgrades begin only after the source advertises
both capabilities.

## Consequences

- The church, not a release ring or commercial entitlement, authorizes the
  exact artifact for its instance.
- Management signing keys prove the command exchange but never become
  Cloudflare deployment credentials.
- Replaying a command returns the same evidence; a different command cannot
  consume an already used approval to create new authority.
- A control-plane outage cannot prevent local operation, inspection, export,
  approval expiry, or disconnect.
- Private workflows may add recovery exports, retries, rings, soak periods,
  and incident controls, but cannot widen public compatibility or synthesize
  owner authorization.
- The first transition onto the bootstrap release remains a deliberate manual
  lifecycle operation rather than an unsafe claim of backward capability.
