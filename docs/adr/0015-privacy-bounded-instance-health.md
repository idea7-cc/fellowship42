# ADR 0015: Publish one privacy-bounded instance health contract

- Status: accepted
- Date: 2026-07-20

## Context

The public runtime endpoint, `f42ctl doctor`, the signed management status
command, and private fleet software had related but separate health shapes.
That duplication encouraged semantic drift and left fleet software to infer a
public contract from private code. Expanding the existing status result would
also cause strict historical wire-v1 clients to reject a formerly valid
command result.

Health collection can easily become surveillance. Raw logs, request paths,
provider payloads, activity counts, and free-text errors are unnecessary for
fleet readiness and risk moving church records across the instance boundary.

## Decision

Publish strict format-versioned `instanceHealthObservationSchema` in
`@fellowship42/management-protocol`. It contains portable/release coordinates,
enumerated readiness states, optional coarse traffic bands, and no extensible
payload or free-text detail.

Add `instance.health.read` as a separately grantable capability and return a
new `instance.health` output. Keep `instance.status.read` and its output
unchanged. The instance advertises both, but an operator receives neither until
the local owner grants it. `f42ctl` converts doctor evidence into the same
public observation shape.

The instance reports `unknown` for signals it cannot measure honestly. Backup
freshness, observation freshness policy, alert state, and notification state
remain consumer-derived concerns. The unauthenticated runtime-health endpoint
keeps its smaller bootstrap contract and shares its local probe with the signed
health producer.

## Consequences

- Public, private, and third-party fleet software can normalize the same
  privacy boundary without importing application internals.
- Existing wire-v1 status integrations remain valid.
- Local owners can revoke fleet health independently from other management
  operations.
- Operators must combine immutable observations with separately sourced
  freshness and backup evidence rather than asking the instance to attest to
  operator-owned work.
- Adding a required field or changing field meaning requires normal protocol
  compatibility review; traffic or provider payload escape hatches are not
  permitted.
