# Fellowship42 handover

Updated: 2026-09-05.

Start with [Current state](current-state.md), [Architecture](architecture.md),
[Repository strategy](repository-strategy.md), and [Maintenance](maintenance.md).
`AGENTS.md` remains authoritative for invariants; `pnpm verify` owns validation.

Working source is ahead of published v0.26.0. Migrations 0009 and 0010 add
independent participation and membership versions and must be applied before
the updated Worker. Existing
release fixtures and published checksums remain historical evidence.

The public instance is independently useful. Member self-service identity is
still proposed, and live security, payment, restore, exit, and pilot evidence
remain necessary before broader production claims. See [GA readiness](ga-readiness.md).

For a normal feature change, start with its browser route/component, neutral
`contracts/api.ts`, Worker feature/routes, and corresponding Workers/DOM tests.
For group participation, start in `worker/features/groups/` and
`test/participation.spec.ts`; for team membership, `worker/features/team/` and
`test/team.spec.ts`. For ownership, management trust, or authentication
changes, consult and update the owning ADR before implementation.
