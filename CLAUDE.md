# Fellowship42 contributor context

`AGENTS.md` is the authoritative repository and architecture instruction file.
Read it first, followed by:

- `docs/architecture.md`
- `docs/repository-strategy.md`
- `docs/management-protocol.md`
- `docs/handover.md`
- `apps/instance/README.md`

For UI work, also read `docs/ui-design-system.md`. For binding changes,
regenerate `apps/instance/worker-configuration.d.ts` with `pnpm cf-typegen`.

Required checks are `pnpm check:architecture`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and the relevant deployment dry-run.
