# Fellowship42 architecture

## Decision

Fellowship42 is a portable, single-church application, not a shared application
database partitioned among hosted customers. One deployment is one operational,
security, ownership, backup, and migration boundary.

The same open-source instance can be:

- operated by Fellowship42 in Fellowship42-controlled Cloudflare infrastructure;
- deployed into a church-owned Cloudflare account and managed by Fellowship42;
- deployed into a church-owned account and managed by a certified partner; or
- operated independently without any Fellowship42 management connection.

The church application remains functional and exportable in every mode.

## System shape

```text
                    separate private repository
       ┌────────────────────────────────────────────┐
       │ Fellowship42 Cloud control plane           │
       │ dashboard · releases · billing · partners  │
       │ monitoring · support · optional MCP adapter│
       └──────────────────────┬─────────────────────┘
                              │
                   public versioned management API
                    opt-in · scoped · revocable
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   church A instance   church B instance   church C instance
   Worker + D1 + R2    Worker + D1 + R2    Worker + D1 + R2
   F42 operated        church operated     partner operated
```

Fellowship42 Cloud is an optional control plane. Each church instance is the
data plane and owns its own application data. Private software may orchestrate
deployments and call public management capabilities, but it must not become a
runtime dependency of normal church workflows.

## Instance runtime

```text
Browser
  |
  `-- Fellowship42 instance Worker
        +-- React SPA assets (Workers Static Assets)
        +-- Hono application API
        +-- authentication adapter (Cloudflare Access initially)
        +-- D1 relational system of record
        +-- R2 media objects
        +-- ChurchRoom Durable Object for realtime invalidation
        `-- optional management adapter (not enabled yet)
```

`apps/instance` is one full-stack Cloudflare Vite project. Vite runs the React
application and Worker at one origin; Wrangler deploys their versioned output
together. Bindings keep D1, R2, assets, and Durable Objects inside the instance
instead of calling Cloudflare REST APIs at runtime.

The public project site in `apps/project-site` is a separate Worker with a
separate release cadence. It is not a hosted-service dashboard.

## Portable identity and church scoping

The singleton `instance_metadata` row identifies the installation independently
of its current Cloudflare account, Worker name, D1 UUID, operator, or control-
plane customer ID. That portable identity travels with an export. Deployment
credentials and management keys do not.

`primary_church_id` identifies the church served by the instance. Domain tables
still carry explicit `church_id` values and composite foreign keys. This is
intentional defense in depth: authorization and relational integrity remain
explicit even though the deployment itself is the tenant boundary.

The current data model covers:

- users, identities, church memberships, roles, and permission grants;
- church profile, service times, publishing, ministries, and landing content;
- people, households, groups, attendance, courses, lessons, and completion;
- events, sermons, facilities, bookings, contributions, and media;
- webhook deduplication, idempotency, outbox delivery, and audit events.

D1 is authoritative. Durable Objects coordinate realtime clients but do not
hold the business record. R2 stores objects while D1 stores their ownership,
visibility, checksum, and authorization metadata.

## Application authentication and authorization

Cloudflare Access is the current authentication adapter. The Worker verifies
the Access JWT and maps its subject to an application user. Route authorization
then comes from church membership roles; browser state is display information,
not an authorization source.

Access is not the portable instance identity and must not become a requirement
for management interoperability. A future authentication change should remain
inside the instance boundary.

Public published content is readable without a session. Private people,
finance, support, and realtime operations require explicit permissions. Member,
donor, financial, and pastoral data must never be emitted as control-plane
telemetry.

## Optional management plane

The public contract lives in `packages/management-protocol`. It describes
instance identity, versions, custody, capabilities, commands, and results. The
instance-side adapter is reserved at `apps/instance/worker/management`.

Management uses authenticated HTTPS with application-level identity, replay
protection, capability authorization, revocation, and auditing. It is not a
Cloudflare Service Binding because independently owned Workers may live in
different accounts. It is not proprietary encryption and it is not an MCP
transport.

The intended default is instance-initiated communication. A disconnected
instance has no management capabilities enabled and continues operating
normally. Infrastructure deployment authority is a separate credential from
the management relationship.

MCP may expose the same operations to AI-enabled operator clients through a
separate adapter in the private repository. MCP must not define release,
backup, enrollment, or migration semantics.

See [Management protocol](management-protocol.md).

## Portability contract

A supported export must eventually include:

1. D1 schema and data;
2. R2 objects plus checksums and metadata;
3. the portable instance identity;
4. application, schema, protocol, and export-format versions;
5. non-secret configuration needed to reconstruct the deployment; and
6. a signed or checksummed manifest for offline verification.

Import creates new Cloudflare resources, restores data and objects, verifies
integrity, switches the domain, and rotates every deployment and management
credential. Cloudflare resource IDs are never portable identifiers.

The public `f42ctl` lifecycle tool will implement this contract. The private
control plane must use that same public reconciliation and migration logic.

## Repository and dependency boundaries

```text
apps/instance/                 deployable open church product
apps/project-site/             public project/community site
packages/brand/                public visual system
packages/management-protocol/  public integration contract
tooling/f42ctl/                public lifecycle tooling roadmap
docs/adr/                      architecture decision records
```

Allowed dependency direction:

```text
instance ──► management-protocol
instance ──► brand
project-site ──► brand
private control plane ──► published protocol and release artifacts
```

The public instance never imports private control-plane code. The control plane
never depends on unpublished instance internals or direct database access.
`pnpm check:architecture` enforces the coarse repository boundary in CI.

## Current versus planned

Implemented now:

- full-stack Cloudflare instance runtime;
- D1, R2, Access, and Durable Object foundations;
- a portable singleton instance identity;
- a compiled public management-contract package;
- explicit public/private repository boundaries.

Planned, not implied by the scaffolding:

- cryptographic management enrollment and command delivery;
- backup/export/import automation;
- self-service or partner reconciliation through `f42ctl`;
- Workers for Platforms hosted-fleet packaging;
- the private Fellowship42 Cloud control plane, dashboard, and MCP adapter.
