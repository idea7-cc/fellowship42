# Contributions and durable delivery

Fellowship42 keeps financial records inside the church instance. Finance data
is not public content, management telemetry, or a control-plane replication
source.

## Finance authorization

`contributions.read` and `contributions.write` are independent church-scoped
permissions. The system `finance` role receives both; ministry roles receive
neither. The Worker checks the current D1 membership and permission on every
request. Browser navigation is not authorization.

Finance users can record reconciled offline contributions with an
`Idempotency-Key`. Repeating the same request returns the original record;
reusing the key with different content fails. Amounts are integer minor units
and currencies are uppercase ISO-style three-letter codes. Financial records
are not deleted through the beta API.

## Normalized payment webhook

The beta exposes `POST /webhooks/payments/:provider`. It is an adapter boundary,
not a claim that Fellowship42 is a payment processor. A provider integration
must transform its verified event into this strict JSON envelope:

```json
{
  "formatVersion": 1,
  "eventId": "provider-event-id",
  "type": "payment.succeeded",
  "paymentId": "provider-payment-id",
  "donorName": "Example Donor",
  "personId": null,
  "amountMinor": 2500,
  "currency": "USD",
  "fund": "General",
  "paymentMethod": "card",
  "recurring": false,
  "donatedAt": "2026-07-19T18:30:00.000Z"
}
```

Supported types are `payment.succeeded`, `payment.failed`, and
`payment.refunded`. The configured provider name must match the route. Send the
Unix timestamp in `X-F42-Timestamp` and
`v1=<lowercase hexadecimal HMAC-SHA256>` in `X-F42-Signature`. The signed bytes
are exactly `<timestamp>.<raw request body>`. Timestamps outside a five-minute
window fail before JSON parsing.

`PAYMENT_WEBHOOK_SECRET` is a Worker secret and
`PAYMENT_WEBHOOK_PROVIDER` is a non-secret deployment variable. Use a unique,
random secret per church instance and give it only to the provider adapter.

Webhook event IDs are replay keys. A byte-identical replay returns success;
reuse with different bytes fails. The Worker stores a SHA-256 request digest
and a normalized empty payload marker, not the provider body. Contribution
amount, currency, fund, donor identity, and linked person cannot change under
an existing provider payment ID. A refund is terminal, and a succeeded payment
cannot move backward to failed. The beta models full refunds only. Stored
failure values are bounded codes, not provider errors.

## D1 outbox and Cloudflare Queue

Accepted mutations write small D1 outbox records in the same transaction as
their business change. After a successful response, and once each minute, the
Worker claims eligible records and sends only `{ formatVersion,
outboxEventId }` to the instance Queue. The consumer marks the D1 record
delivered. Donor names, amounts, notes, content, and stored `payload_json` never
enter the Queue message or logs.

Publishing failure leaves the event retryable with exponential delay and a
bounded error code. The scheduled handler recovers claims left in `processing`
for more than five minutes. Queue consumer failures use Cloudflare retries; the
configured dead-letter queue retains messages that exhaust those attempts.

Each church deployment needs its own outbox Queue and dead-letter Queue. In an
account containing multiple instances, render instance-specific queue names in
the Wrangler configuration. A queue from one church must never be shared with
another church's Worker.

`/api/health` exposes only coarse readiness: D1 status, `clear`, `backlogged`,
or `stalled` outbox state, and whether payment webhooks are configured. It does
not expose counts, donor data, provider IDs, queue names, or error detail.
