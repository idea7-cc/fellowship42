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
  fellowship42-app/     [LEGACY] Old Next.js + Payload app -- still present, excluded from workspaces
  docs/                 Architecture, design system, product plan, this handover
```

Workspace manager: **npm workspaces** (root `package.json` lists `packages/*` and `apps/*`).

---

## 3. What has been built

### Convex backend (2,224 lines)

| Area | Status | Details |
|------|--------|---------|
| Schema | **Complete** | 16 tables, all validators typed (union literals for enums, nested objects for addresses/themes/lessons), 40+ indexes |
| Access control | **Complete** | `convex/lib/access.ts` with `requireAuth`, `requireUser`, `requireRole`, `requireChurchAccess`, `isSuperAdmin`, `canManageChurch` |
| Auth config | **Scaffolded** | `convex/auth.config.ts` wired for Clerk JWT validation (needs real Clerk credentials) |
| Church functions | **Complete** | `list`, `getBySlug`, `getById`, `create`, `update` |
| User functions | **Complete** | `getOrCreateFromClerk`, `getCurrent`, `updateRoles` |
| People functions | **Complete** | `listByChurch`, `getById`, `create`, `update` |
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

**Note on imports:** Functions import `query`/`mutation` from `"convex/server"` (generic types). Once `npx convex dev` is run, the `convex/_generated/` directory will be created with schema-aware typed exports. You can optionally switch imports to `./_generated/server` for stricter typing at that point.

### Vite React SPA (1,264 lines)

| Area | Status | Details |
|------|--------|---------|
| Build tooling | **Complete** | Vite 6, React 19, TypeScript 5.7, PostCSS + Tailwind v4 |
| Entry point | **Complete** | `ConvexProvider` + `BrowserRouter` wired in `main.tsx` |
| CSS architecture | **Complete** | `globals.css` imports brand tokens via `@brand/tokens.css`, maps to Tailwind via `@theme inline`, base typography layer |
| UI primitives | **Complete** | Button (CVA, 6 variants, 4 sizes, asChild), Card suite, Badge (5 variants), Input, Separator -- all ported exactly from the Phase 2 work |
| Product components | **Complete** | PageShell, Section, Hero (3 variants), CardGrid, ChurchTheme, Eyebrow, StatPanel |
| Theme system | **Complete** | `lib/theme.ts` re-exports from `@fellowship42/brand` + provides `themeToCSS()` with `CSSProperties` return type |
| Route pages | **Scaffolded** | 9 routes with placeholder content: Dashboard, Churches, ChurchDetail, People, Groups, Courses, CourseDetail, Events, NotFound |
| Convex wiring | **Not yet** | Route pages have `TODO` comments showing which `useQuery`/`useMutation` calls to add. No live data yet. |
| Auth (Clerk) | **Not yet** | No Clerk provider or sign-in/sign-out flows in the SPA |
| Forms | **Not yet** | Create/edit forms for churches, people, groups, etc. not built |

### Hono edge worker (266 lines)

| Area | Status | Details |
|------|--------|---------|
| App structure | **Complete** | Hono with CORS, logger, error handling middleware |
| Church API | **Scaffolded** | Routes for list, by-slug, ministries, groups, events, sermons -- return placeholder data |
| Webhooks | **Scaffolded** | Clerk and Stripe webhook endpoints (signature verification not implemented) |
| Health check | **Complete** | `GET /` and `GET /health` |
| Convex HTTP client | **Complete** | `lib/convex.ts` with `convexQuery()` and `convexMutation()` helpers |
| Live data | **Not yet** | Church routes need to call Convex HTTP API using the helpers |
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
| `docs/fellowship42-product-plan.md` | **Outdated** -- still references Payload + Postgres as the recommended stack. Content/feature vision is still valid. |
| `docs/handover.md` | This document |

---

## 4. Known issues and technical debt

### Must fix before first `npm run dev`

1. **`npm install` has not been run** on the new workspace configuration. The root `package.json` was updated but `node_modules` were not refreshed. Run `npm install` from the root first.

2. **Convex project not initialized.** `npx convex dev` has never been run. This will:
   - Create the `convex/_generated/` directory with typed function builders
   - Prompt you to create a Convex project (free tier available)
   - Push the schema to Convex Cloud
   - Start the dev sync process

3. **No `.env` file exists.** Copy `.env.example` to `.env` and fill in at minimum `VITE_CONVEX_URL` (Convex will print this during init).

### Code-level issues to be aware of

4. **Convex function imports use generic types.** All function files import `query`/`mutation` from `"convex/server"` rather than `./_generated/server`. This works but provides loose typing. After running `npx convex dev`, consider switching to the generated imports for full schema-aware IntelliSense.

5. **`convex/lib/access.ts` imports from `../_generated/dataModel`.** This file will not exist until Convex codegen runs. TypeScript will show errors in this file (and only this file) until then. Not a runtime issue -- Convex bundles functions server-side.

6. **`landingPages.ts` uses `as any` casts** in the `getByOwner` function for owner ID types. This is a pragmatic workaround since the owner ID could be for different tables. Once `_generated` types are available, this could be refined.

7. **Product plan document is stale.** `docs/fellowship42-product-plan.md` still recommends Payload + Postgres. The architectural direction has shifted to Convex + Hono + Vite. The feature list and market analysis are still valid, but the tech stack recommendations should be considered superseded by `docs/architecture.md`.

8. **Legacy `fellowship42-app/` directory.** The old Next.js + Payload CMS app is still present on disk but excluded from the npm workspace config. It contains useful reference code (especially `LandingPageRenderer.tsx` at 601 lines and the portal action flows) but is not part of the active build.

---

## 5. Prioritized next steps

### Tier 1: Make it run (infrastructure)

- [ ] **Run `npm install`** at the repository root to wire up workspaces
- [ ] **Run `npx convex dev`** to initialize the Convex project, push schema, and generate types
- [ ] **Set up Clerk** -- create a Clerk application, add the JWT issuer domain to `convex/auth.config.ts`, install `@clerk/clerk-react` in the SPA
- [ ] **Wire ConvexProvider with Clerk** -- wrap the SPA's `ConvexProvider` in a `ClerkProvider` and use `ConvexProviderWithClerk` from `convex/react-clerk`
- [ ] **Verify `npm run dev`** starts the Vite SPA and renders the dashboard route
- [ ] **Verify `npm run dev:worker`** starts the Hono worker on port 8787
- [ ] **Verify `npm run dev:web`** starts the Astro site on port 4321

### Tier 2: Connect live data (core feature loop)

- [ ] **Wire dashboard to Convex** -- use `useQuery(api.churches.list)` on the dashboard to show the user's churches
- [ ] **Wire church detail page** -- load church by ID, display real stats (people count, group count, event count)
- [ ] **Wire people page** -- `useQuery(api.people.listByChurch, { churchId })` with real card rendering
- [ ] **Wire groups page** -- same pattern, plus membership counts
- [ ] **Wire courses page** -- same pattern, plus enrollment status
- [ ] **Wire events page** -- same pattern, sorted by start date
- [ ] **Build create/edit forms** -- start with Church create form, then People, Groups, Courses, Events
- [ ] **Add sign-in/sign-out flows** -- Clerk `<SignInButton>` and `<UserButton>` components in the SPA header
- [ ] **Build a persistent app shell** -- sidebar or top nav with church selector, section links, user menu

### Tier 3: Close the feature gaps

- [ ] **Write missing Convex functions** for `groupSessions`, `attendanceRecords`, `facilities`, and `media` (file upload)
- [ ] **Port `LandingPageRenderer`** from the legacy app -- it's 601 lines with 10 block types and is the most complex UI component. Reference: `fellowship42-app/src/components/LandingPageRenderer.tsx`
- [ ] **Wire the Hono worker to Convex** -- replace placeholder responses in church API routes with real Convex HTTP API calls using `lib/convex.ts`
- [ ] **Implement Clerk webhook handling** in the Hono worker -- verify signatures, call `users.getOrCreateFromClerk` on `user.created` events
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
- [ ] **CI/CD** -- GitHub Actions for typecheck, lint, test, and Cloudflare Pages deploy
- [ ] **Update `docs/fellowship42-product-plan.md`** to reflect the new tech stack

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

### Legacy reference files (in `fellowship42-app/`)

| File | What to reference |
|------|-------------------|
| `src/components/LandingPageRenderer.tsx` | 601-line component with 10 block types. Port this to the SPA when landing page editing is needed. |
| `src/lib/landing-pages.ts` | Complex data resolution logic for landing pages (block enrichment, feed resolution, leader lookup). Port the patterns to Convex functions. |
| `src/collections/*.ts` | All 16 Payload collection definitions. Useful for cross-referencing field validations against the Convex schema. |
| `src/access/helpers.ts` | Original access control patterns. The Convex `lib/access.ts` is a simplified port of these. |

---

## 7. Development commands

```bash
# Install dependencies (run first!)
npm install

# Start Convex dev server (run in a dedicated terminal)
npm run dev:convex

# Start Vite React SPA (port 5173)
npm run dev

# Start Hono edge worker (port 8787)
npm run dev:worker

# Start Astro marketing site (port 4321)
npm run dev:web

# Type-check all workspaces
npm run typecheck

# Deploy Hono worker to Cloudflare
npm run deploy:worker
```

---

## 8. Environment variables

See `.env.example` at the repository root. Minimum needed to start:

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `VITE_CONVEX_URL` | Vite SPA | Printed by `npx convex dev` on first run |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex auth | Clerk dashboard > JWT Templates |
| `CLERK_WEBHOOK_SECRET` | Hono worker | Clerk dashboard > Webhooks |

Stripe variables are optional until contribution/giving features are wired.
