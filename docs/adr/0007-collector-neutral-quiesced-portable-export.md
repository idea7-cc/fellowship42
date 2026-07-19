# ADR 0007: Collector-neutral, quiesced portable export

- Status: accepted
- Date: 2026-07-19

## Context

One Fellowship42 deployment is one church data-custody boundary. A church needs
an export it can inspect and verify without Fellowship42 Cloud, and optional
management software needs useful proof that an export occurred without
receiving church payloads.

D1 and R2 expose different collection interfaces and do not provide one
cross-resource snapshot transaction. Coupling the portable format to a private
collector, a Cloudflare account identifier, or internal Wrangler state would
weaken self-hosting and future portability.

## Decision

The public lifecycle package owns export format version 1 and its privacy-
bounded evidence schema. `f42ctl export` assembles explicitly supplied D1 SQL
and indexed R2 files into a new directory. It derives portable configuration
from the public deployment manifest, content-addresses R2 bytes, and records
cryptographic size/digest evidence for every root artifact and object.

Version 1 accepts only an operator-quiesced capture. It binds the portable
instance ID and exact source release but carries no Cloudflare resource ID,
credential, management enrollment, domain, or private control-plane identity.

`f42ctl verify-export` operates offline and fails closed on contract,
filesystem, identity, completeness, and integrity violations. Its successful
result is a bounded evidence object. Optional management software may store
that evidence but must not ingest the bundle, D1 rows, R2 object keys, church
counts, or payload bytes.

## Consequences

- Churches and third-party operators use the same public format and verifier.
- Collection adapters can use Wrangler, an R2 Worker binding, or standard R2
  tooling without changing the durable format.
- Export bundles remain highly sensitive and require operator-controlled
  encryption and retention outside source control.
- A v1 export cannot claim hot cross-resource consistency. Automating quiesce
  and collection remains future work.
- Import and cutover must preserve the instance ID, provision new provider
  resources, rotate credentials, and verify this format rather than depending
  on source resource identifiers.
