# Instance Worker changes

Read the root AGENTS.md. Keep church ownership in every query and prepared bind.
For a mutation, validate input, check permission, and atomically gate the write
and its audit/outbox evidence. A rejected conditional write must create no
success evidence. Participation uses each record's version, not its parent's.

Use `features/groups` as the example for separating related route surfaces.
Neutral response contracts belong in `../contracts`, never frontend `src`.
Schema changes edit `migrations/0001_initial.sql` in place, as the root Stage
section says; update active test inputs and leave historical release fixtures
alone. Test stale edits, competing
admission, permissions, and failure effects. Run the instance tests while
iterating and root `pnpm verify` before handoff.
