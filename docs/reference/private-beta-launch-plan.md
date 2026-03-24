# Fellowship42 Private Beta Launch Plan

## Purpose
This is the active implementation plan for getting Fellowship42 ready for a
private beta with one real church while keeping the system structurally correct
for multi-church tenancy.

It reflects the current local repository rather than the earlier planning files.

## Locked Decisions
- Beta scope: `broad ops beta`
- First live church count: `1`
- Frontend app: `Vite + React`
- Public web: `Astro`
- Edge API: `Hono on Cloudflare Workers`
- Backend: `Convex Cloud`
- Auth target: `Clerk`
- Hosting target: `Cloudflare Pages + Cloudflare Workers + Convex Cloud`
- Payments posture for beta: `basic contribution recording first`, not a fully mature finance product

## Beta Goal
The private beta should be usable for one real church across these core areas:
- church profile and public web presence
- people records
- ministries, groups, and courses
- events and sermons
- contributions visibility for authorized users
- basic church-specific branding and landing pages

The beta does not need full product breadth. It does need credible end-to-end
workflows in the areas above.

## Required Launch Conditions
### Product
- church admins can sign in and reach their church-scoped app views
- the app shows live data from Convex rather than placeholder content
- public church pages show published content only
- church branding applies consistently across app and web surfaces
- core create and update flows exist for the main operational records

### Technical
- `npm install` completes from a clean checkout
- `npx convex dev` runs successfully and generates typed server artifacts
- `npm run typecheck` passes
- worker routes that are exposed publicly are backed by real data or explicitly disabled
- auth and access control remain enforced server-side

### Operational
- there is a demo or pilot church seed path
- there is a rollback plan for public page changes
- webhook failures are observable
- deployment steps are documented well enough to repeat

## Active Workstreams
### 1. Infrastructure and auth
Must complete before beta:
- initialize Convex locally and generate `_generated` artifacts
- configure Clerk issuer settings for Convex
- wire app auth providers and sign-in state
- provision or upsert users from authenticated identity

### 2. Live data wiring
Must complete before beta:
- replace SPA route placeholders with `useQuery` and `useMutation` flows
- connect worker church routes to the Convex HTTP API
- validate public versus authenticated content behavior

### 3. Core CRUD coverage
Must complete before beta:
- church management flows
- people flows
- groups flows
- courses flows
- events flows
- sermons and landing page management where needed

### 4. Gaps in backend coverage
Should complete before beta if they are on the pilot church path:
- group sessions
- attendance records
- facilities
- media upload flows

### 5. Beta safety
Should complete before launch:
- logging and error tracking
- webhook verification
- form and public endpoint hardening
- a minimal support and rollout checklist

## Execution Order
Follow this order unless blocked:

1. `npm install` and `npx convex dev`
2. Clerk auth end to end
3. Live SPA data wiring
4. Worker route integration with Convex
5. Core CRUD forms and flows
6. Missing backend domains needed by the pilot church
7. Seed data and manual beta validation
8. Deployment rehearsal

## Explicit Non-Goals For This Beta
- native mobile apps
- advanced accounting integrations
- fully mature website builder tooling
- broad automation beyond what is needed for one pilot church
- enterprise-grade multi-environment operational tooling