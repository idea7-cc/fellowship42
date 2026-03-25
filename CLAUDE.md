# Fellowship42

Multi-tenant church management platform built on Convex + Hono + Vite React + Astro.

## Key docs to read first

- `docs/handover.md` — Current project state, what's built, known issues, prioritized next steps
- `docs/architecture.md` — Stack diagram, data flow, auth flow, deployment targets
- `docs/ui-design-system.md` — Component system, brand tokens, 7 church presets, styling rules
- `docs/reference/convex-coding-guidelines.md` — Convex API patterns and best practices

## Convex backend

When working on Convex code in `convex/`:
- Read `docs/reference/convex-coding-guidelines.md` for correct Convex API usage
- The schema is in `convex/schema.ts` (18 tables, all typed validators, 50+ indexes, 4 search indexes)
- Shared enum validators are in `convex/lib/validators.ts` — import from here, don't re-declare
- Auth adapter is in `convex/lib/auth.ts` — provider-agnostic, uses `tokenIdentifier` (NOT `subject`)
- Document lookup helpers are in `convex/lib/records.ts`
- Every multi-tenant query must filter by `churchId`
- Public queries return published-only for unauthenticated callers
- Mutations enforce church-scoped access via `requireChurchAccess`
- All list queries must use `.take(200)` — never `.collect()`
- Sensitive admin mutations must use `internalMutation`

## Auth adapter

The auth system is designed so swapping providers (Clerk, WorkOS, Auth0) requires
changes in exactly two files:
1. `convex/auth.config.ts` — OIDC issuer domain
2. `apps/app/src/lib/auth-provider.tsx` — React SDK + useAuth hook

No Convex function code needs to change when swapping providers.

## UI components

- shadcn/ui owned source in `apps/app/src/components/ui/`
- Product components in `apps/app/src/components/`
- App shell with sidebar navigation in `apps/app/src/components/app-shell.tsx`
- Brand tokens in `packages/brand/src/tokens.css`
- All styling via Tailwind CSS v4 utility classes
- Use `cn()` from `@/lib/cn` for class merging
- Church-scoped theming via `<ChurchTheme>` wrapper component
