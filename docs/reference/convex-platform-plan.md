# Fellowship42 Convex Platform Plan

## Summary
Fellowship42 should be treated as a multi-surface platform built on one shared
backend model: `Convex`.

The active surfaces in this repository are:
- `apps/app` for church operations and member-facing application flows
- `apps/web` for Fellowship42 marketing and public church content
- `apps/worker` for edge APIs, webhooks, and server-side integration paths

This plan replaces the older Payload-centered framing and reflects the current
local codebase.

## Architectural Decision
### Decision
Adopt a `Convex-first` architecture with narrow edge APIs and distinct frontend
surfaces rather than a single CMS-style application.

### Why this is the right fit
Fellowship42 is not only a publishing product. It is also:
- an operations platform
- a church-scoped member and ministry system
- a public website delivery platform
- a future automation and integration surface

That shape benefits more from:
- one primary data model
- one auth boundary
- one set of multi-tenant access rules
- one real-time substrate

than from centering the stack around a single admin framework.

## Active Stack
- Backend: `Convex Cloud`
- Edge API: `Hono` on `Cloudflare Workers`
- App UI: `Vite + React 19`
- Public web: `Astro 5`
- Shared design system: `@fellowship42/brand`
- Auth target: `Clerk`
- Payments target: `Stripe`

## Surface Responsibilities
### App surface
The app surface should own:
- authenticated dashboards
- CRUD flows for church operations
- finance-gated and leader-gated views
- church-scoped theming and landing page management
- member-facing participation and profile flows

### Web surface
The web surface should own:
- Fellowship42 marketing pages
- public church presentation pages
- SEO-sensitive content
- lightweight interactive islands only where justified

### Worker surface
The worker should own:
- public API endpoints
- webhook verification and ingestion
- server-side integration calls
- optional caching and rate limiting layers

## Backend Ownership
Convex should remain the primary system of record for:
- churches
- users and church access
- people
- ministries
- groups and memberships
- sessions and attendance
- courses and enrollments
- events
- sermons
- facilities
- contributions
- media
- landing pages

This keeps authorization, publication rules, and tenant scoping in one place.

## Product Consequences
This architecture supports:
- real-time app screens without extra infrastructure
- one backend mental model across all product surfaces
- church-scoped publication rules for public and authenticated reads
- incremental rollout of integrations and workflow automation

It also implies that future complexity should be added carefully. The stack is
already capable of a lot; the main risk is unfinished workflow depth rather than
insufficient platform breadth.

## Non-Goals
- Reintroducing a CMS-first architecture for the active repo
- Splitting the main operational data model across multiple backend systems
- Coupling the core backend to a `Next.js` runtime

## Immediate Priorities
- finish Convex initialization and generated types
- wire Clerk through the app and backend
- connect the app routes to live data
- replace worker placeholders with real Convex-backed queries and mutations
- complete the remaining unimplemented schema domains