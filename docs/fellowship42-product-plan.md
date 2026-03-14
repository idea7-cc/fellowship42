# Fellowship42 Product Plan

## Summary
Fellowship42 is planned as a unified software platform for Christian churches to manage ministries, programs, members, contributions, facilities, schedules, and public web presence.

The current recommendation is to use `Payload` as the primary backend and admin framework, backed by `Postgres`, unless a concrete product requirement emerges that Payload cannot satisfy cleanly. The default burden of proof should now be on `not using Payload`, not on using it.

## Quick Market Survey
This is a high-level synthesis of visitor-behavior research and current church software positioning, not a claim of exact market share.

Churches appear to care most about these website outcomes:
- Service times, location, and first-visit information are immediately visible.
- Families can quickly understand kids ministry and safety expectations.
- Sermons, events, online giving, and beliefs are easy to find on mobile.
- The site helps turn anonymous visitors into first-time attenders.

Churches appear to care most about these software outcomes:
- One system for people, households, giving, events, ministries, and communications.
- Easy recurring giving, statements, and donor history.
- Volunteer coordination, attendance, and group management.
- Facility scheduling and conflict-free room/resource booking.
- Low setup and training overhead for small and mid-size staff teams.

Sources:
- https://sermonview.com/ministry-insights/what-people-look-for-on-church-websites/
- https://get.tithe.ly/product/church-management
- https://www.planningcenter.com/people
- https://www.planningcenter.com/calendar
- https://equip.subsplash.com/groups-and-messaging

## Product Direction
- Primary target: U.S. Protestant/Evangelical churches with lean admin teams.
- Product shape: unified platform, not a loose integration hub.
- Delivery strategy: responsive web first, mobile app later.
- Core promise: one system of record for church operations plus a strong public-facing website.

## Payload Decision
### Recommendation
Use `Payload + Postgres` as the default architecture for v1 planning.

### Why Payload fits this product
Payload is not just a publishing CMS. It is a `Next.js-native backend, admin UI, API layer, auth layer, and application framework` that already supports many of the primitives this product needs:

- Code-defined schemas and generated admin for CRUD-heavy church records
- REST, GraphQL, and Local API access for web and future mobile clients
- Auth and role-based access control for staff, finance, ministry leaders, and members
- Hooks and custom endpoints for domain-specific workflows
- Jobs queue and scheduling for reminders, statements, and follow-up flows
- File/media handling for sermons, images, and documents
- Custom admin components when default collection views are not enough
- Postgres support as a first-class option

Payload references:
- https://payloadcms.com/docs/getting-started/installation/
- https://payloadcms.com/docs/access-control/collections/
- https://payloadcms.com/docs/authentication/operations/
- https://payloadcms.com/docs/jobs-queue/overview
- https://payloadcms.com/docs/rest-api/overview

### Why Postgres is the right database default
For this product, `Postgres` is a better fit than `MongoDB` unless the product intentionally prioritizes document flexibility over relational correctness.

Postgres advantages for this use case:
- Households, members, ministries, rooms, events, registrations, funds, and donations are relational by nature.
- Financial records benefit from stronger transactional guarantees and clearer constraints.
- Reporting, exports, statements, reconciliation, and year-end summaries are more natural in SQL.
- Deduplication, uniqueness, and cross-entity integrity are easier to enforce.
- Facility scheduling and conflict detection rely heavily on structured querying.

MongoDB would make more sense if one or more of these became dominant product needs:
- Highly dynamic, per-church document structures with minimal normalization
- Extremely document-centric developer preferences on the team
- Large denormalized activity/event streams as the core data model

None of those are currently the center of this product.

### What would justify not using Payload
Do not reject Payload because it is "a CMS." Reject it only if a real requirement points away from it.

The strongest reasons to avoid Payload would be:
- Realtime query subscriptions become a first-class product primitive across most screens.
- The system needs a backend runtime shape that should not be coupled to `Next.js`.
- The app requires extensive custom workflow execution or event-driven infrastructure that would be awkward to express through Payload hooks, endpoints, jobs, and admin extensions.
- The team explicitly wants to avoid adopting Payload's conventions as the backbone of the platform.

At the moment, none of those look strong enough to outweigh the leverage Payload provides.

