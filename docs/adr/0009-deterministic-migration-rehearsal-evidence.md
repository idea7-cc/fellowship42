# ADR 0009: Publish deterministic migration rehearsal evidence

- Status: Accepted
- Date: 2026-07-19

## Context

Portable export and staged import contracts are necessary but do not by
themselves demonstrate the entire hosted-to-church-owned sequence. A repeatable
compatibility proof must exercise the public code through restore, approval,
cutover, independent operation, and source retirement without requiring
private control-plane code or production Cloudflare credentials in public CI.

At the same time, a local model must not be described as a live provider
certification. Provider-specific resource enumeration, Access, DNS propagation,
and account-scoped credentials need a separate staging exercise.

## Decision

Ship a deterministic, public, temporary-filesystem rehearsal that models
separate hosted and church-owned account boundaries behind the same
`PortableImportAdapter` used by real operators. It executes the public export,
verification, import, and cutover implementations against synthetic D1/R2 data
and derives every final assertion from observed adapter state.

Publish a strict privacy-bounded evidence schema and immutable compatibility
fixture. Evidence records canonical digests, exact releases, timestamps, and a
fixed ordered assertion set; it excludes payload and provider detail. Public CI
regenerates and compares the evidence on every change.

Documentation must label this a deterministic conformance rehearsal and list
the additional proofs required before claiming a live cross-account migration.

## Consequences

- Open-source users and private operators test the same lifecycle primitives.
- Regressions in end-to-end sequencing or evidence shape fail CI.
- The fixture is safe to publish and consume independently.
- A passing local rehearsal does not authorize production cutover or replace a
  real staging-account certification.
- Live adapters remain responsible for strong provider observations, scoped
  credentials, retries, rollback, and audit evidence.
