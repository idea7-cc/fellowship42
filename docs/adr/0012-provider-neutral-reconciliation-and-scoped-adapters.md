# ADR 0012: Provider-neutral reconciliation with scoped adapters

- Status: Accepted
- Date: 2026-07-20

## Context

ADR 0006 established a portable deployment manifest and deterministic,
evidence-only plan. That made desired state reviewable but intentionally left
resource observation and mutation unimplemented. Hosted, partner-operated, and
self-managed installations now need one callable reconciliation contract
without embedding Fellowship42 Cloud credentials or Cloudflare resource IDs in
the portable manifest.

Resource names are not proof of ownership. A reconciler that adopts or updates
an existing Worker, database, bucket, Queue, domain, or Access application by
name alone could alter another deployment. A provider timeout also makes blind
retry unsafe unless every step has stable idempotency and expected-state input.

The public instance must not depend on the private control plane, and private
or third-party automation must not fork lifecycle ordering, desired-state
fingerprints, approval binding, or result evidence.

## Decision

Publish a provider-neutral, Worker-safe reconciliation library from
`@fellowship42/f42ctl/reconciliation` and strict evidence schemas from
`@fellowship42/management-protocol`.

The library owns:

- canonical manifest and per-step desired-state fingerprints;
- the existing eleven-step dependency order;
- strict, ordered provider observations with only state, ownership class,
  fingerprint, and bounded machine code;
- a deterministic non-destructive preview derived from those observations;
- explicit approval bound to the exact manifest and preview digests, portable
  identity, and operator-local account alias, expiring within one hour;
- sequential execution with a stable operation ID and per-step idempotency key;
- expected-actual fingerprints for adapter compare-and-swap behavior; and
- bounded execution reports that omit credentials, raw provider responses,
  provider IDs, and the plaintext idempotency key.

Provider access is injected through a narrow adapter. The adapter privately
owns its account-scoped credential and provider identifiers; neither crosses
the public request or evidence shapes. Observation of an existing provider
resource must classify ownership as verified, unverified, or foreign. Existing
resources that are not independently verified for this portable instance block
the preview. Names, account aliases, and browser claims are never ownership
proof.

The initial contract contains no destructive action. A blocked preview cannot
execute. The executor recomputes the manifest, plan, dependencies, and desired
fingerprints before the first provider effect, verifies current approval, and
normalizes malformed, thrown, or mismatched adapter outcomes without copying
raw errors into evidence.

The public repository includes a synthetic staging fixture with no provider
account/resource IDs or credentials. Fellowship42 Cloud may implement a
Cloudflare adapter in its private repository, and third parties may implement
their own compatible adapters, but all must consume this published library.

## Consequences

- Self-managed, partner, and hosted operators share preview, approval,
  idempotency, and evidence semantics.
- The reconciliation subpath can run in Cloudflare Workers and Workflows; it
  has no Node built-in import, filesystem assumption, or global credential.
- Provider adapters remain replaceable and independently testable with redacted
  transport fixtures.
- Exact retries depend on adapter-side idempotency persistence; the public
  report is evidence of the normalized outcome, not proof of provider state.
- Live staging certification still requires a scoped real account and provider
  audit evidence. The synthetic fixture proves contract behavior only.
- Destructive reconciliation, resource transfer/adoption, and cleanup require a
  later ADR with exact-target authorization and recovery rules.
