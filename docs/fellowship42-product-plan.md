# Fellowship42 product plan

## Product thesis

Fellowship42 is a portable, open-source operating system for a church. A church
can choose managed hosting without surrendering the ability to take over a
working deployment and all of its data.

The initial market remains small and midsize U.S. Protestant and Evangelical
churches with lean staff teams. The product should remain adaptable to other
traditions without making the first workflows generic or abstract.

The customer promise is not “learn Cloudflare.” It is:

> Fellowship42 is managed for you when you want it and genuinely yours when you
> need it.

## Platform decision

Each church instance is an independent Cloudflare application:

- React and Hono deploy together as one Worker application;
- D1 is the relational system of record;
- R2 stores media and export objects;
- Durable Objects coordinate church-scoped realtime clients;
- Cloudflare Access is the initial application authentication adapter;
- Wrangler is the local and direct deployment toolchain;
- the public `f42ctl` owns deterministic planning and doctor evidence and will
  grow into deploy, export, import, verification, connect, and disconnect
  behavior.

Payments and communications remain external integrations. “All Cloudflare”
means Fellowship42 needs no second application backend, not that Cloudflare
replaces payment processors or delivery vendors.

## Product surfaces

### Open church instance

The complete React and Worker application for staff, ministry leaders, finance
users, members, and public church content. It remains usable without any
commercial connection.

### Public project site

The Astro site for documentation, releases, community, self-management, and
public explanation of Fellowship42 services. It is not the customer dashboard.

### Fellowship42 Cloud

A separate private control plane and dashboard for provisioning, releases,
backups, monitoring, support, billing, and hosted customer operations.

### Partner Pro

A private role and product surface in Fellowship42 Cloud for certified experts
to manage their own client churches with delegated access, audit history,
release workflows, support tooling, and clear customer offboarding.

### Management API and MCP

The open management API is the stable optional connection between instances and
compatible control planes. A private MCP adapter may expose approved control-
plane operations to AI-enabled operator clients.

## Service editions

- **Community** — Apache-2.0 instance, public documentation, manual Wrangler or
  `f42ctl` lifecycle, no required management connection.
- **Hosted** — Fellowship42-operated instance, monitoring, backups, updates,
  support, and a documented export/redeployment exit.
- **Sovereign managed** — church-owned Cloudflare account operated by
  Fellowship42; exit is primarily credential revocation rather than migration.
- **Partner managed** — church-owned account operated by a certified partner.
- **Partner Pro** — multi-client operational dashboard and commercial partner
  program.

Partners should generally operate church-owned infrastructure instead of owning
their clients' accounts. Ownership, billing, delegated access, emergency
revocation, and offboarding must be explicit.

## Domain priorities

The D1 model covers church profile and publishing, users and memberships,
people and households, ministries and groups, attendance, courses, events,
sermons, facilities, contributions, media, audit, idempotency, webhook
ingestion, and outbox delivery.

The product should deepen complete workflows on that model rather than add more
tables speculatively.

## Delivery sequence

### Foundation — implemented

- Cloudflare runtime and one-command app/API development;
- normalized D1 authorization and domain model;
- Access session linking and protected directory API;
- public published content and R2 delivery foundations;
- Durable Object invalidation foundation;
- local migrations, seed data, Workers integration tests, and deploy dry-runs;
- portable singleton instance identity;
- production instance bootstrap and first-owner onboarding;
- instance-first church navigation and draft visibility for members;
- complete people and household CRUD, search, pagination, permissions, and audit workflow;
- complete group, course/lesson, event, sermon, and R2 media publishing
  workflows with draft isolation and public-media integrity;
- explicit public/private repository boundary;
- initial compiled management protocol package;
- portable deployment manifest, immutable release/source verification,
  deterministic non-destructive deploy plan, and bounded doctor evidence.

### Instance beta — implemented

- pagination, search, error recovery, and accessible form states;
- finance-scoped contribution views and verified normalized payment webhooks;
- Queue-backed outbox delivery, retry, stale-claim recovery, and dead-letter
  retention.

### Portability milestone — implemented

- versioned export manifests;
- provider-neutral `f42ctl` reconciliation plus export, import, and
  verify-export, with provider adapters kept separately scoped;
- D1 and R2 integrity verification;
- credential rotation and domain cutover runbooks;
- a tested hosted-to-church-owned migration exercise;
- migration compatibility and expand/contract schema policy.

### Managed hosting milestone — public contracts implemented; service proof pending

- opt-in enrollment, capability grants, disconnect, and key rotation;
- instance status, backup export, update preparation, and audited update apply;
- private control plane, dashboard, billing, monitoring, and release rings;
- hosted Worker packaging and custom-domain automation;
- incident, restore, privacy, data-processing, and support runbooks.

### Partner milestone — public compatibility implemented; private pilot pending

- partner organizations, staff, customers, assignments, and least privilege;
- time-limited support access and immutable operational audit;
- certification, compatibility tests, directory, and partner code of conduct;
- partner billing and client handoff workflows;
- optional Pro MCP operator tools with explicit approval for mutations.

## Open-source and commercial boundary

The public repository is Apache-2.0 and owns the complete church instance,
public contracts, and portable lifecycle tools. Private value is operational:
fleet management, billing, monitoring, releases, support, and the partner
network.

The repository's [trademark policy](../TRADEMARKS.md) protects the Fellowship42
name, official service, and certified-partner designation without restricting
legitimate code forks. Compatibility remains separate from endorsement or
certification.

## Current product questions

- Which two staff workflows must be excellent for the first paid pilot?
- What portable authentication options should follow the initial Access adapter?
- What exact data may leave an instance as operational telemetry?
- Which management capability requires local confirmation on every use?
- What export/restore duration and recovery objectives can Hosted promise?
- When does the hosted fleet require Workers for Platforms rather than ordinary
  per-instance Workers?
