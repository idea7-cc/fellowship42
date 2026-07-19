# Legacy Payload Feature Audit

This document captures the meaningful product behaviors that existed in the
retired `fellowship42-app/` implementation before it was removed from the
repository on 2026-03-24.

The goal is not to preserve the old architecture. The goal is to preserve
feature intent so those capabilities can be rebuilt in the active Cloudflare
Workers, D1, R2, Durable Objects, Vite, and Astro stack.

## Fully represented in the active stack

These areas have already been carried forward at the data-model level and are
not unique to the old app:

- church, ministry, group, course, event, sermon, people, contribution, media,
  group membership, course enrollment, attendance, facility, and session tables
- church-scoped access control and role concepts
- shared brand token system and church theme presets

## Legacy-only product surfaces not yet rebuilt

### 1. Dynamic landing pages for ministries, groups, and courses

The old app had a real landing-page system rather than static detail views.
What it supported:

- distinct public routes for ministry, group, and course landing pages
- landing pages linked to an owner record and church
- draft and published status
- inherited church theme or page-level theme overrides
- preview/edit/public redirect tooling from the admin side
- automatic landing-page creation when an owner record had no page yet

The renderer supported these block types:

- `hero`
- `copy`
- `featureList`
- `testimonials`
- `leaderCards`
- `signupForm`
- `cta`
- `faq`
- `relatedFeed`

The old implementation also enriched block data dynamically:

- `leaderCards` resolved people records for leader IDs
- `relatedFeed` resolved groups, courses, events, or sermons by church or
  ministry scope

What the new stack has today:

- `landing_pages` and typed block records exist in D1
- no page-builder UI
- no landing-page renderer in the active app or web surface
- no public landing-page routes yet

### 2. Public church website pages

The old app exposed a real public church page at `/churches/[slug]` with:

- church hero, service times, address, and giving link
- featured ministries
- public groups and classes
- upcoming events
- recent sermons
- church-scoped theming

What the new stack has today:

- the Astro marketing site is for Fellowship42 marketing
- the worker now exposes church-related public API routes
- there is still no rebuilt public church website surface

### 3. Member self-service portal

The old app had an authenticated member portal with:

- current group memberships
- open-enrollment group discovery
- current course enrollments
- available course discovery
- start-course flow
- join-group flow
- lesson completion toggles with progress recalculation

What the new stack has today:

- enrollment and membership tables exist in D1
- no rebuilt member portal UI or auth wiring in the SPA

### 4. Leader dashboard

The old app had a leader-specific dashboard with:

- groups led by the current leader
- roster visibility
- upcoming sessions
- submitted attendance summary by session

What the new stack has today:

- the relevant tables exist in D1
- no rebuilt leader dashboard UI
- no group-session or attendance API write routes yet

### 5. Admin-side publishing workflow

The old app used Payload admin as a workflow engine for content/publishing:

- edit links for landing pages
- public/open-preview links
- auto-provisioned landing-page drafts
- session-backed login/logout flows through Payload auth

What the new stack has today:

- no replacement publishing workflow yet
- Cloudflare Access and app-native admin tooling now replace the old auth/admin path

## Recommended carry-forward priorities

If the goal is product continuity rather than historical completeness, the
highest-value features to rebuild next are:

1. Public church website pages powered by the Worker and D1
2. Landing-page rendering and editing for ministries, groups, and courses
3. Member portal flows for group joining and course progress
4. Leader dashboard with sessions and attendance
