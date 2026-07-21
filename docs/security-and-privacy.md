# Security and privacy boundaries

Fellowship42 is software for sensitive church records, not a claim that every
deployment is secure or legally compliant. Security is shared between the
public release, the infrastructure owner, the active operator, the church, and
configured identity/payment providers.

## Public instance guarantees

- One deployment is one church ownership, data, backup, and migration boundary.
- D1 is authoritative; R2 access is authorized by D1 metadata; Durable Objects
  coordinate realtime state but are not the business record.
- Protected input is strictly validated, authorization is server-side, D1 uses
  prepared statements, and sensitive writes are audited.
- Optional management is deny-by-default, capability-scoped, signed, replay-
  defended, expiring where appropriate, locally inspectable, and revocable.
- Health, operation, conformance, and migration evidence is privacy-bounded and
  cannot carry church record or media payloads.
- Export, restore, credential rotation, and exit use public versioned contracts
  that do not require Fellowship42 Cloud.

These are design and test properties of the released software. They do not
replace correct production configuration, monitoring, backup, incident
response, or independent review.

## Data that may leave an instance

Public pages contain only explicitly published church/ministry content.
Optional management messages contain portable identity, release/protocol state,
coarse operational health, grant/connection state, bounded operation results,
and audit evidence defined by strict public schemas. They must not contain
people, households, contributions, donor details, notes, attendance, media
objects, exports, credentials, or arbitrary logs.

Portable exports intentionally contain church data and therefore remain under
church-authorized encrypted custody. The control plane may retain bounded
verification and opaque artifact metadata, not the export payload in D1 or a
browser.

## Operator checklist

- Protect the application with a reviewed identity policy and test denial.
- Separate public, webhook, enrollment, and protected routes precisely.
- Scope deployment credentials to the intended account and keep them separate
  from management credentials.
- Store secrets only in approved secret systems; rotate on handoff or suspicion.
- Enable provider logging without request/response bodies or sensitive values.
- Exercise Queue failure, portable export verification, isolated restoration,
  credential rotation, and domain cutover.
- Keep current with verified stable releases and preserve forward-only D1
  migration compatibility.
- Establish applicable privacy notices, retention, access, subprocessors,
  breach response, and data-subject/church processes with qualified counsel.

## Reporting

Follow the private process in [the security policy](../SECURITY.md). Operational
incidents in a hosted or partner service should also follow that operator's
contract and incident channel.