## What should live in Payload
These domains fit well in Payload as first-class collections, globals, hooks, and custom endpoints:
- Churches and settings
- Users, roles, permissions, and member accounts
- People and households
- Ministries, programs, groups, Sunday school classes, and volunteer teams
- Courses, curriculum libraries, and training enrollments
- Events, registrations, calendars, rooms, and resources
- Donations, funds, campaigns, recurring gifts, and statements metadata
- Pages, sermons, media, forms, and public website content
- Communications, templates, and workflow/job definitions

The likely split is not "Payload for content, custom backend for operations."
The better default is:
- Payload owns the primary data model, admin foundation, API layer, and auth
- Custom React UI is added where the default admin experience is not enough
- Custom endpoints, hooks, and jobs handle domain logic that should not remain generic CRUD

## What should be custom even if Payload is the backend
Using Payload does not mean the entire product should look like a stock CMS admin.

These areas will likely need custom application UI or custom backend logic:
- Calendar and facility scheduling UX
- Volunteer roster and assignment views
- Member self-service portal
- Check-in or kiosk flows
- Reporting dashboards
- Payment reconciliation and giving statement generation
- Website theme system and church-specific starter templates

Payload should be treated as the foundation, not as a limit on product design.

## Recommended Tech Stack
- Framework: `Next.js` with `Payload`
- Language: `TypeScript`
- Database: `Postgres`
- ORM / DB layer: Payload's Postgres adapter and direct SQL only where justified
- Object storage: `Cloudflare R2`
- Hosting target: `Cloudflare` first
- Payments: `Stripe`
- Email: `Postmark` or `Resend`
- SMS: `Twilio`
- Analytics / errors: `PostHog` and `Sentry`

## Deployment and Infrastructure
### Recommended default
- App runtime: `Cloudflare Workers`
- CDN / edge / DNS / caching: `Cloudflare`
- File storage: `Cloudflare R2`
- Optional narrow realtime layer later: `Cloudflare Durable Objects`
- Primary database: `managed Postgres hosted outside Cloudflare`
- Worker-to-database connectivity: `Cloudflare Hyperdrive`

### Where Postgres should be hosted
Cloudflare does not offer a managed Postgres product. If we deploy the application primarily on Cloudflare, the practical shape is:
- Payload app on `Cloudflare`
- Postgres on an external managed provider
- `Hyperdrive` between Workers and Postgres for connection management and better compatibility with Worker execution

### Default recommendation
Use `Neon` for the first implementation unless a later compliance or enterprise requirement points elsewhere.

Why Neon is the best default fit:
- It is purpose-built for serverless and connection-pooled access patterns.
- Branching is unusually useful for this product during development, staging, support, and safe testing.
- Autoscaling fits a likely church-software traffic profile well.
- Read replicas are available if reporting or dashboard reads need to scale later.

### Good alternatives
- `Supabase Postgres`
  - Better if we want a more batteries-included database platform with built-in dashboard tooling and managed backups.
  - Less opinionated toward branching workflows, but very practical.
- `AWS RDS / Aurora Postgres`
  - Better if we later need a more conventional enterprise production posture, tighter infrastructure control, or stronger procurement familiarity.
  - Higher ops and platform overhead than Neon or Supabase.

### Multi-tenant database model
The starting assumption should be:
- one primary Postgres project per environment
- shared database, not one database per church
- tenant isolation enforced in the application model with `church_id` / `tenant_id`
- optional future escalation to stricter row-level security or isolated enterprise deployments only if needed

This is the right default unless the business later targets very large churches or special compliance constraints.

## Initial High-Level Features
- Church profile, branding, settings, and domain management
- Public website with page builder, sermons, events, giving, and plan-your-visit pages
- People and household records
- Membership and pastoral care notes
- Ministries, programs, groups, Sunday school classes, and volunteer management
- Online courses, curriculum libraries, and training progress
- Events, registrations, room/resource reservations, and schedules
- Contributions, recurring giving, funds, donor history, and statements
- Segmented communication by ministry, group, or member status
- Reporting and exports
- Member portal for profile, giving history, event signups, and group participation

## Working Assumptions
- Initial market is U.S.-based churches.
- Initial denominational fit is Protestant/Evangelical, even if the platform broadens later.
- Mobile apps are not a v1 requirement.
- Postgres is preferred over MongoDB.
- The default question is now "how should we use Payload well?" rather than "should Payload only be a CMS?"

## Open Questions
- Whether the first production Postgres host should be `Neon` or `Supabase`
- How much of the first admin UX should use stock Payload admin views versus custom application surfaces
- Whether donations should be modeled entirely inside Payload collections or partially separated for finance-specific services and audit boundaries
