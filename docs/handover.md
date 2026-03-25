# Fellowship42 Handover Document

Last updated: 2026-03-25

This document captures the current state of the Fellowship42 project, what
has been built, known gaps, and prioritized next steps. It is written for any
developer or AI agent that may continue the work.

---

## 1. What is Fellowship42?

A multi-tenant church management platform targeting U.S. Protestant/Evangelical
churches. One system for people, ministries, groups, courses, events, giving,
sermons, facilities, and public-facing church websites. See
`docs/fellowship42-product-plan.md` for the full product vision.

---

## 2. Current architecture

```
Cloudflare Pages ---- Vite React SPA (apps/app)    -- member portal / admin
                  `-- Astro site (apps/web)         -- marketing / public pages

Cloudflare Workers -- Hono edge API (apps/worker)   -- public church API, webhooks

Convex Cloud ------- Database, functions, auth, file storage, real-time subscriptions
```

See `docs/architecture.md` for diagrams, data flow, and deployment targets.

### Monorepo layout

```
fellowship42/
  packages/brand/       @fellowship42/brand -- shared design tokens, presets, CSS recipes
  convex/               Convex backend -- schema, server functions, auth adapter, validators
    lib/auth.ts         Provider-agnostic auth (supports Clerk, WorkOS, Auth0)
    lib/validators.ts   Shared enum validators used by schema + functions
    lib/records.ts      Document lookup and church-scope verification helpers
  apps/app/             @fellowship42/app -- Vite + React 19 SPA (Tailwind v4, shadcn/ui)
  apps/worker/          @fellowship42/worker -- Hono on Cloudflare Workers
  apps/web/             @fellowship42/web -- Astro 5 marketing site
  docs/                 Architecture, design system, product plan, this handover
```

---

## 3. What has been built

### Convex backend

| Area | Status | Details |
|------|--------|---------|
| Schema | **Complete** | 18 tables, all validators typed (literal unions for every enum), 50+ indexes, 4 search indexes |
| Auth adapter | **Complete** | `convex/lib/auth.ts` — provider-agnostic using `tokenIdentifier` (not `subject`). Supports Clerk, WorkOS, Auth0 with zero function-code changes. |
| Shared validators | **Complete** | `convex/lib/validators.ts` — all enum validators shared between schema and function args. Eliminates triple-maintenance. |
| Auth config | **Scaffolded** | `convex/auth.config.ts` — placeholder domain, documented swap instructions for Clerk/WorkOS/Auth0 |
| Church functions | **Complete** | `list`, `getBySlug`, `getPublishedById`, `getById`, `create`, `update`, `archive` |
| User functions | **Complete** | `syncFromAuth` (derives all identity from auth context — no client-supplied IDs), `getCurrent`, `updateRoles` (internalMutation), `assignChurch` (internalMutation) |
| People functions | **Complete** | `listByChurch`, `listByChurchForViewer`, `getById`, `create` (auto-computes `fullName`), `update` (auto-computes `fullName`), `archive` |
| Ministry functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update`, `archive` |
| Group functions | **Complete** | `listByChurch`, `listByMinistry`, `getBySlug`, `create`, `update`, `archive` |
| Course functions | **Complete** | `listByChurch`, `getBySlug`, `create` (initializes `lessonCount: 0`), `update`, `archive` |
| Lesson functions | **Complete** | `listByCourse`, `getById`, `create` (increments `courses.lessonCount`), `update`, `remove` (cascades completions, decrements counter), `reorder` |
| Event functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update`, `archive` |
| Sermon functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update`, `archive` |
| Group memberships | **Complete** | `listByGroup`, `listByPerson`, `join`, `updateStatus`, `remove` |
| Course enrollments | **Complete** | `listByCourse`, `listByPerson`, `enroll`, `remove` (cascades completions) |
| Lesson completions | **Complete** | `listByEnrollment`, `toggle` (upsert/delete, recalculates progress, auto-completes enrollment at 100%) |
| Contributions | **Complete** | `listByChurch` (finance-gated), `create` |
| Landing pages | **Complete** | `getByOwner`, `getBySlug`, `create`, `update`, `archive` — blocks now typed (10-variant discriminated union) |
| Group sessions | **Complete** | `listByGroup`, `getById`, `create`, `update`, `remove` (cascades attendance) |
| Attendance records | **Complete** | `listBySession`, `listByPerson`, `record` (upsert), `remove` |
| Facilities | **Complete** | `listByChurch`, `getById`, `create`, `update`, `decommission` |
| Media / file storage | **Complete** | `listByChurch`, `getUrl` (public), `create`, `remove` (deletes storage file) |

**Key patterns in every function file:**
- All list queries use `.take(200)` — no unbounded `.collect()` calls
- Public queries return published-only for unauthenticated callers
- Mutations enforce church-scoped access via `requireChurchAccess`
- Slug uniqueness is enforced within church scope on create/update
- Sensitive admin mutations (`updateRoles`, `assignChurch`) use `internalMutation`
- Content tables have `archive` soft-delete (sets `status: "archived"`)
- Join tables have `remove` hard-delete (with cascade where needed)
- Auth uses `tokenIdentifier` throughout — never `subject` or client-supplied IDs

