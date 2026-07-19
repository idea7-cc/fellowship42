# Fellowship42 handover

Last updated: 2026-07-19

## Current direction

Fellowship42 is now explicitly an Apache-2.0, Cloudflare-native, portable
single-church application. Each deployed instance is an independent ownership,
backup, migration, and management boundary.

Optional commercial management belongs to a separate private
`fellowship42-cloud` repository. This public repository owns the complete church
instance, public contracts, and future portable lifecycle tooling.

Read `AGENTS.md`, `docs/architecture.md`, and `docs/repository-strategy.md`
before changing the system shape.

## Checked-in implementation

- `apps/instance` builds the React SPA and Hono Worker together through one
  Vite/Wrangler loop;
- a 30+ table D1 schema with permissions, composite church integrity, soft
  deletion, audit, outbox, webhook deduplication, and idempotency primitives;
- `instance_metadata` establishes one portable instance identity and primary
  church independently of Cloudflare resource IDs;
- public church/ministry publishing APIs plus protected group, course/lesson,
  event, sermon, and checksummed R2 media lifecycle APIs;
- Cloudflare Access verification, user linking, suspended-user rejection, and
  church-scoped permissions;
- complete people/household and ministry/publishing operator workflows with
  optimistic concurrency, audit/outbox records, and realtime invalidation;
- finance-scoped contributions, timestamped HMAC payment-event verification,
  replay/invariant enforcement, and privacy-bounded audit evidence;
- per-instance Queue-backed outbox delivery with scheduled stale-claim
  recovery, retry delay, dead-letter retention, and coarse health state;
- hibernatable `ChurchRoom` Durable Objects for protected invalidation;
- typed React queries and Access session state;
- Workers-runtime migration and API tests;
- `@fellowship42/management-protocol` with initial versioned descriptors,
  capabilities, command envelopes, replay metadata, lifecycle manifests,
  deterministic plans, and bounded doctor reports;
- an installable `f42ctl` CLI that validates desired deployment state, verifies
  immutable release bytes and source commit, produces a non-destructive plan,
  and inspects local/runtime shape without credentials;
- a machine-readable repository manifest plus CI boundary enforcement;
- architecture ADRs and explicit private-repository guidance;
- the public project site in `apps/project-site`;
- Apache-2.0 `LICENSE` and `NOTICE` files.

No remote management endpoint, control plane, MCP server, export/import
implementation, active Cloudflare reconciliation, or hosted provisioning
system is implemented. Existing lifecycle contracts do not imply those future
capabilities.

## Verified baseline

On 2026-07-19 the following completed successfully for the current beta:

- `pnpm check:architecture`;
- `pnpm typecheck`;
- `pnpm test` — 8 management-protocol, 7 lifecycle CLI, and 26
  Workers/client integration tests;
- `pnpm build`;
- generated Cloudflare binding types with Wrangler 4.112.0;
- instance `wrangler deploy --dry-run`;
- project-site `wrangler deploy --dry-run`.

The Node 22 runtime prints a `module.register()` deprecation warning from the
current Cloudflare Vite/Vitest toolchain. It does not fail the build or tests.

## Account-dependent blockers

Remote deployment still needs:

1. a target Cloudflare account and dedicated D1 database;
2. a dedicated R2 bucket;
3. an instance domain;
4. a Cloudflare Access application, policies, team domain, and audience; and
5. the intended first owner's deployment-scoped bootstrap email secret.

See `docs/deployment.md` for the direct Wrangler rollout shape.

## Recommended next architecture work

1. Specify and implement a versioned export bundle for D1, R2, configuration,
   checksums, and release metadata.
2. Exercise a complete deploy/export/import/domain-cutover migration.
3. Complete owner-facing church profile and publication controls after the
   instance-first bootstrap while retaining `church_id` defense in depth.
4. Write the management enrollment/signing threat-model ADR before enabling any
   management route.
5. Keep `fellowship42-cloud` on published lifecycle contracts and immutable
   release artifacts; never a relative checkout or private deployment fork.
6. Exercise contribution and Queue delivery against a real beta provider and
   instance before accepting live funds.

## Important files

| File | Purpose |
|---|---|
| `AGENTS.md` | authoritative contributor/model invariants |
| `fellowship42.repository.json` | machine-readable public/private boundary |
| `apps/instance/wrangler.jsonc` | instance Worker, assets, D1, R2, DO, and Access bindings |
| `apps/instance/migrations/0001_initial.sql` | canonical church domain model |
| `apps/instance/migrations/0002_instance_identity.sql` | portable singleton instance identity |
| `apps/instance/worker/index.ts` | middleware, health, logging, and route composition |
| `apps/instance/worker/routes/bootstrap.ts` | one-time Access-gated production initialization |
| `apps/instance/src/components/bootstrap-gate.tsx` | first-owner setup experience |
| `apps/instance/worker/management/README.md` | reserved optional management boundary |
| `apps/instance/test/api.spec.ts` | Workers/D1 integration baseline |
| `apps/instance/test/bootstrap.spec.ts` | bootstrap ownership and atomicity coverage |
| `apps/instance/test/directory.spec.ts` | people/household permissions, concurrency, audit, and lifecycle coverage |
| `apps/instance/test/content.spec.ts` | ministry publishing, permissions, R2 integrity, and public visibility coverage |
| `apps/instance/test/finance-delivery.spec.ts` | finance permissions, signed webhook replay, privacy, and Queue recovery coverage |
| `packages/management-protocol/src/index.ts` | public management schemas and types |
| `packages/management-protocol/src/lifecycle.ts` | portable deployment, plan, and doctor contracts |
| `docs/repository-strategy.md` | two-repository integration and release strategy |
| `tooling/f42ctl/src/cli.ts` | public lifecycle CLI entrypoint |
| `docs/lifecycle-manifests-and-doctor.md` | lifecycle contract and evidence semantics |

## Guardrails

- Never trust a church ID, role, operator, or capability supplied by a client.
- Do not put private control-plane code in this repository.
- Keep management identity separate from Cloudflare deployment authority.
- Do not put donor/member payloads in logs, Durable Object state, telemetry, or
  public caches.
- Treat D1 migrations as forward-only once a remote instance exists.
- Do not use `seed.sql` against production.
- Do not claim migration support until the export/import exercise is automated
  and verified.
