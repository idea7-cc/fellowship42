# Fellowship42 Private Beta Launch Plan

## Purpose
This is the active implementation plan for getting Fellowship42 ready for a `private beta with one real church` while keeping the architecture and data model `ready for multiple churches`.

This document replaces ad hoc chat context as the primary planning reference for the beta path.

Use this together with:
- [../README.md](/home/chris/Repos/fellowship42/README.md)
- [private-beta-implementation-status.md](/home/chris/Repos/fellowship42/docs/private-beta-implementation-status.md)
- [fellowship42-convex-platform-plan.md](/home/chris/Repos/fellowship42/docs/fellowship42-convex-platform-plan.md)

## Locked Decisions
- Beta scope: `Broad Ops Beta`
- First live church count: `1`
- Data strategy: `import early`
- Website posture: `early website cutover`
- Rollout posture: `shadow + gradual replace`
- Backend: `Convex Cloud`
- Frontends: `marketing = Astro`, `ops = Vite + React + TanStack Router`, `sites = Astro`
- Auth target: `WorkOS`
- Email target: `SES`
- Hosting target: `Cloudflare frontends + Convex Cloud backend`
- Payments in beta: `import/reporting only`, not native live online giving

## Beta Goal
The private beta must be good enough for one real church to use for:
- public church website
- people and households
- ministries, groups, courses, and attendance
- forms, submissions, tasks, and workflows
- events
- basic volunteer scheduling
- contribution import and reporting

The system must already be structurally safe for:
- multi-church tenancy
- role-based access
- future self-serve onboarding

## Required Launch Conditions

### Product
- church website is editable, previewable, and publishable
- people and household data can be imported and audited
- public forms create follow-up data reliably
- ministry leaders can operate groups, attendance, and volunteer workflows
- finance users can review imported contribution data safely

### Technical
- no beta-critical path depends on demo-only data
- ops app reads and writes directly to Convex
- all tenant-sensitive queries are scoped by `churchId`
- local and hosted environments are separated
- build and typecheck pass from clean checkout

### Operational
- website rollback procedure exists
- import rollback and correction procedure exists
- there is a clear weekly beta triage cadence
- public forms and workflow failures are observable

## Active Workstreams

### 1. Auth and tenancy
Must be completed before beta:
- replace local seeded auth profile flow with real WorkOS frontend auth
- keep `users`, `userChurchRoles`, and church invitations as the app-level authorization layer
- add church switcher for multi-church users
- ensure all ops mutations enforce role checks server-side

### 2. Import and real data onboarding
Must be completed before beta:
- import UI in ops
- dry-run and validation summaries
- dedupe handling for people and households
- contribution import review
- import audit trail per church

### 3. Core ops workflows
Must be completed before beta:
- people/households CRUD polish
- tags and smart lists
- forms and submission queue
- tasks and workflow rules
- groups/courses/attendance
- event CRUD
- volunteer role assignment and response flow

### 4. Website cutover readiness
Must be completed before beta:
- navigation editor
- revisions and publish flow polish
- media library workflow
- custom domain setup
- sitemap/robots/SEO review
- giving page fallback to existing processor if native payments are not live

### 5. Beta safety
Must be completed before beta:
- error tracking
- structured logs
- rate limiting for public forms
- export/backup routine
- support/admin tooling for platform admin
- environment separation and deploy docs

## Execution Order
Follow this order. Do not reorder unless there is a hard blocker.

1. WorkOS auth end to end
2. Ops UI direct Convex hardening
3. Import pipeline and review UI
4. People/households/forms/tasks/workflows polish
5. Groups/courses/attendance polish
6. Events and volunteer scheduling UI
7. Contributions import/reporting UI
8. Website editing and cutover readiness
9. Observability and support tooling
10. Hosted staging/private-beta deployment
11. Website cutover
12. Gradual ops replacement inside the church

## Development Rules
- Prefer explicit role checks over inferred permissions
- Prefer church-scoped indexes and narrow queries
- Prefer manual safe operations over unfinished automation
- Prefer feature flags over hidden incomplete UI
- Prefer import/reporting over live payment rails for beta
- Prefer one fully supported church over partial breadth

## Public and Internal API Targets

### Auth
- `getCurrentUser()`
- `getActiveChurch()`
- `getUserChurchRoles()`

### Church and tenancy
- `churches.createChurch`
- `churches.updateChurch`
- `churches.getChurchBySlug`
- `churches.getChurchByDomain`
- `churches.listChurchsForUser`
- `churches.inviteUserToChurch`
- `churches.getOpsSnapshot`

### People and households
- `households.listByChurch`
- `households.create`
- `households.update`
- `people.listByChurch`
- `people.create`
- `people.update`
- `people.bulkImport`
- `smartLists.preview`

### Forms and workflows
- `forms.submitPublicForm`
- `forms.createForm`
- `forms.updateForm`
- `forms.listSubmissions`
- `tasks.create`
- `tasks.updateStatus`
- `workflows.runForSubmission`
- `workflows.testRule`

### Website
- `websites.getPublishedPage`
- `websites.getEditablePage`
- `websites.upsertPage`
- `websites.publishPage`
- `websites.updateTheme`
- `websites.updateNavigation`
- `websites.listMedia`
- `websites.createRevision`

### Events and volunteers
- `events.create`
- `events.update`
- `events.register`
- `volunteers.createRole`
- `volunteers.assign`
- `volunteers.respondToAssignment`

### Finance
- `contributions.createFund`
- `contributions.importContributions`
- `contributions.listByChurch`
- `contributions.getPersonHistory`

## Acceptance Checklist

### Local validation
- import representative church data
- open ops as church admin, ministry leader, and finance user
- submit a public form from the church site
- verify task creation and submission visibility in ops
- edit homepage/theme and publish
- create event and volunteer assignment
- import contribution rows and verify totals

### Hosted private beta
- staging domain works
- church domain cutover is rehearsed
- rollback steps are documented
- beta support workflow exists

## Explicit Non-Goals For This Beta
- child check-in
- native mobile apps
- SMS/WhatsApp
- multi-language UI
- advanced accounting integrations
- live online giving inside Fellowship42
