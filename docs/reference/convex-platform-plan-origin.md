# Fellowship42 Convex Platform Plan

## Summary
Fellowship42 should be reframed as a three-surface platform built on a single primary backend model: `Convex`.

Those three surfaces are:
- `marketing site` for Fellowship42 itself
- `church ops app` for church staff, leaders, and members
- `church websites` generated and managed per church

This keeps the product direction largely intact:
- modern, high-performance church software for the missing middle
- strong website + operations story in one platform
- Protestant-first, but structurally extensible to Catholic and Orthodox use cases
- responsive web first, with mobile apps deferred

The major change is architectural:
- drop `Payload`
- standardize on `Convex` as the primary backend and data model
- use `Astro + React` for public-facing sites
- use `Vite + React` for the church ops app
- deploy frontends on `Cloudflare`
- use `Convex Cloud` as the backend platform

## Architecture Decision
### Decision
Adopt a `Convex-first` architecture and treat the product as a multi-app monorepo instead of a single CMS-centered application.

### Why this is the better fit
This product is no longer best understood as “a CMS plus some church administration.”
It is better understood as:
- an operations platform
- a website platform
- an AI-assisted content generation platform

Convex is a better fit if the product should lean into:
- realtime state and live dashboards
- integration orchestration
- background workflows
- subscriptions and reactive UX
- AI/agent-assisted content and administrative automation
- a unified backend mental model across product surfaces

Payload would still be workable, but once the product is split into:
- marketing surface
- ops surface
- church website surface

the value of a single CMS/admin framework drops relative to the value of:
- one primary backend
- one identity model
- one workflow system
- one set of integration primitives

## Product Surfaces
### 1. Fellowship42 Marketing Site
Purpose:
- communicate the product clearly
- capture leads
- support onboarding and self-serve qualification
- drive Stripe checkout for plans, pilots, or setup fees

Recommended stack:
- `Astro`
- `React` for interactive islands only
- `Convex` for lead capture, onboarding records, and lightweight CRM state
- `Stripe Checkout`

This app should stay intentionally light.
It does not need the full ops domain.

Core features:
- product pages
- pricing
- church software positioning
- lead capture forms
- email capture / waitlist
- Stripe checkout
- pilot church application flow

### 2. Church Ops App
Purpose:
- the main application used by staff, leaders, and members
- where operational workflows actually live

Recommended stack:
- `Vite`
- `React`
- `Convex`

This is the primary product surface and primary product risk.

Core domains:
- churches
- users
- households
- people
- tags and smart lists
- ministries
- groups
- group memberships
- group sessions
- attendance
- courses
- curriculum and training progress
- forms and submissions
- tasks and workflows
- milestone tracking
- contributions and giving metadata
- events and registrations
- communications
- integration settings
- alerting and realtime operational state

### 3. Church Websites
Purpose:
- each church gets a public website powered by Fellowship42
- strong performance, clean UX, high conversion to first visit / next step
- AI-assisted content generation and site setup

Recommended stack:
- `Astro`
- `React` for editing previews, interactive widgets, and selected components
- `Convex` as the content/backend source

Core website capabilities:
- church homepage
- plan your visit
- beliefs / about
- ministries
- groups and classes
- courses / next steps
- sermons
- events
- giving
- contact
- embedded or hosted public forms

## Tech Stack
### Monorepo
- `pnpm`
- `Turborepo`
- `TypeScript`

### Frontend apps
- `apps/marketing`: `Astro + React`
- `apps/ops`: `Vite + React`
- `apps/sites`: `Astro + React`

### Backend
- `Convex Cloud`

### Hosting
- `Cloudflare Pages` or equivalent Cloudflare frontend deployment path for:
  - marketing
  - church websites
- Cloudflare-hosted static/frontend delivery for ops shell as well, if desired
- backend remains `Convex Cloud`

### Payments
- `Stripe`

### Email
- `AWS SES`

### SMS / messaging
- `Twilio` first
- WhatsApp later via approved provider path

### Media and files
- `Cloudflare R2`

### Analytics and monitoring
- `PostHog`
- `Sentry`

## Why Astro Still Makes Sense
Astro is a good fit for:
- Fellowship42 marketing pages
- church public websites

because those experiences are mostly:
- content-heavy
- SEO-sensitive
- performance-sensitive
- only selectively interactive

It should not be the center of the church ops app.
That app is better treated as a real client application, which is why `Vite + React` is the better default there.

## Why Convex Should Own All Three
### Convex should be the primary system of record
The recommendation is not “Convex for fast things.”
It is:
- `Convex is the backend platform`

Reasons:
- one backend mental model
- one auth and identity model
- one workflow engine
- one integration layer
- one place to add realtime behavior
- easier AI tooling around a single authoritative domain model

### What this means in practice
Convex should own:
- church records
- people and households
- operations data
- public website content models
- page composition data
- AI generation jobs and outputs
- integration jobs and sync state

The public church websites and marketing site are just different frontends over the same backend.

## AI Site and Content Generation
This stack is well suited to AI-assisted church site generation.

### Recommended AI scope
Input:
- denomination or tradition
- church name and location
- beliefs / doctrinal profile
- ministries
- service times
- audience
- tone and style preferences
- photos and media
- current website or imported text if available

Output:
- church theme tokens
- homepage draft
- plan-your-visit page
- ministry landing pages
- group landing pages
- course / class pages
- sermon or event summary drafts
- FAQ drafts
- next-step CTAs

### Important product rule
AI should generate:
- `drafts`

not automatic publishing by default.

### Why Convex helps here
Convex gives a clean place for:
- generation jobs
- progress tracking
- agent state
- human review state
- content handoff to public websites
- realtime updates while generation is running

