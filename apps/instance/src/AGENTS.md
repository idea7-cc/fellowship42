# Instance browser changes

Read the root AGENTS.md and docs/ui-design-system.md. Browser permissions are
presentation only; the Worker authorizes every operation. API shapes live in
`../contracts`. Queries and mutation completions must be scoped to the current
record and ignore stale responses after navigation or unmount.

Submit the observed version for edits and deletes. On conflicts preserve user
input and explain that fresh data is needed. Creates that can be retried send
a per-entry `Idempotency-Key` from `useEntryKey` (`src/lib/entry-key.ts`),
keep it across uncertain failures, and describe those failures honestly with
`describeEntryFailure`. Add DOM interaction regressions
for async behavior (`pnpm --filter @fellowship42/instance test:ui`), and finish
with root `pnpm verify`.
