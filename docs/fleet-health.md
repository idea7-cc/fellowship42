# Privacy-bounded instance health

Fellowship42 publishes one strict `instanceHealthObservationSchema` for local
diagnostics and optional fleet management. It answers whether an instance is
recent, compatible, connected, and locally ready without copying church
activity into an operator system.

## Public contract

Format version 1 contains only:

- portable instance identity and observation time;
- an enumerated source (`instance-doctor`, `management-sync`, or
  `operator-verified`);
- application, D1 schema, and management wire versions;
- bounded connection and grant-version state;
- bounded D1, R2, authentication, migration, realtime, payment-webhook, and
  outbox readiness;
- coarse availability, error-rate, and latency bands over a named window; and
- an explicit aggregate status.

Every object is strict. Unknown fields fail validation. An implementation that
does not possess trustworthy traffic evidence reports `unknown`; it never
turns request paths, raw logs, exception text, or church activity into a health
signal. Backup freshness is deliberately absent because it must come from the
operator that created and independently verified a portable export.

The schema never accepts names, contact details, member or donor records,
contribution or attendance data, pastoral notes, messages, documents,
Cloudflare resource identifiers, credentials, secrets, URLs, raw provider
responses, or arbitrary text.

## Producers

`f42ctl` exports `healthObservationFromDoctorReport`. It converts the strict
doctor report and optional public runtime-health response into this same
contract. Configuration checks become bounded component readiness, runtime
outbox/payment state is preserved when available, and unavailable traffic
metrics remain `unknown`.

An enrolled instance may advertise and execute `instance.health.read`. The
capability is independently requested, granted, expired, revoked, and audited.
Its signed result contains an `instance.health` observation sourced from
`management-sync`. The older `instance.status.read` command and output remain
unchanged for compatible wire-v1 clients.

`GET /api/health` remains the smaller unauthenticated deployment/bootstrap
readiness contract. It does not expose management connection state. Both paths
share the same local runtime probe so their D1, outbox, payment, and bootstrap
meaning cannot drift.

## Consumer behavior

Freshness, alert thresholds, backup evidence, escalation, and notification
delivery are operator policy, not instance truth. A consumer must treat a stale
or future-dated observation as unknown even when its last aggregate status was
healthy. Consumer-derived assessments must remain separate from the immutable
instance observation.

See [ADR 0015](adr/0015-privacy-bounded-instance-health.md) and the optional
[management protocol](management-protocol.md).
