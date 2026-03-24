# Fellowship42 Product Plan

## Summary
Fellowship42 is a multi-tenant church management platform for Christian churches
that combines church operations, member-facing experiences, and public website
delivery in one product.

The active direction is now a `Convex-first` platform with three primary
surfaces:
- a `Vite + React` application for church staff and members
- an `Astro` web surface for Fellowship42 marketing and public church pages
- a `Hono` edge API for public data access, integrations, and webhooks

The product thesis has not changed: smaller and midsize churches want one modern
system for people, groups, courses, events, giving, content, and web presence
without the operational weight of enterprise church software.

## Quick Market Survey
This is a high-level synthesis of visitor-behavior research and current church
software positioning, not a claim of exact market share.

Churches appear to care most about these website outcomes:
- Service times, location, and first-visit information are immediately visible.
- Families can quickly understand kids ministry and safety expectations.
- Sermons, events, online giving, and beliefs are easy to find on mobile.
- The site helps turn anonymous visitors into first-time attenders.

Churches appear to care most about these software outcomes:
- One system for people, households, giving, events, ministries, and communications.
- Easy recurring giving, statements, and donor history.
- Volunteer coordination, attendance, and group management.
- Facility scheduling and conflict-free room and resource booking.
- Low setup and training overhead for small and mid-size staff teams.

Sources:
- https://sermonview.com/ministry-insights/what-people-look-for-on-church-websites/
- https://get.tithe.ly/product/church-management
- https://www.planningcenter.com/people
- https://www.planningcenter.com/calendar
- https://equip.subsplash.com/groups-and-messaging

## Product Direction
- Primary target: U.S. Protestant and Evangelical churches with lean admin teams.
- Product shape: one platform, not a loose integration hub.
- Delivery strategy: responsive web first, mobile later.
- Core promise: one church-scoped system of record plus a strong public-facing website.
- Operating principle: multi-tenant by default, with church-specific branding and publishing.

## Architecture Decision
### Decision
Use `Convex + Hono + Vite React + Astro` as the default architecture for active
planning and implementation.

### Why this stack fits the product
Fellowship42 is no longer best modeled as a CMS-centered application. The
product now clearly spans:
- operational workflows for staff and ministry leaders
- member-facing application screens
- public church websites and marketing pages
- background automation and integration entry points

The current stack fits that shape well:
- `Convex` provides the primary data model, auth integration point, file storage,
  real-time subscriptions, and server functions.
- `Vite + React` gives the main app a fast, flexible SPA runtime for dashboards,
  forms, and church-scoped admin workflows.
- `Astro` keeps public pages fast, SEO-friendly, and easy to compose while still
  allowing React islands where interactivity is needed.
- `Hono` on `Cloudflare Workers` gives a narrow edge API for public endpoints,
  webhooks, and server-side integration logic that should not live in the browser.

### Why the old Payload direction is no longer the default
The previous Payload and Postgres recommendation made sense when the product was
framed more like a single application with CMS-style administration. That is no
longer the primary shape of the codebase or the product.

The decisive shifts are:
- realtime app behavior is now a first-class primitive
- the backend is intentionally decoupled from a `Next.js` runtime
- the system is split into distinct product surfaces with one shared backend
- custom domain logic and church-scoped access control are central, not secondary

## Product Surfaces
### Church App
Purpose:
- primary application for staff, ministry leaders, finance users, and members
- place where operational workflows live

Current implementation target:
- `apps/app`
- `React 19`
- `Vite`
- `React Router`
- `Convex React hooks`

Core responsibilities:
- dashboard and church overview
- people and households
- ministries and groups
- courses and enrollments
- events and sermons
- contributions and finance access
- landing pages and church theme management

### Public Web Surface
Purpose:
- Fellowship42 marketing presence
- public church pages and SEO-sensitive content

Current implementation target:
- `apps/web`
- `Astro 5`
- shared `@fellowship42/brand` tokens and presets