**Schema changes from v1:**
- `lessons` extracted from `courses.lessons` embedded array → separate table + `lessonCount` denormalized counter
- `lessonCompletions` extracted from `courseEnrollments.completedLessons` array → separate table + `completedCount` counter
- `users.clerkId` → `tokenIdentifier` (provider-agnostic)
- `people` gained `fullName` field + search index
- `landingPages.blocks` typed with 10-variant discriminated union (was `v.any()`)
- `churches.theme` fields typed with literal unions (was `v.string()`)
- `media.storageId` typed as `v.id("_storage")` (was `v.string()`)
- `publishStatus` now includes `"archived"` third variant
- Search indexes added to people, groups, events, sermons

### Vite React SPA

| Area | Status | Details |
|------|--------|---------|
| Build tooling | **Complete** | Vite 6, React 19, TypeScript 5.7, PostCSS + Tailwind v4 |
| Auth provider | **Complete** | `lib/auth-provider.tsx` — provider-agnostic wrapper. Detects Clerk via env var, falls back to plain ConvexProvider in dev mode. Exports `useAuthState()`, `SignInButton`, `SignOutButton`. |
| App shell | **Complete** | `components/app-shell.tsx` — sticky header with logo + church name + user menu, collapsible sidebar with global and church-scoped navigation, mobile hamburger menu |
| CSS architecture | **Complete** | `globals.css` imports brand tokens via `@brand/tokens.css`, maps to Tailwind via `@theme inline`, base typography layer |
| UI primitives | **Complete** | Button (CVA, 6 variants, 4 sizes, asChild), Card suite, Badge (5 variants), Input, Separator |
| Product components | **Complete** | PageShell, Section, Hero (3 variants), CardGrid, ChurchTheme, Eyebrow, StatPanel |
| Route pages | **Live reads** | Dashboard, Churches, ChurchDetail, People, Groups, Courses, CourseDetail, Events — all read live Convex data. People is auth-aware. |
| Convex wiring | **Partial** | Read routes use `useQuery`; create/edit mutations and richer authenticated workflows are still missing |
| Forms | **Not yet** | Create/edit forms for churches, people, groups, etc. not built |

### Hono edge worker (266 lines)

| Area | Status | Details |
|------|--------|---------|
| App structure | **Complete** | Hono with CORS, logger, error handling middleware |
| Church API | **Complete (public reads)** | Routes for list, by-slug, ministries, groups, events, sermons |
| Webhooks | **Explicitly disabled** | Return `501` until signature verification implemented |
| Convex HTTP client | **Complete** | `lib/convex.ts` with `convexQuery()` and `convexMutation()` helpers |

### Brand package (418 lines)

| Area | Status | Details |
|------|--------|---------|
| CSS tokens | **Complete** | `tokens.css` — all shadcn semantic variables, extended F42 tokens, typography stacks |
| Presets | **Complete** | 7 brand presets (warm, calm, bold, classic, modern, forest, royal) |
| `resolveTheme()` | **Complete** | Merges church overrides onto preset base |
| `themeToCSS()` | **Complete** | Converts resolved theme to CSS custom property overrides |
| CSS recipes | **Complete** | Framework-free `.f42-*` utility classes |

---

## 4. Known issues and technical debt

1. **Generated Convex artifacts are stale.** The schema was rewritten but `convex/_generated/` has not been regenerated. Run `npx convex dev` to regenerate.

2. **The SPA is still read-only.** Routes read live data but no create/edit/delete forms exist.

3. **Webhook verification is incomplete.** Clerk and Stripe endpoints return `501`.

4. **`users.churchIds` is still an array on the user document.** A `churchMemberships` join table would scale better for "which users belong to this church" queries. This is documented tech debt, not blocking.

5. **Hono worker path alias `@/lib/convex`** may not resolve at wrangler build time without explicit esbuild alias config.

6. **No Clerk/WorkOS credentials configured.** The auth adapter is wired but needs real provider credentials to function. The SPA falls back gracefully to unauthenticated mode.

7. **No pagination.** List queries use `.take(200)` which is safe but not paginated. For large churches (5,000+ people), proper Convex pagination should be added.

---

## 5. Prioritized next steps

### Tier 1: Make it run

- [ ] **Run `npx convex dev`** to regenerate `_generated/` types against the new 18-table schema
- [ ] **Choose auth provider** (Clerk or WorkOS) and create an application
- [ ] **Set env vars**: `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY` (or WorkOS equivalent), update `convex/auth.config.ts` domain
- [ ] **Install auth SDK**: `npm install @clerk/clerk-react` in `apps/app/` (or `@workos-inc/authkit-react`)
- [ ] **Verify dev servers** start: `pnpm dev` (SPA), `pnpm dev:worker` (Hono), `pnpm dev:web` (Astro)
- [ ] **Test auth flow**: sign in → user record created → protected routes unlock

