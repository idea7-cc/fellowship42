# Fellowship42 Private Beta Status

## Purpose
This document records the current implementation state of the active monorepo,
what is already in place, and what still blocks a credible private beta.

Update this file whenever a meaningful beta milestone lands.

## Current State
As of `2026-03-24`, the repo has an active monorepo with:
- `convex/` for the backend schema and server functions
- `apps/app/` for the church app
- `apps/web/` for the public web surface
- `apps/worker/` for edge routes and webhooks
- `packages/brand/` for shared theming and visual tokens

## Implemented
### Platform shape
- active pnpm workspace monorepo
- Convex backend files committed
- Vite React app committed with live Convex read routes
- Astro web surface committed
- Hono worker committed with live public church reads
- shared brand package committed
- GitHub Actions baseline committed for typecheck and build

### Backend foundation
- 16-table Convex schema committed
- church-scoped access helpers committed
- function files for churches, users, people, ministries, groups, courses,
  events, sermons, landing pages, group memberships, course enrollments, and
  contributions committed

### UI foundation
- shared token system and 7 church presets committed
- owned shadcn/ui primitives committed in the app workspace
- core product components committed
- dashboard, church, group, course, and event routes wired to live Convex reads
- people route is auth-aware but still blocked on Clerk wiring

### Documentation foundation
- architecture documentation is current
- UI design system documentation is current
- product plan is now aligned to the active stack

## Not Yet Completed
### Local environment
- `pnpm install` completes successfully from the current workspace state
- `pnpm dev:convex` has not yet been run in this repo state
- generated Convex types are committed

### Auth
- Clerk is not wired through the SPA yet
- user provisioning and authenticated session flows are not complete end to end

### Live data
- SPA routes now have live Convex read coverage for the major browse surfaces
- protected app flows still need Clerk and mutation wiring
- worker church routes now read live data from Convex
- webhook routes are explicitly disabled until verification is implemented

### Missing backend coverage
- group session functions
- attendance record functions
- facilities functions
- media and file upload flows

### Product depth
- create and edit forms across the main entities remain incomplete
- public publishing workflows need more depth
- webhook verification and operational hardening remain incomplete

## Current Beta Blockers
- no verified end-to-end auth loop
- no end-to-end auth path
- no end-to-end live app workflow for a church admin
- no seeded demo or pilot church validation path
- no production-grade webhook or observability setup

## Recommended Next Order
1. finish Clerk and Convex auth setup for the linked deployment
2. wire Clerk auth through the app and backend
3. connect the SPA screens to live Convex data
4. expand worker routes and public church pages beyond the current read paths
5. fill in the missing backend domains required for the first pilot church
6. build the create and edit flows needed for the pilot church workflow

## Legacy Note
The earlier Next.js + Payload implementation has been removed from the repo.
Feature gaps discovered during that cleanup are captured in
`docs/reference/legacy-payload-feature-audit.md`.
