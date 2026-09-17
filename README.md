# Fellowship42

Open-source church software built around church ownership and portability.

> **Early alpha — for development and evaluation with synthetic data.**
> Fellowship42 has working application features and automated tests, but known
> defects and incomplete workflows remain. It is not ready for production
> church records, live donations, or reliance as a church's system of record.

Fellowship42 brings people, households, groups, attendance, courses, events,
sermons, and contribution records into one church application. The project is
licensed under Apache-2.0 and built on Cloudflare Workers, D1, R2, Durable
Objects, and Queues.

## Why Fellowship42 exists

A church should be able to choose who operates its software and keep control
of its data. That principle shapes the project:

- **One church, one instance.** Each installation has its own application,
  database, media storage, and portable identity.
- **Independent operation.** The church application runs without Fellowship42
  Cloud, a partner, or a private backend. A church-owned Cloudflare account is
  the strongest ownership mode.
- **Optional management.** An owner can approve and revoke an operator's
  management access. Disconnecting management must preserve the application,
  its data, and the ability to export.
- **A documented exit path.** Public export, verification, and restore tooling
  is part of the project. Portability must be testable by independent operators.

Fellowship42 Cloud is a separately developed, optional management service.
Its private dashboard, billing, and fleet operations live outside this
repository. Core church features are not gated by a paid service.
See the [architecture](docs/architecture.md) and
[repository boundaries](docs/repository-strategy.md).

## What you can explore today

The current source includes these features for development and evaluation:

| Area | Implemented features |
|---|---|
| Setup and access | First-owner setup through Cloudflare Access, owner-managed team invitations and roles, and server-side permission checks |
| People and households | Private directory, household relationships, search, pagination, and record editing |
| Groups and learning | Group rosters, sessions and attendance, courses, lessons, and enrollment |
| Publishing | Church settings, gatherings, style and images, private profile drafts and preview, public church website, and groups/courses/events/sermons with independent publish controls |
| Contributions | Finance-scoped manual entry, a signed normalized payment-event API, and durable outbox delivery |
| Optional management | Owner-approved enrollment, signed sync, grants, rotation, disconnect, update authorization, and diagnostic support approval |
| Portability | Release verification, deployment planning, export assembly, staged import contracts, and deterministic migration rehearsals |

The payment-event API is an integration boundary; connecting a payment provider
requires an adapter and provider testing. The lifecycle tools also require
operator-supplied collection and provider adapters for live infrastructure work.
Automated conformance tests do not establish a successful live restore or exit.

## What still needs work

Before a public beta, the project needs to close gaps in the everyday church
experience and prove the operating procedures:

- Form submission and retry reliability, attendance history when rosters
  change, and access to records beyond the first page in every workflow.
- Wider browser, mobile, accessibility, and multi-user testing with realistic
  synthetic datasets.
- Live deployment, upgrade, backup, restore, and exit exercises, security/privacy
  review, and church pilot feedback.

Member sign-in and account claiming remain proposed; Cloudflare Access is the
current authentication adapter. A congregation-wide self-service portal is
not available yet. See the [member identity proposal](docs/adr/0020-instance-owned-member-identity.md).

Tagged releases identify exact software artifacts. They do not imply beta,
production, hosted-service, or partner readiness. The development branch can
contain changes that are not in a published release. See
[release policy](docs/releases.md) and
[readiness evidence](docs/ga-readiness.md) before evaluating a deployment.

## Run locally

Use the Node.js version in `.node-version` and the pnpm version declared in
`package.json`. Run `pnpm verify` for the same gate used by CI; `pnpm lint`
and `pnpm format:check` provide focused feedback.

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The church website runs at `http://localhost:5173`; the staff workspace is at
`http://localhost:5173/app`. Start the
separate public project site with `pnpm dev:site`.

Public routes work without authentication. Protected workflows require a valid
Cloudflare Access JWT; local seed data does not provide a sign-in bypass. Use
`apps/instance/.dev.vars.example` as the configuration reference when testing
Access through a forwarded request.

`seed.sql` contains local demo data only. For a fresh deployed installation,
follow the Access-gated first-owner setup in the
[deployment runbook](docs/deployment.md).

## Deployment and portability

Deployment currently requires a technically capable operator and a Cloudflare
account with dedicated resources for each church. The committed Wrangler
configuration contains placeholders; it is not ready to deploy unchanged.
Use disposable environments and synthetic data while evaluating this alpha.

Start with the [deployment runbook](docs/deployment.md). To inspect the example
manifest and its offline configuration evidence:

```bash
pnpm f42ctl plan \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json
pnpm f42ctl doctor \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json \
  --offline
```

These commands do not create or change Cloudflare resources. Continue with the
[lifecycle tooling guide](docs/lifecycle-manifests-and-doctor.md),
[portable exports](docs/portable-exports.md),
[import and cutover](docs/portable-import-and-cutover.md), and
[migration rehearsal](docs/migration-rehearsal.md).

## Repository layout

```text
apps/instance/                 React UI and Worker API for one church
apps/project-site/             Public project/community website
packages/brand/                Shared presentation code
packages/management-protocol/  Public, versioned management contracts
tooling/f42ctl/                Public lifecycle and verification tooling
docs/                         Architecture, workflows, runbooks, and ADRs
```

## Contribute and give feedback

Contributions and reproducible bug reports are welcome. Read
[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) before changing
code. Use synthetic data in issues and examples, and include the exact release
or commit you tested.

Run the repository checks before submitting a change:

```bash
pnpm check:architecture
pnpm typecheck
pnpm test
pnpm test:migration-rehearsal
pnpm build
pnpm deploy:dry-run
pnpm deploy:site:dry-run
```

Community support is best effort; there is no response, uptime, or recovery
SLA. See [SUPPORT.md](SUPPORT.md). Report suspected vulnerabilities privately
through [SECURITY.md](SECURITY.md).

Additional documentation:

- [Church setup and website publishing](docs/church-setup-and-publishing.md)
- [People and household workflows](docs/directory-workflows.md)
- [Ministry and publishing workflows](docs/ministry-publishing-workflows.md)
- [Team and roles](docs/team-and-roles.md)
- [Contributions and delivery](docs/contributions-and-delivery.md)
- [Optional management protocol](docs/management-protocol.md)
- [Security and privacy boundaries](docs/security-and-privacy.md)
- [Operator recovery](docs/operator-recovery.md)
- [Independent operator guidance](docs/third-party-operators.md)
- [Governance](GOVERNANCE.md), [code of conduct](CODE_OF_CONDUCT.md), and
  [trademark policy](TRADEMARKS.md)

## License

[Apache License 2.0](LICENSE).

For implementation maturity and remaining work, read
[Current state](docs/current-state.md).
