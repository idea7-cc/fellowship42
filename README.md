# Fellowship42

Fellowship42 is a multi-tenant church management platform built on:

- `Convex` for data, functions, auth integration, and realtime
- `apps/app` for the staff/member SPA (`Vite + React`)
- `apps/web` for the marketing site (`Astro`)
- `apps/worker` for public APIs and webhooks (`Hono + Cloudflare Workers`)
- `packages/brand` for shared tokens, presets, and CSS recipes

## Workspace

The repo uses `pnpm` workspaces.

```bash
pnpm install
pnpm codegen:convex
pnpm typecheck
pnpm build
```

## Development

```bash
pnpm dev:convex
pnpm dev
pnpm dev:web
pnpm dev:worker
```

## Convex notes

- Generated Convex artifacts are checked into `convex/_generated/`
- `pnpm codegen:convex` refreshes generated bindings for the linked Convex deployment
- `convex/auth.config.ts` uses a placeholder Clerk issuer domain until real auth
  wiring is completed
- `.github/workflows/ci.yml` runs the same install/typecheck/build baseline on push and PR

## Documentation

- Architecture: `docs/architecture.md`
- Handover: `docs/handover.md`
- UI system: `docs/ui-design-system.md`
- Product plan: `docs/fellowship42-product-plan.md`
- Legacy feature audit: `docs/reference/legacy-payload-feature-audit.md`
