# EmDash website build checklist

Working branch: `build/emdash-church-websites`. Plan:
[emdash-website-plan.md](emdash-website-plan.md). Decision:
[ADR 0027](adr/0027-emdash-church-websites.md). This checklist is the
resumable progress record; the final evidence lives in the handoff.

## Workstreams

- [ ] Reliability defects: contribution save/retry, record switching,
      attendance history (plus similar create retries and editor timezones)
- [ ] Public website contract v1 in the instance and
      `@fellowship42/website-contract`
- [ ] Instance changes: cross-origin media, media status codes, `WEBSITE_ORIGIN`
      redirect, owner website card and setup claim
- [ ] `@fellowship42/emdash` native plugin: blocks, renderers, status page
- [ ] `fellowship42-connect` registry artifact, validated locally
- [ ] `apps/website` EmDash site: theme, seed, setup gate, cache policy
- [ ] Lifecycle inventory, manifest, export/import/exit, and fixtures
- [ ] Repository gates: boundaries, verify, CI, typegen
- [ ] Documentation: architecture, deployment, website guide, AGENTS
- [ ] Evidence: both setup paths, lifecycle cases, access boundaries, browser
      journeys, `pnpm verify`
- [ ] Handoff for Codex review

## Toolchain

`mise x node@26.9.0 -- npx -y pnpm@12.4.2 <script>` on machines without a pnpm
shim. EmDash 1.0.1, Astro 7.3, `@astrojs/cloudflare` 14.3.3.