Core responsibilities:
- product marketing
- church profile pages
- public ministry, event, sermon, and giving pages
- plan-your-visit and conversion-oriented landing pages

### Edge API and Integrations
Purpose:
- public API routes that should not be exposed directly from the browser
- webhook ingestion and future integration orchestration

Current implementation target:
- `apps/worker`
- `Hono`
- `Cloudflare Workers`
- server-side calls into the `Convex` HTTP API

Core responsibilities:
- public church API responses
- Clerk and Stripe webhook handling
- future rate limiting, caching, and integration endpoints

## Core Domain Model
The current Convex schema centers on church-scoped multi-tenant records.

Primary domains already represented in the active schema:
- churches and theming
- users and church access
- people
- ministries
- groups and group memberships
- group sessions and attendance records
- courses and course enrollments
- events
- sermons
- facilities
- contributions
- media
- landing pages

Product implication:
- Fellowship42 should be treated as an operations platform with integrated
  publishing, not as a content system with a few church admin extensions.

## Recommended Tech Stack
- Backend platform: `Convex Cloud`
- Edge API: `Hono` on `Cloudflare Workers`
- App UI: `Vite + React 19`
- Public site: `Astro 5`
- Language: `TypeScript`
- Styling: `Tailwind CSS v4`
- Component base: owned `shadcn/ui` source in the app workspace
- Shared brand system: `@fellowship42/brand`
- Auth provider target: `Clerk`
- Payments: `Stripe`
- Object storage: `Convex storage` first, with `Cloudflare R2` still viable for future external asset needs
- Analytics and errors: `PostHog` and `Sentry`
- Messaging: `Twilio` for SMS when needed

## Deployment and Infrastructure
### Recommended default
- React app on `Cloudflare Pages`
- Astro web surface on `Cloudflare Pages`
- Hono worker on `Cloudflare Workers`
- Backend and data model on `Convex Cloud`

### Tenant model
The default multi-tenant posture is:
- one shared backend per environment
- explicit `churchId` scoping in every tenant-sensitive query and mutation
- role-based access enforced server-side
- public queries return published-only content for unauthenticated callers

This should remain the default unless a later enterprise requirement forces
isolated deployments for specific churches.

## Initial High-Level Features
- Church profile, branding, settings, and domain management
- Public website presence with sermons, events, giving, and plan-your-visit pages
- People records and church membership workflows
- Ministries, groups, Sunday school classes, and volunteer coordination
- Courses, curriculum, and training progress
- Events, registrations, and scheduling
- Contributions, donor history, and finance-scoped reporting
- Landing pages for ministries, groups, and courses
- Member portal for profile, participation, and self-service tasks

## Delivery Priorities
### Near-term
- initialize and type the Convex backend locally
- wire Clerk auth end to end
- connect the SPA routes to live Convex data
- replace worker placeholder routes with real Convex-backed responses
- expand app forms for create and edit flows across core domains

### Beta path
- complete missing functions for facilities, attendance, sessions, and media
- add church-scoped publishing and landing page editing flows
- add webhook handling for user provisioning and contribution recording
- seed a demo church and validate end-to-end church admin workflows

### Later
- richer workflow automation
- deeper reporting and exports
- more advanced facility scheduling and conflict management
- real-time collaboration and check-in flows
- mobile clients sharing the same backend model

## Working Assumptions
- Initial market is U.S.-based churches.
- Initial denominational fit is Protestant and Evangelical, though the data model
  should remain extensible.
- Mobile apps are not required for v1.
- Real-time updates are valuable enough to influence the backend choice.
- The current question is no longer whether Fellowship42 should use a CMS-driven
  architecture. The active question is how far the current Convex-centered
  platform should be pushed before adding new infrastructure.

## Open Questions
- How far the first release should go on live online giving versus contribution recording and reporting.
- How much church website publishing should live directly in Convex before a richer editor is built.
- Which staff workflows most need real-time behavior in the first beta.
- Whether future public church sites should stay inside one multi-tenant Astro surface or grow into a more specialized delivery model.
