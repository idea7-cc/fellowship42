# Fellowship42

Open-source church software built around church ownership and portability.

> **Pre-alpha — for evaluation with synthetic data only.** The working source
> is being prepared for a [working alpha](docs/fellowship42-product-plan.md#readiness-stages),
> which has not been declared. It has working features and automated tests, but
> known defects and incomplete workflows remain. It is not ready for real
> church records, live donations, or use as a church's system of record.

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
| Setup and access | Instance-owned staff passkeys, first-owner setup, team invitations and roles; optional Cloudflare Access |
| People and households | Private directory, household relationships, search, pagination, and record editing |
| Groups and learning | Group rosters, sessions and attendance, courses, lessons, and enrollment |
| Publishing | Church settings, gatherings, style and images, private profile drafts and preview, and groups/courses/events/sermons with independent publish controls |
| Church website | An EmDash website beside the instance for pages, articles, and menus, with church blocks that show live published records through a versioned public contract; an owner-claimed first editor; the same integration for an existing EmDash site |
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

- Access to records beyond the first page in every workflow, and clearer
  messages when a retried edit or slug-keyed create meets its own earlier
  success.
- Wider browser, mobile, accessibility, and multi-user testing with realistic
  synthetic datasets.
- Live deployment, upgrade, backup, restore, and exit exercises, security/privacy
  review, and church pilot feedback.

Member account claiming remains proposed. Staff can use instance-owned passkeys
or optional Cloudflare Access; see [staff sign-in](docs/staff-sign-in.md). A congregation-wide self-service portal is
not available yet. See the [member identity proposal](docs/adr/0020-instance-owned-member-identity.md).

Tagged releases identify exact software artifacts. They do not imply beta,
production, hosted-service, or partner readiness. The development branch can
contain changes that are not in a published release. See
[release policy](docs/releases.md) and
[readiness evidence](docs/ga-readiness.md) before evaluating a deployment.

## Bring your own agent

Administrators can connect an external agent to read church information and
save private church profile drafts (not EmDash website pages). The church
grants and revokes access locally; publishing stays in the app. This
pre-alpha surface needs operator setup and a client supporting MCP
2026-07-28. See [agent connections](docs/agent-connections.md).

## Run locally

You need Node.js 26 (26.9.0 or later, per `.node-version` and `engines`) and
pnpm 12.4.2 (`packageManager` in `package.json`). Two dependencies are held
below their latest major: TypeScript stays on 6.0 because `typescript-eslint`
supports only TypeScript below 6.1, and Vitest stays on 4.1 because
`@emdash-cms/plugin-test` requires Vitest 4.1. From a clean checkout:

1. Install dependencies and turn on local passkey sign-in. The example
   configuration sets `SIGN_IN_ORIGIN=http://localhost:5173` and nothing else.

   ```bash
   pnpm install --frozen-lockfile
   cp apps/instance/.dev.vars.example apps/instance/.dev.vars
   ```

2. Create the local database and load the synthetic demo church.

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

   Optionally, to see lists and pickers past their first page, also run
   `pnpm db:seed:large`. It adds 250 synthetic people in households, 150
   contributions, three groups with rosters over 100 and 150 small media files,
   to local state only.

3. Start the instance at `http://localhost:5173` and leave it running.

   ```bash
   pnpm dev
   ```

4. In a second terminal, create a sign-in link for the seeded owner,
   `owner@example.test`.

   ```bash
   pnpm dev:owner-link
   ```

   It prints a one-time link, also saved under
   `apps/instance/.wrangler/owner-links/`, that expires in ten minutes. Each
   run revokes the owner's existing passkeys and sessions, so run it again
   whenever you need to sign in afresh.

5. Open the link, choose **Create passkey**, and you are signed in to the staff
   workspace at `http://localhost:5173/app` as the demo church's owner.

To start again from nothing, stop `pnpm dev`, run
`rm -rf apps/instance/.wrangler/state`, and repeat from step 2. Seed data is
local demo data only and is not a sign-in bypass. For an empty instance or a
deployed one, use first owner setup in [staff sign-in](docs/staff-sign-in.md)
and the [deployment runbook](docs/deployment.md).

Optional: the church's EmDash website. Copy `apps/website/.dev.vars.example`
to `apps/website/.dev.vars`, uncomment `WEBSITE_ORIGIN` and
`WEBSITE_SETUP_SECRET` in `apps/instance/.dev.vars`, give both files the same
`WEBSITE_SETUP_SECRET`, restart `pnpm dev`, and run `pnpm dev:website`. Open it
at `http://www.localhost:4322`, not `http://localhost:4322`: website setup and
passkeys are bound to that origin, which keeps them apart from the instance's.
[EmDash church websites](docs/emdash-church-websites.md#local-evaluation)
describes the full local evaluation. `pnpm dev:site` starts the separate public
project site.

The acceptance journeys run both website setup paths against production builds
on isolated synthetic state. They drive Chromium at `/usr/bin/chromium`; set
`CHROMIUM_PATH` to use another Chromium or Chrome executable.

```bash
pnpm acceptance:fellowship42-first
pnpm acceptance:emdash-first
```

## Deployment and portability

Deployment currently requires a technically capable operator and a Cloudflare
account with dedicated resources for each church. The committed Wrangler
configuration contains placeholders; it is not ready to deploy unchanged.
Use disposable environments and synthetic data while evaluating it.

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
apps/website/                  The church's EmDash website (same installation)
apps/project-site/             Public project/community website
packages/brand/                Shared presentation code
packages/management-protocol/  Public, versioned management contracts
packages/website-contract/     Public, versioned church website contract
packages/emdash/               Trusted EmDash integration: church blocks
packages/emdash-connect/       Sandboxed EmDash registry connector
tooling/f42ctl/                Public lifecycle and verification tooling
docs/                         Architecture, workflows, runbooks, and ADRs
```

`f42ctl` plans, diagnoses, exports, restores, and hands off the optional EmDash
website together with the instance, as one installation.

## Contribute and give feedback

Contributions and reproducible bug reports are welcome. Read
[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) before changing
code; [the handover](docs/handover.md) says where a change starts. Use
synthetic data in issues and examples, and include the exact release or commit
you tested.

Run `pnpm verify` before submitting a change; CI runs the same gate on every
pull request. For quicker feedback, `pnpm lint`, `pnpm format:check`,
`pnpm typecheck` and `pnpm test` each run one part of it.

Community support is best effort; there is no response, uptime, or recovery
SLA. See [SUPPORT.md](SUPPORT.md). Report suspected vulnerabilities privately
through [SECURITY.md](SECURITY.md).

Additional documentation:

- [Product plan and readiness stages](docs/fellowship42-product-plan.md),
  including planned STEP Bible study and SignalWire church phone service
- [Church setup and website publishing](docs/church-setup-and-publishing.md)
- [EmDash church websites](docs/emdash-church-websites.md) and the
  [public website contract](docs/website-contract.md)
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
