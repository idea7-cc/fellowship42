# Fellowship42

Fellowship42 is an Apache-2.0 church management system built as a portable,
single-church Cloudflare application. Every church can run an independent
Worker, D1 database, R2 bucket, and Durable Object namespace in an account it
owns or in an account operated by Fellowship42 or a certified partner.

The open-source instance is complete and useful without a hosted service. An
instance may optionally enroll with separately maintained Fellowship42 Cloud
software for managed updates, backups, monitoring, support, and partner fleet
operations. Disconnecting that management relationship must never disable the
church application or prevent export.

## Repository map

```text
apps/
  instance/                 one deployable church application
  project-site/             public project/community site
packages/
  brand/                    shared public visual system
  management-protocol/      public instance/control-plane contracts
tooling/
  f42ctl/                   planned portable deploy/export/import CLI
docs/
  adr/                      durable architecture decisions
  architecture.md           runtime and ownership boundaries
  repository-strategy.md    public/private repository contract
```

The private dashboard, partner console, billing, and fleet control plane do not
belong in this repository. They live in a separate `fellowship42-cloud`
repository and integrate through versioned public contracts and release
artifacts. See [Repository strategy](docs/repository-strategy.md).

## Local development

The repository uses Node.js 22 and pnpm 10.

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The instance UI and API run together at `http://localhost:5173`. Start the
separate public project site with `pnpm dev:site`.

Local public routes work without authentication. Protected routes require a
valid Cloudflare Access JWT; copy `apps/instance/.dev.vars.example` to
`apps/instance/.dev.vars` when testing Access through a forwarded request.

## Required checks

```bash
pnpm check:architecture
pnpm typecheck
pnpm test
pnpm build
pnpm deploy:dry-run
pnpm deploy:site:dry-run
```

Worker tests run in Cloudflare's Vitest integration against fresh D1 migrations
and deterministic development data.

`seed.sql` is local demo data only. A production database is initialized by the
Access-gated, one-time instance setup flow documented in
[the deployment runbook](docs/deployment.md).

## Deploying an instance

Each deployment needs dedicated D1 and R2 resources plus its own application
configuration. Replace the placeholder D1 ID and Access values in
`apps/instance/wrangler.jsonc`, then follow
[the deployment runbook](docs/deployment.md).

The committed Wrangler configuration is development scaffolding, not a hosted
multi-tenant environment. Hosted orchestration must produce the same portable
instance shape as a church-managed deployment.

## Documentation

- [Architecture](docs/architecture.md)
- [Repository strategy](docs/repository-strategy.md)
- [Management protocol](docs/management-protocol.md)
- [Releases and immutable artifacts](docs/releases.md)
- [Architecture decisions](docs/adr/README.md)
- [Current handover](docs/handover.md)
- [Product plan](docs/fellowship42-product-plan.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

Fellowship42 is licensed under the [Apache License 2.0](LICENSE).
