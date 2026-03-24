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
- active npm workspace monorepo
- Convex backend files committed
- Vite React app scaffold committed
- Astro web surface committed
- Hono worker scaffold committed
- shared brand package committed

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
- route scaffolds committed for major app surfaces

### Documentation foundation
- architecture documentation is current
- UI design system documentation is current
- product plan is now aligned to the active stack

## Not Yet Completed
### Local environment
- `npm install` has not yet been validated in this rewritten workspace state
- `npx convex dev` has not yet been run in this repo state
- generated Convex types are therefore not yet committed

### Auth
- Clerk is not wired through the SPA yet
- user provisioning and authenticated session flows are not complete end to end

### Live data
- SPA routes still need live Convex wiring
- worker routes still return placeholder data in key places

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
- no verified local install and type generation loop
- no end-to-end auth path
- no end-to-end live app workflow for a church admin
- no seeded demo or pilot church validation path
- no production-grade webhook or observability setup

## Recommended Next Order
1. run the local install and Convex initialization loop
2. wire Clerk auth through the app and backend
3. connect the SPA screens to live Convex data
4. connect worker routes to real backend calls
5. fill in the missing backend domains required for the first pilot church
6. build the create and edit flows needed for the pilot church workflow

## Legacy Note
The `fellowship42-app/` directory remains in the repo as a legacy reference from
the earlier Next.js and Payload implementation. It should be treated as source
material for patterns and components, not as the active product runtime.