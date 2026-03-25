# Fellowship42 Handover Document

Last updated: 2026-03-24

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

The project underwent a full architectural refactor from Next.js + Payload CMS
+ PostgreSQL to a new stack designed for real-time, edge-first delivery:

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
  convex/               Convex backend -- schema, server functions, access control, auth
  apps/app/             @fellowship42/app -- Vite + React 19 SPA (Tailwind v4, shadcn/ui)
  apps/worker/          @fellowship42/worker -- Hono on Cloudflare Workers
  apps/web/             @fellowship42/web -- Astro 5 marketing site
  docs/                 Architecture, design system, product plan, this handover
```

Workspace manager: **pnpm workspaces** (`pnpm-workspace.yaml` includes `packages/*` and `apps/*`).

---

## 3. What has been built

### Convex backend (2,224 lines)

| Area | Status | Details |
|------|--------|---------|
| Schema | **Complete** | 16 tables, all validators typed (union literals for enums, nested objects for addresses/themes/lessons), 40+ indexes |
| Access control | **Complete** | `convex/lib/access.ts` with `requireAuth`, `getCurrentUser`, `requireUser`, `requireRole`, `requireChurchAccess`, `hasChurchAccess`, `isSuperAdmin`, `canManageChurch` |
| Auth config | **Scaffolded** | `convex/auth.config.ts` wired for Clerk JWT validation (needs real Clerk credentials) |
| Church functions | **Complete** | `list`, `getBySlug`, `getPublishedById`, `getById`, `create`, `update` |
| User functions | **Complete** | `getOrCreateFromClerk`, `getCurrent`, `updateRoles` |
| People functions | **Complete** | `listByChurch`, `listByChurchForViewer`, `getById`, `create`, `update` |
| Ministry functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update` |
| Group functions | **Complete** | `listByChurch`, `listByMinistry`, `getBySlug`, `create`, `update` |
| Course functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update` |
| Event functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update` |
| Sermon functions | **Complete** | `listByChurch`, `getBySlug`, `create`, `update` |
| Group memberships | **Complete** | `listByGroup`, `listByPerson`, `join`, `updateStatus` |
| Course enrollments | **Complete** | `listByCourse`, `listByPerson`, `enroll`, `toggleLessonCompletion` (auto-recalculates progress) |
| Contributions | **Complete** | `listByChurch` (finance-gated), `create` |
| Landing pages | **Complete** | `getByOwner`, `getBySlug`, `create`, `update` |
| Group sessions | **Not yet** | Schema exists; no query/mutation functions written |
| Attendance records | **Not yet** | Schema exists; no query/mutation functions written |
| Facilities | **Not yet** | Schema exists; no query/mutation functions written |
| Media / file storage | **Not yet** | Schema exists; Convex file upload functions not written |

**Key patterns in every function file:**
- Public queries (listings, slug lookups) return published-only content for unauthenticated callers; authenticated users with church access see drafts too
- Mutations enforce church-scoped access via `requireChurchAccess`
- Slug uniqueness is enforced within church scope on create/update
- Update mutations accept partial fields and build a patch object

**Note on imports:** Functions import from `./_generated/server`, and the generated Convex artifacts are checked into version control for local type safety and editor support.

### Vite React SPA (1,264 lines)

| Area | Status | Details |
|------|--------|---------|
| Build tooling | **Complete** | Vite 6, React 19, TypeScript 5.7, PostCSS + Tailwind v4 |
| Entry point | **Complete** | `ConvexProvider` + `BrowserRouter` wired in `main.tsx` |
| CSS architecture | **Complete** | `globals.css` imports brand tokens via `@brand/tokens.css`, maps to Tailwind via `@theme inline`, base typography layer |
| UI primitives | **Complete** | Button (CVA, 6 variants, 4 sizes, asChild), Card suite, Badge (5 variants), Input, Separator -- all ported exactly from the Phase 2 work |
| Product components | **Complete** | PageShell, Section, Hero (3 variants), CardGrid, ChurchTheme, Eyebrow, StatPanel |
| Theme system | **Complete** | `lib/theme.ts` re-exports from `@fellowship42/brand` + provides `themeToCSS()` with `CSSProperties` return type |
| Route pages | **Live read flows** | Dashboard, Churches, ChurchDetail, Groups, Courses, CourseDetail, and Events now read live Convex data; People is auth-aware and protected; NotFound remains static |
| Convex wiring | **Partial** | Read routes use `useQuery`; create/edit mutations and richer authenticated workflows are still missing |
| Auth (Clerk) | **Not yet** | No Clerk provider or sign-in/sign-out flows in the SPA |
| Forms | **Not yet** | Create/edit forms for churches, people, groups, etc. not built |

### Hono edge worker (266 lines)

| Area | Status | Details |
|------|--------|---------|
| App structure | **Complete** | Hono with CORS, logger, error handling middleware |
| Church API | **Complete (public reads)** | Routes for list, by-slug, ministries, groups, events, sermons now read live data from Convex |
| Webhooks | **Explicitly disabled** | Clerk and Stripe webhook endpoints return `501` until signature verification and persistence are implemented |
| Health check | **Complete** | `GET /` and `GET /health` |
| Convex HTTP client | **Complete** | `lib/convex.ts` with `convexQuery()` and `convexMutation()` helpers |
| Live data | **Partial** | Public church read routes are wired; webhook flows and richer public APIs remain |
| Wrangler config | **Complete** | `wrangler.toml` with `nodejs_compat` flag and `CONVEX_URL` binding |

### Brand package (418 lines)

| Area | Status | Details |
|------|--------|---------|
| CSS tokens | **Complete** | `tokens.css` -- all shadcn semantic variables, extended F42 tokens, typography stacks, church-scoped variables |
| Presets | **Complete** | 7 brand presets (warm, calm, bold, classic, modern, forest, royal) with full visual personality |
| `resolveTheme()` | **Complete** | Merges church overrides onto preset base |
| `themeToCSS()` | **Complete** | Converts resolved theme to CSS custom property overrides that remap shadcn semantic variables |
| CSS recipes | **Complete** | Framework-free patterns: `.f42-glass-card`, `.f42-hero-surface`, `.f42-eyebrow`, `.f42-button`, `.f42-card-grid`, `.f42-section` |
| Package exports | **Complete** | Barrel export via `index.ts`; CSS files exported via `package.json` exports map |

### Astro marketing site

| Area | Status | Details |
|------|--------|---------|
| Config | **Complete** | Astro 5 with React integration, static output |
| Styles | **Updated** | `global.css` now imports from `@fellowship42/brand` package (was previously inlined copies) |
| Pages | **Minimal** | `index.astro` homepage exists with Hero and FeatureCard components |
| Content | **Not yet** | Needs real marketing copy, pricing, features, etc. |

### Documentation

| Document | Status |
|----------|--------|
| `docs/architecture.md` | **Complete** -- stack diagram, data flow, auth flow, dev commands, deployment targets |
| `docs/ui-design-system.md` | **Complete** -- updated for new stack, component reference, 7 presets, token system, Convex data model, file structure |
| `docs/fellowship42-product-plan.md` | **Complete** -- updated for the active Convex + Hono + Vite React + Astro direction. |
| `docs/handover.md` | This document |

---

## 4. Known issues and technical debt

### Current setup notes

1. **`pnpm install`, `pnpm typecheck`, and `pnpm build` pass** in the current workspace state.

2. **Generated Convex artifacts are checked in.** This keeps local typechecking green without requiring codegen on every clone.

3. **`pnpm codegen:convex` now succeeds** against the linked deployment and refreshes the checked-in generated bindings.

4. **A baseline CI workflow now exists.** `.github/workflows/ci.yml` runs install, typecheck, and build on pushes and pull requests.

### Code-level issues to be aware of

4. **The SPA is still mostly read-only.** Major app routes now read live Convex data, but Clerk auth, write flows, and a persistent signed-in shell are still missing.

5. **Protected directory access depends on Clerk wiring.** The People route is auth-aware and ready for church-scoped reads, but it intentionally stays locked until Clerk is configured.

6. **Missing backend domains remain.** `groupSessions`, `attendanceRecords`, `facilities`, and media/file upload flows still need function coverage.

7. **Webhook verification is still incomplete.** Clerk and Stripe endpoints are now explicitly disabled with `501` responses until signatures and persistence are implemented.

8. **Legacy feature gaps are documented, not implemented.** See `docs/reference/legacy-payload-feature-audit.md` for the public-site, landing-page, member-portal, and leader-dashboard behaviors removed with the old app.

---

## 5. Prioritized next steps

### Tier 1: Make it run (infrastructure)

- [ ] **Replace the placeholder Clerk issuer domain in `convex/auth.config.ts`** before enabling real auth
- [ ] **Run `pnpm dev:convex`** against the linked project and confirm schema/codegen stay in sync
- [ ] **Set up Clerk** -- create a Clerk application, replace the issuer domain in `convex/auth.config.ts`, install `@clerk/clerk-react` in the SPA
- [ ] **Wire ConvexProvider with Clerk** -- wrap the SPA's `ConvexProvider` in a `ClerkProvider` and use `ConvexProviderWithClerk` from `convex/react-clerk`
- [ ] **Verify `pnpm dev`** starts the Vite SPA and renders the dashboard route
- [ ] **Verify `pnpm dev:worker`** starts the Hono worker on port 8787
- [ ] **Verify `pnpm dev:web`** starts the Astro site on port 4321

### Tier 2: Connect live data (core feature loop)

- [ ] **Finish SPA auth wiring** -- install Clerk in the app, use `ConvexProviderWithClerk`, and unlock protected route states
- [ ] **Turn read routes into real workflows** -- add create/edit/delete mutations and mutation-aware empty/error states
- [ ] **Upgrade church detail metrics** -- replace list-length stats with dedicated aggregate queries for people, groups, courses, and events
- [ ] **Deepen list routes** -- add filters, pagination, and richer church-scoped metadata where needed
- [ ] **Build create/edit forms** -- start with Church create form, then People, Groups, Courses, Events
- [ ] **Add sign-in/sign-out flows** -- Clerk `<SignInButton>` and `<UserButton>` components in the SPA header
- [ ] **Build a persistent app shell** -- sidebar or top nav with church selector, section links, user menu

### Tier 3: Close the feature gaps

- [ ] **Write missing Convex functions** for `groupSessions`, `attendanceRecords`, `facilities`, and `media` (file upload)
- [ ] **Rebuild landing-page rendering and editing** using `docs/reference/legacy-payload-feature-audit.md` as the source of truth for missing behavior
- [ ] **Expand the Hono worker beyond church read routes** with richer public APIs, error handling, and cache strategy where needed
- [ ] **Implement Clerk webhook handling** in the Hono worker -- verify signatures and provision users from trusted Clerk events
- [ ] **Implement Stripe webhook handling** -- verify signatures, record contributions via `contributions.create`
- [ ] **Build the member self-service portal** -- profile, giving history, course progress, group participation

### Tier 4: Production readiness

- [ ] **Seed data script** -- create a Convex seed function that populates a demo church with sample people, groups, courses, events, sermons
- [ ] **Error boundaries** -- add React error boundaries around route components
- [ ] **Loading states** -- add skeleton/spinner states for Convex query loading
- [ ] **Pagination** -- Convex `.paginate()` for large collections (people, contributions)
- [ ] **Search** -- Convex full-text search indexes for people, groups, events
- [ ] **File uploads** -- Convex storage API for media (church hero images, sermon audio, lesson resources)
- [ ] **Tests** -- unit tests for Convex functions (Convex has a test harness), component tests for shadcn/ui
- [ ] **Expand CI/CD** -- extend the new GitHub Actions baseline beyond typecheck/build into test and deployment workflows

### Tier 5: Stretch

- [ ] **Public church websites** via the Hono worker -- SSR or static generation of church homepages, ministry landing pages
- [ ] **Scheduled jobs** -- Convex cron functions for giving statement generation, attendance reminders, follow-up workflows
- [ ] **Real-time features** -- live attendance check-in, real-time group session participation
- [ ] **Dark mode** -- extend the token system with a dark variant layer
- [ ] **Mobile app** -- React Native sharing the Convex hooks and brand tokens
- [ ] **Additional brand presets** -- the system is designed for easy addition (documented in `docs/ui-design-system.md`)

---

## 6. Key file reference

When working on the codebase, these are the most important files to understand:

| File | Why it matters |
|------|---------------|
| `convex/schema.ts` | Single source of truth for the entire data model. 16 tables, all validators, all indexes. |
| `convex/lib/access.ts` | Every mutation and most queries go through these helpers. Understand the role/church scoping model. |
| `packages/brand/src/presets.ts` | The 7 brand presets, `resolveTheme()`, and `themeToCSS()`. This is the theming engine. |
| `packages/brand/src/tokens.css` | All CSS custom properties. The shadcn variable contract that makes everything work. |
| `apps/app/src/globals.css` | The bridge between CSS variables and Tailwind utilities via `@theme inline`. |
| `apps/app/src/components/ui/button.tsx` | The most complex UI primitive. CVA variants, gradient default, asChild via Radix Slot. |
| `apps/app/src/components/hero.tsx` | Shows the `color-mix()` inline style pattern for church-scoped gradients. |
| `apps/app/src/components/church-theme.tsx` | The component that makes per-church theming work. Wraps children with CSS variable overrides. |
| `apps/app/src/App.tsx` | All route definitions in one place. |
| `apps/worker/src/index.ts` | Hono app entry point. Middleware stack, route mounting, error handling. |

### Legacy audit

The retired Payload implementation has been removed from the repository.
Feature gaps discovered during that cleanup are documented in:

- `docs/reference/legacy-payload-feature-audit.md`

---

## 7. Development commands

```bash
# Install dependencies (run first!)
pnpm install

# Start Convex dev server (run in a dedicated terminal)
pnpm dev:convex

# Start Vite React SPA (port 5173)
pnpm dev

# Start Hono edge worker (port 8787)
pnpm dev:worker

# Start Astro marketing site (port 4321)
pnpm dev:web

# Type-check all workspaces
pnpm typecheck

# Deploy Hono worker to Cloudflare
pnpm deploy:worker
```

---

## 8. Environment variables

See `.env.example` at the repository root. Minimum needed to start:

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `VITE_CONVEX_URL` | Vite SPA | Printed by `pnpm dev:convex` on first run |
| `CLERK_WEBHOOK_SECRET` | Hono worker | Clerk dashboard > Webhooks |

Stripe variables are optional until contribution/giving features are wired.
