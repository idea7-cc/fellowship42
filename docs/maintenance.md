# Maintenance workflow

## Verification

Use `.node-version` and the `packageManager` in `package.json`. Install with
`pnpm install --frozen-lockfile`. Run `pnpm verify` before handoff; this is the
same command CI uses. Individual package tests and `pnpm lint` are useful while
iterating. `pnpm format` normalizes maintained code; `pnpm format:check` checks it.
Generated bindings, release fixtures, and historical evidence are excluded from
formatting. Do not rewrite immutable inputs to satisfy a style tool.

The verification command owns the checklist. Contributor and agent instructions
link to it instead of maintaining independent command lists. Tagged release
assembly additionally requires a clean commit and the release-specific checks.

## Feature organization

Keep HTTP composition thin. A substantial feature may own its routes, validated
inputs, service operations, persistence helpers, and regression tests. Small
features do not need empty layers. Preserve existing public import surfaces
while extracting internals. Avoid unrelated renames during behavioral fixes.

Neutral API contracts may be shared between browser and Worker code. They must
not import either runtime. Packages cannot import applications; the import graph
checker resolves TypeScript aliases and rejects forbidden edges and runtime
cycles. Its fixtures intentionally violate boundaries to test enforcement.

## Tests and evidence

Test observable authorization, conflict, retry, and failure behavior, including
absence of writes/audit events after rejected mutations. DOM interaction tests
cover asynchronous UI state; static HTML assertions do not replace them.
Cloudflare tests cover the real D1/runtime boundary. Neither constitutes live
provider, recovery, pilot, or security certification.

Record implementation maturity separately from live evidence. Keep current-state
documents concise, preserve ADRs and immutable historical fixtures, and describe
remaining engineering work explicitly rather than labeling every gap external.
