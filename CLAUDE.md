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
- The schema is in `convex/schema.ts` (16 tables, all typed validators, 40+ indexes)
- Access control helpers are in `convex/lib/access.ts`
- Every multi-tenant query must filter by `churchId`
- Public queries return published-only for unauthenticated callers
- Mutations enforce church-scoped access via `requireChurchAccess`

## UI components

- shadcn/ui owned source in `apps/app/src/components/ui/`
- Product components in `apps/app/src/components/`
- Brand tokens in `packages/brand/src/tokens.css`
- All styling via Tailwind CSS v4 utility classes
- Use `cn()` from `@/lib/cn` for class merging
- Church-scoped theming via `<ChurchTheme>` wrapper component
