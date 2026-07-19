# ADR 0005: Instance-owned finance ingress and outbox Queue

- Status: accepted
- Date: 2026-07-19

## Context

The church instance needs payment-provider input and reliable delivery of
domain events without making a payment processor, Fellowship42 Cloud, or an
external integration the system of record. Provider retries can duplicate or
reorder events. Request and error payloads may contain donor or financial data
that must not enter logs, fleet telemetry, or broadly distributed messages.

The existing D1 schema includes contributions, webhook replay records, and an
outbox, but it did not authenticate an ingress adapter or durably drain the
outbox. Delivery also needs a recovery path after a Worker terminates between
claim and publication.

## Decision

1. D1 remains authoritative for contribution, webhook, audit, idempotency, and
   outbox state. The public instance works without a private service.
2. Provider-specific integrations terminate outside the core route and send a
   strict normalized envelope. The route requires a per-instance HMAC-SHA256
   secret, a signed raw body, and a timestamp within five minutes.
3. Provider event IDs are replay keys. D1 stores a SHA-256 request digest and
   normalized processing state, not the provider payload. Provider payment IDs
   cannot change donor, amount, currency, fund, or person identity, and payment
   state cannot move backward after success or refund.
4. Finance reads and manual writes require explicit church-scoped
   `contributions.read` and `contributions.write` permissions. Manual creates
   require an idempotency key.
5. Each church deployment receives its own Cloudflare Queue and dead-letter
   Queue. No queue is shared between church instances.
6. D1 outbox claims publish only the outbox record ID. The queue message never
   contains the stored payload, church content, donor identity, or amount.
7. The same Worker consumes its Queue and marks the D1 record delivered.
   Request completion and a scheduled trigger publish eligible work. Scheduled
   recovery resets stale claims, publication failures use bounded error codes
   and backoff, and exhausted consumer messages go to the dead-letter Queue.
8. Coarse health may report clear, backlogged, or stalled delivery and webhook
   configuration state. It must not report event counts, payment IDs, donor
   data, provider errors, queue names, or secrets.

## Consequences

- Deployment gains two per-instance Queue resources, one producer binding, one
  consumer, a scheduled trigger, an optional provider variable, and an
  optional secret. Hosted provisioning must render unique resource names.
- The normalized HMAC route is an adapter contract, not a substitute for
  validating the original provider signature. An adapter must verify its
  provider before translating and signing the Fellowship42 envelope.
- Queue acceptance and instance consumption are durable, observable steps, but
  external integrations still need explicit topic handlers and their own
  idempotency before they can claim delivery.
- The beta supports full refunds only. Partial refunds require an additive
  financial model rather than mutating amount identity.
- Financial payloads remain portable in D1 exports; Queue messages and
  deployment secrets are regenerated at the destination.
