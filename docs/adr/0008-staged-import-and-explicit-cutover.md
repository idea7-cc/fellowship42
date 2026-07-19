# ADR 0008: Staged import and explicit cutover

- Status: accepted
- Date: 2026-07-19

## Context

A portable export proves custody only if it can restore into independently
owned resources without changing installation identity. Import spans database,
objects, Worker deployment, credentials, runtime verification, domains, and
source routing. Treating those changes as one opaque command risks overwriting
data, cutting over to an unhealthy destination, or leaving shared credentials.

Provider resource names do not prove emptiness, and the portable export
deliberately contains no source Cloudflare identifiers to compare.

## Decision

Import format version 1 requires an exact source/destination application,
schema, and protocol release match and the same portable instance ID. A public,
deterministic plan orders all verification, destination writes, credential
changes, cutover, and source-routing work.

The public executor delegates provider calls to a typed adapter but owns order,
binding checks, fail-closed behavior, and bounded reports. Before restore the
adapter must prove that bound destination D1/R2 resources are empty and the
Worker is absent. Restore never targets source resources.

Restore stops in `awaiting-cutover`. Domain attachment and source-routing
retirement require an exact approval created after source and destination
verification, with credential disposition and rollback deadline. Source data
is not deleted by cutover.

## Consequences

- Identity, release, export, destination, credential, and domain evidence
  cannot drift independently.
- Provider adapters remain replaceable and cannot redefine migration order.
- A new name or human attestation alone cannot satisfy destination emptiness.
- v1 does not combine upgrade and import; forward-version import requires a
  future compatible format and migrations.
- Credential rotation may be implemented differently by each custody mode but
  must produce the same bounded disposition before cutover.
- Deletion and retention remain separate high-risk operations.
