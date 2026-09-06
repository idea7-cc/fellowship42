# Current implementation state

Reviewed: 2026-09-05. This describes the working source, not a new release.

| Surface | Implemented | Remaining |
|---|---|---|
| Staff workflows | Directory, households, groups/rosters, courses/enrollments, sessions/attendance, publishing, contributions, media | Church pilot feedback and wider browser workflow coverage |
| Participation reliability | Atomic capacity admission, record-specific edit versions, guarded audit/outbox mutations | Live multi-user observation |
| Authentication | Cloudflare Access staff identity, application roles, owner bootstrap, normalized invalid-assertion responses | Instance-owned member identity and account claiming; ADR 0020 remains proposed |
| Optional management | Enrollment, signed sync, grants, rotation, disconnect, owner-approved updates and diagnostic support | Independent security review and live operator exercises |
| Portability | Public export/import primitives, verification, rehearsal, exit packet contracts | Dedicated-account restore/exit evidence |
| Maintenance | Shared verification gate, formatting/linting, resolved import boundaries, DOM race tests | Continue feature extraction as code changes |

The latest published release remains v0.26.0. Working source includes later UI
and participation work and migration `0009_participation_concurrency.sql`.
Existing records gain `version=1`; new membership/leader/attendance writes use
`version=0` only to create an absent record. Updates and deletes require the
observed record version. Apply migrations before running the new Worker.
The runtime schema version is 9. Publish a new release before an external
operator adopts these changes; never relabel the existing v0.26 artifacts.

API shapes now live in `apps/instance/contracts/api.ts`. Group publishing,
roster, and session/attendance routes live under `worker/features/groups`.
The management protocol remains separate from ordinary application API types.

Run `pnpm verify`. Release and live-readiness requirements are described in
[Releases](releases.md), [GA readiness](ga-readiness.md), and
[Maintenance](maintenance.md).
