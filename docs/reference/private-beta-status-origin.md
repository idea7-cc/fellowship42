# Fellowship42 Private Beta Implementation Status

## Purpose
This document is the continuation guide for implementation. It answers:
- what is already done
- what is partially done
- what still blocks private beta
- what should be built next

Update this file whenever a meaningful beta milestone lands.

## Current State
As of `2026-03-22`, the repo has a working Convex monorepo with:
- `apps/marketing`
- `apps/ops`
- `apps/sites`
- active Convex schema and generated API

## Completed

### Platform shape
- monorepo replatform is done
- Convex Cloud is configured
- ops app uses TanStack Router
- sites and marketing are Astro-based

### Direct backend path
- ops now reads and writes directly to Convex via [../apps/ops/src/convex.ts](/home/chris/Repos/fellowship42/apps/ops/src/convex.ts)
- ops no longer depends on the sites-side proxy for its core snapshot/theme/page/AI flows

### Schema and backend foundation
Implemented or scaffolded in Convex:
- auth helpers and local acting-user resolution
- churches and role assignments
- people and households
- tags and smart lists preview
- forms and submissions
- tasks
- website theme/page/revision functions
- events
- volunteer roles and assignments
- contribution import/reporting functions

Primary files:
- [../convex/schema.ts](/home/chris/Repos/fellowship42/convex/schema.ts)
- [../convex/auth.ts](/home/chris/Repos/fellowship42/convex/auth.ts)
- [../convex/churches.ts](/home/chris/Repos/fellowship42/convex/churches.ts)
- [../convex/people.ts](/home/chris/Repos/fellowship42/convex/people.ts)
- [../convex/households.ts](/home/chris/Repos/fellowship42/convex/households.ts)
- [../convex/forms.ts](/home/chris/Repos/fellowship42/convex/forms.ts)
- [../convex/tasks.ts](/home/chris/Repos/fellowship42/convex/tasks.ts)
- [../convex/websites.ts](/home/chris/Repos/fellowship42/convex/websites.ts)
- [../convex/events.ts](/home/chris/Repos/fellowship42/convex/events.ts)
- [../convex/volunteers.ts](/home/chris/Repos/fellowship42/convex/volunteers.ts)
- [../convex/contributions.ts](/home/chris/Repos/fellowship42/convex/contributions.ts)

### Local data foundation
- seed/backfill now populates:
  - local auth users
  - user-church role assignments
  - feature flags
  - baseline volunteer data
  - baseline fund data

Primary file:
- [../convex/lib.ts](/home/chris/Repos/fellowship42/convex/lib.ts)

### Shared domain types
- beta-oriented shared types expanded for:
  - authenticated users
  - role assignments
  - contributions
  - volunteer roles and assignments
  - page revisions
  - feature flags

Primary file:
- [../packages/domain/src/index.ts](/home/chris/Repos/fellowship42/packages/domain/src/index.ts)

## Verified
- `pnpm install`
- `npx convex dev --once`
- `pnpm typecheck`
- `pnpm build`
- direct Convex query for `churches.getOpsSnapshot`
- direct Convex mutation for `forms.submitPublicForm`

## Still Blocking Private Beta

### Auth
Not done:
- real WorkOS frontend auth flow
- real WorkOS session propagation into Convex
- replacing local auth profile switching in ops

Current state:
- local seeded auth profiles are still used for development

### Import UX
Not done:
- CSV import UI
- dry-run review screens
- row-level correction UX
- import audit screens in ops

Current state:
- backend import functions exist
- ops UI does not expose them yet

### Ops screens
Not done:
- people/household CRUD screens beyond current read-only/dashboard view
- event management screens
- volunteer assignment screens
- contribution reporting/import screens
- church admin and invitation screens
- role management screens

### Website cutover tooling
Not done:
- navigation editor UI
- media library UI
- revision browsing UI
- custom domain setup UI and staging workflow
- website cutover checklist/runbook docs

### Safety and operations
Not done:
- Sentry or equivalent
- structured logs surfaced for operators
- form rate limiting
- backup/export routine docs and tooling
- deploy and rollback docs

## Next Recommended Implementation Order

### Next 1
Implement real WorkOS auth.

Concrete tasks:
- add WorkOS frontend packages and providers
- wire login/logout flows in ops
- map authenticated WorkOS user into Convex `users`
- replace local auth profile selector in ops with real session state
- keep a local-only fallback path only if explicitly gated for development

### Next 2
Build import UI in ops.

Concrete tasks:
- add admin route for import jobs
- upload/paste CSV flow
- preview and validation summary
- dedupe reporting
- invoke `people.bulkImport` and `contributions.importContributions`

### Next 3
Build event, volunteer, and contribution ops screens.

Concrete tasks:
- event list/detail/create forms
- volunteer role and assignment UI
- contribution import history and summary views
- person contribution history views

### Next 4
Build website cutover tooling.

Concrete tasks:
- navigation editor
- page revision viewer
- media management UI
- domain/cutover checklist docs

## Continuation Rules
- do not reintroduce sites-proxy dependence for ops
- do not add beta-critical features on top of local-only auth assumptions
- keep all role checks server-side in Convex
- keep church scoping explicit in every query and mutation
- prefer finishing one beta-critical workflow end to end before broadening surface area

## Short Manual Test Loop
Use this after meaningful changes:

1. `npx convex dev --once`
2. `pnpm typecheck`
3. `pnpm build`
4. seed or backfill the demo church
5. query `churches.getOpsSnapshot`
6. submit a real public form
7. verify the resulting task/submission in ops