## Suggested Monorepo Layout
```text
apps/
  marketing/
  ops/
  sites/

packages/
  ui/
  domain/
  auth/
  email/
  stripe/
  site-builder/
  ai/
  config/

convex/
  schema.ts
  churches.ts
  people.ts
  households.ts
  groups.ts
  courses.ts
  forms.ts
  tasks.ts
  workflows.ts
  websites.ts
  ai.ts
  integrations.ts
  billing.ts
```

## Core Domain Model
The product thinking from the previous plan should stay intact.
Only the implementation stack changes.

### Church and tenant model
- `churches`
- `churchSettings`
- `billingAccounts`
- `domains`
- `websiteConfigs`

### Identity and access
- `users`
- `userChurchRoles`
- `memberProfiles`

### People and engagement
- `households`
- `people`
- `tags`
- `smartLists`
- `milestoneTypes`
- `milestoneRecords`

### Ministries and discipleship
- `ministries`
- `groups`
- `groupMemberships`
- `groupSessions`
- `attendanceRecords`
- `courses`
- `courseLessons`
- `courseEnrollments`

### Forms and workflows
- `forms`
- `formFields`
- `formSubmissions`
- `tasks`
- `workflowRules`
- `messageTemplates`

### Communications
- `emailTemplates`
- `notificationEvents`
- `deliveryLogs`

### Websites and publishing
- `siteThemes`
- `sitePages`
- `pageSections`
- `sermons`
- `events`
- `mediaAssets`
- `navigationMenus`

### Finance
- `funds`
- `contributions`
- `checkoutSessions`

### Integrations
- `integrationAccounts`
- `integrationConnections`
- `syncJobs`
- `webhookEvents`

## Product Priorities Preserved
The product priority order from the Growth Core thinking still stands.

### Phase 1
- households and relational people
- tags and smart lists
- forms and submissions
- workflows and tasks
- groups and attendance
- courses and training
- milestones
- website theme and landing-page generation basics

### Phase 2
- contributions and billing hardening
- communications expansion
- event registration
- volunteer scheduling
- richer website builder
- AI site generation flows

### Phase 3
- child check-in
- advanced realtime ops tooling
- WhatsApp and broader international support
- native mobile if warranted

## Recommended Frontend Boundaries
### Marketing app owns
- Fellowship42 brand site
- pricing
- checkout
- lead capture
- waitlist
- demos

### Ops app owns
- admin dashboards
- people and household management
- groups and courses
- attendance
- workflows
- integrations
- communications
- finance operations
- member and leader self-service

### Sites app owns
- public church websites
- dynamic but mostly content-oriented public pages
- public form experiences
- sermon and event display
- AI-assisted page previews and publishing review

## Realtime Guidance
Convex makes it easy to add realtime everywhere, but that does not mean every feature should be live by default.

Use realtime aggressively for:
- follow-up queues
- integration job state
- notifications
- attendance and session updates
- service-day operations later
- AI generation progress
- collaborative editing status

Do not force realtime complexity into:
- static page rendering
- historical reports
- financial exports
- content pages that can be rebuilt or cached

## Auth and Identity
One auth model should be shared across all three apps.

Recommended principle:
- one Fellowship42 identity
- scoped by church and role
- supports:
  - platform admins
  - church admins
  - ministry leaders
  - members
  - marketing-site prospects

This should be treated as a platform concern, not rebuilt separately in each app.

## Stripe and Billing
Stripe should be used in two distinct ways:

### Fellowship42 billing
- plan purchase
- setup fees
- subscription management

### Church giving and payments
- contributions
- event or class payments later

These should not be conflated in the domain model even if both use Stripe.

## SES and Church Domains
Email should follow this model:
- Fellowship42 default sender for platform-managed sending
- church-specific verified sending domains later

This direction remains valid in the Convex architecture.
The difference is only where config and delivery jobs live.

## Migration and Reset Strategy
Because this is still greenfield, the recommendation is:
- do not migrate the current Payload codebase forward
- preserve the product thinking and domain learnings
- rebase implementation on the new stack cleanly

### Keep
- product direction
- domain concepts
- feature prioritization
- landing-page and church-site ideas
- growth-core requirements
- multi-tradition milestone support

### Discard
- Payload-specific collection assumptions
- Next.js-as-backend assumptions
- admin-CMS-first architecture

## First Build Sequence
### Step 1
Monorepo foundation:
- pnpm
- turborepo
- shared TS config
- apps and packages skeleton

### Step 2
Convex schema foundation:
- churches
- users
- households
- people
- tags
- smart lists
- forms
- submissions
- tasks
- workflows

### Step 3
Ops app foundation:
- auth
- dashboard shell
- people and household CRUD
- forms/submissions queue
- tasks

### Step 4
Sites app foundation:
- church website routing
- basic theme system
- homepage + plan-your-visit + ministries + groups + courses + events
- public forms

### Step 5
Marketing app foundation:
- pricing
- waitlist
- Stripe checkout

### Step 6
AI generation v1:
- generate church theme
- generate homepage
- generate ministry/group/course page drafts

## Open Questions
- whether the church websites app should be a single multi-tenant Astro app or generated/deployed per church
- how much website content should be fully structured versus block-based
- whether member self-service should live only in the ops app or partially appear on church public sites
- what auth provider should be used across apps
- how aggressively to model content editing inside Convex before building a richer site editor

## Recommendation
Proceed with a full architecture reset to:
- `Convex + Astro + React/Vite`

but preserve the product roadmap and domain direction already established.

This is not a pivot in product strategy.
It is a reset in implementation strategy to better support:
- realtime
- integrations
- AI-assisted site creation
- cleaner multi-app boundaries
- one backend mental model
