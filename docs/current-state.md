# Current implementation state

Reviewed: 2026-09-16. This describes the working source, not a new release.

| Surface | Implemented | Remaining |
|---|---|---|
| Staff workflows | Directory, households, groups/rosters, courses/enrollments, sessions/attendance, church settings and website publishing, contributions, media, team invitations and roles | Church pilot feedback, wider browser workflow coverage |
| Participation reliability | Atomic capacity admission, record-specific edit versions, guarded audit/outbox mutations, attendance registers that keep recorded marks across roster changes, course completion dates kept through archiving | Live multi-user observation |
| Staff form reliability | Retry-safe creates with per-entry `Idempotency-Key` (contributions, people, households, group sessions, media), editors scoped to one record, event times edited and listed in the event's timezone, sermon dates as calendar dates | Clearer messages when a retried edit or slug-keyed create meets its own earlier success |
| Church website | EmDash 1.0.1 website beside the instance, owner-claimed first administrator, public website contract v1, trusted `@fellowship42/emdash` blocks and renderers (installed from packed tarballs in acceptance, not published to npm), sandboxed `fellowship42-connect` registry artifact (validated locally, not published), lifecycle inventory and fixtures | Public package and registry publication, a live deployment, seamless editor sign-in |
| Authentication | Instance-owned staff passkeys and revocable sessions, optional Cloudflare Access, application roles, owner bootstrap, owner-managed team memberships with last-owner protection, normalized invalid-assertion responses | Instance-owned member identity and account claiming; ADR 0020 remains proposed |
| Optional management | Enrollment, signed sync, grants, rotation, disconnect, owner-approved updates and diagnostic support | Independent security review and live operator exercises |
| Portability | Public export/import primitives, verification, rehearsal, exit packet contracts, including the website component | Dedicated-account restore/exit evidence |
| Maintenance | Shared verification gate, formatting/linting, resolved import boundaries, DOM race tests | Continue feature extraction as code changes |

The latest published release remains v0.26.0. Working source is ahead of it
and is not upgrade-compatible with it: the pre-alpha policy in `AGENTS.md`
keeps the whole schema in `migrations/0001_initial.sql`, edited in place, at
schema version 1, and `release-upgrade-policy.json` declares no eligible
upgrade sources. Participation and membership records carry their own edit
`version`; new group membership/leader/attendance writes use `version=0` only
to create an absent record, and updates and deletes require the observed
version.

API shapes now live in `apps/instance/contracts/api.ts`. Group publishing,
roster, and session/attendance routes live under `worker/features/groups`;
team membership routes live under `worker/features/team`; church profile
drafts, previews, and publishing live under `worker/features/church`.
See [Church setup and website publishing](church-setup-and-publishing.md).
The management protocol remains separate from ordinary application API types.

The [product plan](fellowship42-product-plan.md) now separates working-alpha,
church-beta, hosted-service, and hosted-phone readiness. STEP Bible integration
and native study, SignalWire communications, and the integrated church phone app
are planned, not implemented. Their proposed custody and public/private
boundaries are recorded in
[ADR 0028](adr/0028-optional-bible-and-signalwire-integrations.md).

Run `pnpm verify`. Release and live-readiness requirements are described in
[Releases](releases.md), [GA readiness](ga-readiness.md), and
[Maintenance](maintenance.md).
