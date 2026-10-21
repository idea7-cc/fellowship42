# EmDash church websites: build handoff

Prepared 2026-09-30 by the builder (Claude Opus 5.5) for Codex's independent
review. Plan: [emdash-website-plan.md](emdash-website-plan.md). Decision:
[ADR 0027](adr/0027-emdash-church-websites.md). Nothing here is published or
deployed; all evidence is **local** (see [Evidence scope](#evidence-scope)).

**Review outcome (2026-10-21).** GPT-6.1 Sol (Codex, xhigh) reviewed
`61d4ff7...ef9ee59` in pull request #57 and found no blocking authority,
disclosure, boundary or lifecycle findings. Its one should-fix finding, a
title-only edit moving an event in the repeated daylight-saving hour an hour
earlier, is fixed in `6b4191b` with a regression test. A deliberately entered
time in that repeated hour still resolves to its first occurrence, as
`fromZonedInputValue` documents.

## Revision under review

- Branch `build/emdash-church-websites`, based on `61d4ff7` (the plan commit).
- Review the whole change with `git diff 61d4ff7...build/emdash-church-websites`
  and the history with `git log --oneline 61d4ff7..build/emdash-church-websites`.
- The branch merges two reviewed work branches: `build/emdash-defects`
  (reliability defects) and `build/emdash-lifecycle` (lifecycle inventory).
- An independent multi-lens review of the branch confirmed 48 findings. All
  are fixed in the `review/stream-*` merges (`a7d2909`, `3db7116`, `5387a00`)
  and the commits after them, and each fix was re-verified.
- Evidence revision: `9d2e4e3`, a clean tree. Both acceptance journeys ran
  there. `pnpm verify` passed at `202f4b9`; `9d2e4e3` adds only this handoff
  and the checklist. Later commits change only this file.

## What changed

| Area                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reliability             | Retry-safe creates with per-entry idempotency keys (contributions, people, households, group sessions, media); honest success/uncertain-outcome reporting; record editors and panels scoped to one record with stale-response guards; attendance registers keep marks across roster changes with `rosterStatus`; course completion dates kept; event times entered and listed in the event's zone; sermon dates as calendar dates |
| Public website contract | `/api/website/v1` (descriptor, church, events, sermons, groups, courses): anonymous, identity-independent, published-only allowlists, keyset cursors, absolute URLs, UTC instants with IANA zones, `no-store`, CORS `*`, CORP `cross-origin`. Package `@fellowship42/website-contract`                                                                                                                                            |
| Instance                | Cross-origin public media; media returns 200 for plain GETs and 304 for revalidation; http(s)-only sermon video links; `/` redirects to `WEBSITE_ORIGIN`; owner-only website setup claim (audited); Settings **Website** card                                                                                                                                                                                                     |
| Integration             | `@fellowship42/emdash` (trusted): six church Portable Text blocks and Astro renderers, theme components, Block Kit status page, home-page JSON-LD, deployment-pinned or Administrator-set connection, service-binding transport. `fellowship42-connect` (sandboxed registry artifact): connection, status, public data routes, JSON-LD                                                                                            |
| Website                 | `apps/website`: EmDash 1.0.1 on Cloudflare with its own D1, R2, and session KV; church preset theme; seeded church pages, article, and menu with built-in church-page fallbacks; setup gate requiring the owner claim; uncached public HTML                                                                                                                                                                                       |
| Lifecycle               | Optional `website` component across the manifest, plan, doctor, reconciliation, export/import, restore conformance, exit packets, and rehearsal; website and instance-only rehearsal fixtures                                                                                                                                                                                                                                     |
| Gates                   | Boundaries and manifest for the new app and packages; `verify` builds, typechecks, tests, and dry-run-deploys the website; deterministic Worker typegen                                                                                                                                                                                                                                                                           |
| Docs                    | ADR 0027; [EmDash church websites](emdash-church-websites.md); [public website contract](website-contract.md); architecture, deployment, security, AGENTS, README, lifecycle runbooks                                                                                                                                                                                                                                             |
| Evidence                | `scripts/acceptance/fellowship42-first.mjs`, `scripts/acceptance/emdash-first.mjs`, `scripts/acceptance/local-dev-journey.mjs`                                                                                                                                                                                                                                                                                                    |

## Key decisions

- **Two Workers, one installation.** EmDash's schema collides with the
  instance's (`media`, `users`), so the website has its own D1 and R2. It is a
  component of the installation, pinned to `instance_metadata` by
  `FELLOWSHIP42_INSTANCE_SHA256`, not a second identity.
- **No copies, no privileged connection.** Blocks store display choices only
  and render published records at request time. No credential crosses between
  the apps, so nothing needs revoking. The contract is the only cross-origin
  surface.
- **Trusted package plus registry artifact.** EmDash 1.0.1's registry carries
  only sandboxed plugins, which cannot declare Portable Text blocks, ship Astro
  components, use service bindings, or reach private addresses (verified in
  the 1.0.1 source and by running the CLI). The blocks therefore ship as a
  trusted npm package; the registry artifact is the no-deploy subset.
- **Connection authority.** Deployment variables pin the connection and
  override settings; otherwise only EmDash Administrators (`plugins:manage`)
  can change it. An identity-digest mismatch is a deliberate state.
- **Editor sign-in.** EmDash's own passkeys and invitations; no Fellowship42
  permissions for editors. EmDash's first-come setup is closed by a ten-minute,
  audience-bound HMAC claim an owner mints in Fellowship42. SSO is deferred.
- **EmDash configuration.** `fonts: false`, `updateCheck: false`, and
  `registry: false` (offline, deterministic, no outbound pings);
  `imageService: 'passthrough'`; D1 sessions left at the default
  (`session: 'auto'` hangs with `global_fetch_strictly_public`).
- **Local hostnames.** The website runs at `www.localhost` locally so the two
  apps have separate passkey relying parties, as in production.

## Tested versions

Node 26.9.0, pnpm 12.4.2, EmDash 1.0.1 and `@emdash-cms/cloudflare` 1.0.1,
Astro 7.3.3 (repository site) and 7.3.5 (independent EmDash-first site),
`@astrojs/cloudflare` 14.3.3, `@astrojs/react` 6.0.6, React 19.3.0, Wrangler
4.133.0 (repository) and 4.144.0 (independent site, workerd 1.20260926.1), `@emdash-cms/plugin-cli`
0.13.1, `@emdash-cms/plugin-test` 0.2.6, `@emdash-cms/registry-verification`
0.3.3, playwright-core 1.63.0 with Chromium 153, axe-core 4.13.0.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm verify                              # repository gate (about 4 minutes)
pnpm acceptance:fellowship42-first       # browser journey, production builds
pnpm acceptance:emdash-first             # independent EmDash site from packed tarballs
pnpm --filter @fellowship42/emdash-connect test   # sandbox tests + registry bundle check
```

The acceptance scripts need Chromium (`CHROMIUM_PATH`, default
`/usr/bin/chromium`) and network access to install the independent site's
dependencies. They use ports 8787/8788 and 8797/8799 and isolated state under
`/tmp/f42-acceptance`. The Fellowship42-first journey writes
`/tmp/f42-acceptance/fellowship42-first/evidence.json` and screenshots beside
it. The EmDash-first proof writes `/tmp/f42-acceptance/emdash-first.json`.

The documented local evaluation in
[EmDash church websites](emdash-church-websites.md#local-evaluation) runs
against `pnpm dev` and `pnpm dev:website`. After following its commands, run
`node scripts/acceptance/local-dev-journey.mjs` to drive its browser steps.

## Acceptance evidence

All results are local, at the evidence revision above. Each journey
record names the commit it ran on and whether the tree was clean.

| Plan outcome               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Result                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Existing reliability       | Instance tests: `create-retries.spec.ts`, `idempotency.spec.ts`, and `ui/create-retries.spec.tsx` cover an uncertain contribution retry and lost-response creates. `ui/record-switching.spec.tsx` covers switching records while a load or save is outstanding. `attendance-history.spec.ts` and `ui/attendance-history.spec.tsx` cover history after roster changes.                                                                                                                                                                                  | Pass (`pnpm verify`)                  |
| Fellowship42-first setup   | Fellowship42-first journey, 10 checks: homepage redirect; unpublished notice; setup and OAuth start refused without an owner claim; owner passkey sign-in; Settings **Website** card; claim and EmDash passkey setup; setup closed after the first Administrator; publishing in Settings; name and tagline from the profile; identity pin. The local dev journey runs the guide's steps against the dev servers.                                                                                                                                       | 10/10; dev journey 4/4                |
| EmDash-first setup         | EmDash-first proof, 17 setup checks. An independent EmDash 1.0.1 site installs the packed tarballs and creates its own Administrator. The Administrator connects in the browser settings form. The site renders exactly the contract's records, order, and paging for each block, with no-cache pages, labelled blocks, and JSON-LD.                                                                                                                                                                                                                   | 17/17                                 |
| Editorial work             | Fellowship42-first journey, 6 checks run as an invited Editor in EmDash's admin UI: create a page and insert a church block; a private preview shows the draft; publishing makes it public; an edit to a published page stays private until published; an article is written and published.                                                                                                                                                                                                                                                            | 6/6                                   |
| Church-content lifecycle   | Fellowship42-first journey, 11 checks: publish, edit, withdraw, and delete; display and entry in the event's own time zone from a browser in another zone; paging through larger datasets; empty lists; cross-origin images and course links; unavailable-source notice; service-binding transport. EmDash-first proof, 11 checks: publish, edit, withdraw, and delete; unavailable and recovered source; wrong-church and malformed pins; private-address refusal. Contract and media guarantees: `website-contract.spec.ts`, `public-media.spec.ts`. | 11/11; 11/11                          |
| Access boundaries          | Fellowship42-first journey, 4 checks: a draft event stays private beside a staff session; an Editor cannot change the connection; an EmDash session confers no Fellowship42 access; disabling an Editor ends access. EmDash-first proof, 9 checks: anonymous, Editor, and Contributor limits; role removal and disabling; EmDash sessions confer no Fellowship42 access. Setup-claim and gate tests in `apps/website/test` and `packages/website-contract`.                                                                                            | 4/4; 9/9                              |
| Distribution and ownership | `packages/emdash-connect` test script: `emdash-plugin validate`, sandbox tests on `@emdash-cms/plugin-test`, and the offline registry bundle verifier (13 tests). Renderer requirements: [`packages/emdash/README.md`](../packages/emdash/README.md) and the website guide. Lifecycle: website and instance-only rehearsals; `management-protocol` and `f42ctl` tests.                                                                                                                                                                                 | Pass; rehearsals 13 and 10 assertions |
| Usability and verification | Fellowship42-first journey, 4 checks: mobile width; keyboard path through skip link, navigation, and content; axe-core with no serious or critical violations; server-rendered metadata. `pnpm verify` passes.                                                                                                                                                                                                                                                                                                                                         | 4/4; verify pass                      |

`pnpm verify` test counts:

| Package                            | Tests |
| ---------------------------------- | ----- |
| `apps/instance` (Workers)          | 191   |
| `apps/instance` (UI)               | 104   |
| `apps/website`                     | 46    |
| `packages/emdash`                  | 85    |
| `packages/emdash-connect`          | 13    |
| `packages/website-contract`        | 15    |
| `packages/management-protocol`     | 43    |
| `tooling/f42ctl`                   | 47    |
| Repository tooling (`node --test`) | 22    |

Journey totals: Fellowship42-first 35/35; EmDash-first 37/37 (17 setup, 9
access, 11 lifecycle); local dev journey 4/4. The Fellowship42-first journey
recorded one transport retry, on the Editor's refused
`POST /_emdash/api/plugins/fellowship42/admin` (see Local tooling below).

## Evidence scope

- **Local:** every result above. Both Workers ran as production builds under
  `wrangler dev` (workerd) on isolated synthetic D1/R2 state, driven by
  Chromium with virtual passkeys or by software passkeys through the real
  WebAuthn ceremonies. The local dev journey instead ran against the
  documented `pnpm dev` and `pnpm dev:website` servers.
- **Simulated provider:** the lifecycle rehearsals and restore conformance are
  deterministic, payload-free synthetic runs.
- **Deployed:** none. No Cloudflare account, custom domain, registry
  publication, or npm publication was used.

## Limitations and follow-ups

- **No deployment.** Nothing ran on Cloudflare. The website Worker is about
  4 MiB compressed, larger than the Workers Free plan script limit as I
  understand it; confirm against Cloudflare's current limits before relying on
  a plan. Custom domains, Access paths, and the same-account service binding
  are exercised only locally.
- **Not published.** `@fellowship42/website-contract`, `@fellowship42/emdash`,
  and `@fellowship42/emdash-connect` are not on npm, and `fellowship42-connect`
  is not in the EmDash registry. Its manifest uses the placeholder publisher
  `fellowship42.invalid`, which fails publisher pinning until it is replaced.
  The EmDash-first proof installs packed tarballs.
- **Registry install path.** The sandboxed connector is exercised through
  `@emdash-cms/plugin-test` (production sandbox boundary on workerd) and the
  offline bundle verifier, not a live registry install. Registry installs need
  Worker Loader, which needs a paid Workers plan.
- **Sandboxed connector reach.** EmDash refuses private and loopback hosts from
  sandboxed plugins, so the registry connector cannot be evaluated against a
  local instance. The trusted package refuses them too unless the deployment
  pins the URL or sets `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` for local
  evaluation. Neither guard resolves DNS, so DNS rebinding is out of scope.
- **Editor sign-in.** No single sign-on. EmDash accounts are managed in EmDash;
  removing a Fellowship42 owner stops new setup claims but does not remove
  EmDash accounts already created.
- **Existing behaviors kept.** Public media stays reachable at its URL after
  the record that referenced it is withdrawn (the documented media lifecycle).
  The instance fallback homepage (`/api/site`, used only without a website)
  still caps each list at 200; the website contract pages instead.
- **EmDash upstream quirks handled.** First-come setup (closed by the claim
  gate, including OAuth start routes); the setup wizard's title being ignored
  when a seed sets one (the seed sets none); `astro dev` keeping EmDash's
  development sign-in shortcut (production builds refuse it).
- **Local tooling.** `wrangler dev`'s proxy occasionally drops the request after
  one the Worker refused without reading its body ("Network connection lost").
  The journey retries only that logged transport failure and records each
  retry in `transportRetries`.
- **Cross-repository follow-up.** `fellowship42-cloud` must switch from enum
  `.options` to the protocol's `...For(false)` helpers when it adopts protocol
  1.14.0 (see `docs/management-protocol.md`).
- **Plan references.** `docs/emdash-website-plan.md` links the private Core7web
  repository; public readers cannot follow those links. The plan text was left
  as authored apart from its status line.
- **While Fellowship42 is unreachable** the website shows notices and the
  neutral style preset, because nothing is cached by design.
