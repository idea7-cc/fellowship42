# Contributing to Fellowship42

Thank you for helping build portable, church-owned software. Contributions are
accepted under the repository's Apache-2.0 license.

Read `AGENTS.md` before making changes. In particular, preserve the distinction
between the complete public church instance and the separately maintained
private Fellowship42 Cloud control plane.

## Development setup

Use Node.js 22 and the pnpm version declared in `package.json`.

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Before opening a change, run:

```bash
pnpm check:architecture
pnpm typecheck
pnpm test
pnpm build
pnpm deploy:dry-run
```

Keep changes focused and include tests for authorization, church boundaries,
schema invariants, management contracts, and externally visible API behavior.
Never commit `.dev.vars`, Cloudflare credentials, management keys, production
exports, Access JWTs, or member/donor data.

## Architecture expectations

- Treat one deployment as one portable church instance.
- Keep D1 authoritative and preserve explicit `church_id` integrity checks.
- Keep optional management behind the public management protocol.
- Do not add hosted billing, private dashboards, partner fleet logic, or
  control-plane implementation to this repository.
- Validate untrusted input, use prepared D1 statements, audit sensitive writes,
  and make external retries idempotent.
- Preserve backward-compatible public contracts or include a migration and ADR.

Use an issue or ADR for significant product, custody, protocol, or data-model
changes before beginning a large implementation.
