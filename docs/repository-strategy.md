# Public and private repository strategy

## Recommendation

Maintain two independent repositories:

1. `fellowship42` — public Apache-2.0 instance, contracts, lifecycle tooling,
   project site, documentation, tests, and release artifacts.
2. `fellowship42-cloud` — private hosted control plane, commercial dashboard,
   partner console, orchestration, billing, entitlements, and operator tooling.

Do not use a private directory in the public monorepo, a long-lived private
branch, or a Git submodule containing commercial code. Those arrangements make
accidental publication, coupled CI, inaccessible history, and confusing issue
ownership much more likely.

## Public repository

```text
fellowship42/
  apps/
    instance/                 one complete deployable church installation
    project-site/             open-source project/community website
  packages/
    brand/                    public brand primitives
    management-protocol/      schemas and types for optional management
  tooling/
    f42ctl/                   deployment/export/import/enrollment tooling
  docs/
    adr/                      durable architecture decisions
  fellowship42.repository.json
```

The public repository owns everything required to run, inspect, migrate, fork,
and independently operate an instance. A hosted customer must not receive a
less complete application than a self-managed customer.

## Private repository

Start the private repository as another pnpm Cloudflare monorepo:

```text
fellowship42-cloud/
  apps/
    control-plane/            always-on fleet API and scheduled operations
    dashboard/                Fellowship42 staff and church customer UI
  packages/
    cloudflare-orchestrator/  account/resource reconciliation
    management-client/        typed client for the public protocol
    partner-domain/           partner firms, staff, churches, assignments
    entitlements/             plans and commercial capabilities
    mcp-adapter/              optional AI/operator surface
    audit/                    control-plane audit contracts and helpers
  docs/
    runbooks/                 private operational and incident procedures
```

The dashboard should be a client of the always-on control plane. It should not
hold fleet-wide Cloudflare credentials or become responsible for scheduled
backups, polling, alerts, or deployments.

Partner Pro can initially be a role and navigation surface in the same
dashboard rather than a separate application. Split it only if deployment,
security, or product cadence genuinely diverges.

## Integration contract

The repositories integrate through released artifacts, never source copying:

- `@fellowship42/management-protocol` — independently versioned schemas/types;
- an instance release manifest — application version, schema version, protocol
  range, export-format range, artifact checksum, and migration metadata;
- the public `f42ctl` library/CLI — currently deterministic deployment/import
  planning, doctor, portable export/verification, and staged import/cutover
  execution, growing into active deploy, connect, and disconnect operations;
- stable HTTP management endpoints implemented by the public instance.

The private repository pins exact compatible versions. It should not import
`apps/instance/worker/*`, copy D1 migrations, or query an instance's D1 database
directly. Those shortcuts would make the hosted service a privileged fork and
destroy the portability boundary.

## Versioning

Version these concerns independently:

| Concern | Suggested version |
|---|---|
| Fellowship42 application release | SemVer |
| Management protocol | SemVer major compatibility, wire version in payloads |
| D1 schema | Monotonic migration number |
| Export bundle | Explicit format version |
| Control plane | Private release identifier |

The control plane records each instance's application, schema, management
protocol, and export-format versions. Rollouts use capability negotiation and
supported ranges rather than assuming every instance is current.

## Fast cross-repository iteration

For normal development, check out the repositories side by side:

```text
repos/
  fellowship42/
  fellowship42-cloud/
```

Use a public package canary or a locally packed tarball when changing the
protocol. Never commit a `file:../fellowship42/...` dependency to the private
repository. CI in the private repository must install a published immutable
version so a clean checkout is reproducible.

The intended release loop is:

1. change and test the public protocol or lifecycle library;
2. publish a canary version for private integration testing;
3. update and test the private control plane against that canary;
4. publish the stable public release;
5. pin the private repository to the stable version;
6. roll out compatible instance releases through rings.

This preserves separate iteration while keeping the seam honest.

## What remains private

Private code may provide operational convenience and commercial services:

- customer and partner account management;
- billing and plan enforcement in the hosted service;
- fleet monitoring, alerts, backup schedules, and release rings;
- support workflows, incident tools, and aggregate operational telemetry;
- Cloudflare account orchestration and credential vaulting;
- an MCP adapter for approved operator actions.

Application features, church data access, export, restore, and independent
operation are not private-only capabilities.

## Trademark and certification

Apache-2.0 permits commercial forks. Protect the official service and partner
network through a separate Fellowship42 trademark policy, certification terms,
compatibility tests, and partner code of conduct—not by weakening the open
instance or hiding its management contract.
