# Instance Worker changes

Read the root AGENTS.md. Keep church ownership in every query and prepared bind.
For a mutation, validate input, check permission, and atomically gate the write
and its audit/outbox evidence. A rejected conditional write must create no
success evidence. Participation uses each record's version, not its parent's.

Use `features/groups` as the example for separating related route surfaces.
Neutral response contracts belong in `../contracts`, never frontend `src`.
After adding a migration, update the runtime schema version and active test
inputs; preserve historical release fixtures. Test stale edits, competing
admission, permissions, and failure effects. Run the instance tests while
iterating and root `pnpm verify` before handoff.
