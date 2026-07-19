# ADR 0006: Public lifecycle manifest and evidence-only planning

- Status: accepted
- Date: 2026-07-19

## Context

Churches, partners, and Fellowship42 Cloud need one deployment shape before
automated provisioning or migration is safe. Direct Wrangler configuration is
useful to a developer but does not record portable identity, custody, exact
release provenance, or an operator-reviewable plan. A private deployment model
would make hosted instances harder to take over and allow the public and
commercial products to drift.

Provider resource IDs and credentials cannot be part of portable desired
state. A diagnostic tool also must not claim more evidence than it can obtain:
the current public health endpoint proves service topology but intentionally
does not disclose the portable instance ID.

## Decision

1. `@fellowship42/management-protocol` owns strict, versioned schemas for the
   non-secret deployment manifest, deterministic plan, and bounded doctor
   report.
2. The manifest identifies the installation only by its portable instance ID.
   It records a human account alias and logical resource names, never a
   Cloudflare account ID, D1 UUID, deployment token, management identity, or
   control-plane customer ID.
3. A release pin includes the exact tagged manifest URL, manifest SHA-256,
   application/schema/protocol versions, and 40-character source commit.
4. `f42ctl plan` is deterministic and evidence-only. Its current steps are
   non-destructive and perform no Cloudflare mutation.
5. `f42ctl doctor` is read-only, verifies bounded release bytes before parsing,
   inspects the declared local/runtime surfaces, and emits only enumerated
   checks with bounded codes.
6. Missing portable-identity evidence remains `unknown`; the tool does not
   infer identity from provider resources. Unknown or warning evidence cannot
   produce `healthy`.
7. `f42ctl` is published as a release artifact alongside the source and public
   protocol package. Private and third-party operators consume the published
   contracts rather than a relative checkout or a parallel deployment model.

## Consequences

- Self-managed and hosted operators can review the same desired state and
  diagnostic evidence without enabling management access.
- A manifest is safe to version only while it remains free of credentials and
  provider resource IDs; deployment adapters must resolve those separately.
- Deterministic planning creates a stable seam for future preview/apply and
  orchestration, but this ADR does not claim active reconciliation.
- A current doctor result normally remains `attention` until a safe identity
  proof is added. This is an honest evidence gap, not a reason to expose
  portable identity publicly.
- Export/import, credential rotation, domain cutover, and management enrollment
  require additional contracts and tests.
