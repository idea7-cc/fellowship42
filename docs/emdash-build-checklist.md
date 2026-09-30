# EmDash website build checklist

Working branch: `build/emdash-church-websites`. Plan:
[emdash-website-plan.md](emdash-website-plan.md). Decision:
[ADR 0027](adr/0027-emdash-church-websites.md). Evidence and limitations:
[build handoff](emdash-build-handoff.md). This checklist is the resumable
progress record.

## Workstreams

- [x] Reliability defects: contribution save/retry, record switching,
      attendance history, similar create retries, editor time zones
- [x] Public website contract v1 in the instance and
      `@fellowship42/website-contract`
- [x] Instance: cross-origin media, media status codes, `WEBSITE_ORIGIN`
      redirect, owner website card and setup claim
- [x] `@fellowship42/emdash` trusted plugin: blocks, renderers, status page
- [x] `fellowship42-connect` registry artifact, validated locally
- [x] `apps/website`: theme, seed, setup gate, cache policy
- [x] Lifecycle inventory, manifest, export/import/exit, and fixtures
- [x] Repository gates: boundaries, verify, typegen
- [x] Documentation: architecture, deployment, website guide, AGENTS
- [x] Evidence: `pnpm verify`, `pnpm acceptance:fellowship42-first`,
      `pnpm acceptance:emdash-first`
- [ ] Independent multi-lens review findings resolved
- [ ] Handoff finalized for Codex review

## Resume here

1. `git log --oneline 61d4ff7..HEAD` shows the build history.
2. Run `pnpm verify`, then both acceptance scripts (see the handoff).
3. Continue from the first unchecked item.

## Toolchain

`mise x node@26.9.0 -- npx -y pnpm@12.4.2 <script>` on machines without a pnpm
shim. EmDash 1.0.1, Astro 7.3, `@astrojs/cloudflare` 14.3.3.