### Tier 2: Build the write layer

- [ ] **Create/edit forms** — Church, People, Group, Course, Event, Sermon, Facility
- [ ] **Seed data function** — Convex function that populates a demo church with sample records
- [ ] **Church selector** — if user belongs to multiple churches, add a selector in the sidebar
- [ ] **Error boundaries** — React error boundaries around route components
- [ ] **Loading states** — skeleton/spinner states for Convex query loading
- [ ] **Fix Hono worker path alias** — add esbuild alias or use relative imports

### Tier 3: Close feature gaps

- [ ] **Implement Clerk/WorkOS webhook handling** in the Hono worker
- [ ] **Implement Stripe webhook handling** for contributions
- [ ] **Build member self-service portal** — profile, giving history, course progress
- [ ] **Landing page rendering** — rebuild the 10-block-type renderer with the new typed blocks
- [ ] **Pagination** — Convex `.paginate()` for people, contributions, attendance
- [ ] **Search** — wire up the search indexes for people, groups, events in the SPA

### Tier 4: Production readiness

- [ ] **Tests** — Convex function tests, component tests
- [ ] **CI/CD** — GitHub Actions for typecheck, build, deploy
- [ ] **File uploads** — wire Convex storage API for media in the SPA
- [ ] **Public church websites** via Hono worker or Astro SSR
- [ ] **Scheduled jobs** — giving statements, attendance reminders
- [ ] **Dark mode** — extend token system with dark variant

---

## 6. Key file reference

| File | Why it matters |
|------|---------------|
| `convex/schema.ts` | Single source of truth for the data model. 18 tables, typed validators, 50+ indexes, 4 search indexes. |
| `convex/lib/auth.ts` | Provider-agnostic auth adapter. Uses `tokenIdentifier`. Every mutation and query goes through these helpers. |
| `convex/lib/validators.ts` | Shared enum validators. Schema and function args both import from here. |
| `convex/lib/records.ts` | `requireDocument` and `requireChurchScopedDocument` — used by mutations to verify cross-references. |
| `convex/auth.config.ts` | OIDC provider config. Change `domain` to swap auth providers. |
| `apps/app/src/lib/auth-provider.tsx` | SPA auth abstraction. The only file that imports from `@clerk/*`. Swap here to change providers. |
| `apps/app/src/components/app-shell.tsx` | Persistent navigation shell. Header + sidebar + church-scoped nav. |
| `packages/brand/src/presets.ts` | The 7 brand presets, `resolveTheme()`, and `themeToCSS()`. |
| `packages/brand/src/tokens.css` | All CSS custom properties. The shadcn variable contract. |
| `apps/app/src/globals.css` | Bridge between CSS variables and Tailwind utilities via `@theme inline`. |

---

## 7. Auth adapter design

The auth system is designed so swapping providers requires changes in exactly **two files**:

1. **`convex/auth.config.ts`** — Change the `domain` to point at the new provider's OIDC issuer
2. **`apps/app/src/lib/auth-provider.tsx`** — Swap the React SDK import and `useAuth` hook

No Convex function code changes. The `tokenIdentifier` field (which includes the issuer URL) is the canonical identity key throughout the backend.

### Provider quick-reference

| Provider | `auth.config.ts` domain | SPA package | SPA env var |
|----------|------------------------|-------------|-------------|
| Clerk | `https://<app>.clerk.accounts.dev` | `@clerk/clerk-react` | `VITE_CLERK_PUBLISHABLE_KEY` |
| WorkOS | `https://api.workos.com` | `@workos-inc/authkit-react` | `VITE_WORKOS_CLIENT_ID` |
| Auth0 | `https://<tenant>.auth0.com` | `@auth0/auth0-react` | `VITE_AUTH0_DOMAIN` + `VITE_AUTH0_CLIENT_ID` |

---

## 8. Environment variables

See `.env.example` at the repository root.

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `VITE_CONVEX_URL` | Vite SPA + Hono worker | Printed by `npx convex dev` on first run |
| `VITE_CLERK_PUBLISHABLE_KEY` | Vite SPA (if using Clerk) | Clerk dashboard > API Keys |
| `CLERK_WEBHOOK_SECRET` | Hono worker | Clerk dashboard > Webhooks |
| `STRIPE_WEBHOOK_SECRET` | Hono worker (optional) | Stripe dashboard > Webhooks |

---

## 9. Development commands

```bash
# Install dependencies
pnpm install

# Start Convex dev server (regenerates types, run in dedicated terminal)
npx convex dev

# Start Vite React SPA (port 5173)
pnpm dev

# Start Hono edge worker (port 8787)
pnpm dev:worker

# Start Astro marketing site (port 4321)
pnpm dev:web

# Type-check all workspaces
pnpm typecheck
```
