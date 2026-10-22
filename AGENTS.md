# Fellowship42 repository instructions

This is the public Fellowship42 repository. The product invariants and
boundaries below are authoritative; `Working here` says what to read for a
given change.

## Non-negotiable product invariants

1. One Fellowship42 deployment is one portable church instance and one
   operational, ownership, backup, and migration boundary.
2. The open-source instance must remain fully useful without Fellowship42
   Cloud, a partner, or any private service.
3. Management is optional and revocable. Disconnecting it must not break the
   instance, remove data, or block export.
4. A church-owned Cloudflare account is the strongest ownership mode. Hosted
   and partner-operated modes must preserve a documented exit path.
5. Use standard HTTPS and well-reviewed cryptography for management transport.
   Do not invent encryption. MCP may adapt the management API for AI clients;
   it is not the durable fleet protocol.
6. Private billing, fleet orchestration, partner administration, and dashboard
   code must never be added to this repository.

## Stage: iterate

This is the pre-alpha policy other documents refer to. Fellowship42 has no
deployed instances and no users. Until a working alpha is declared and early
testing starts, speed wins over compatibility:

- `apps/instance/migrations/0001_initial.sql` is the whole schema and is edited
  in place. Do not add numbered migrations, expand/contract steps, or data
  backfills. The schema version stays at `1`. After changing the schema, reset
  local state with `rm -rf apps/instance/.wrangler/state` and rerun
  `pnpm db:migrate && pnpm db:seed`.
- Breaking changes to routes, API shapes, contracts, and UI paths are fine. Do
  not add compatibility shims, legacy redirects, deprecation paths, or dual
  code paths.
- `release-upgrade-policy.json` declares no eligible upgrade sources. Tagged
  releases are snapshots for reference and provenance, not upgrade targets.
  Nothing has to be applied "before running the new Worker".
- Deterministic lifecycle contracts and their fixtures stay green because they
  are synthetic; do not invest in live upgrade, restore, or exit evidence for
  pre-alpha changes.
- The ADR rule under `Working here` still applies. Nothing else needs a
  decision record.

Revisit this section when the alpha is declared.

## Repository boundaries

- `apps/instance` is the deployable church application. It contains the React
  UI, Hono API, D1 migrations, R2 integration, and Durable Objects.
- `apps/website` is the church's EmDash website, a component of the same
  deployable installation, not a second instance. Lifecycle contracts list its
  D1, R2, and session KV beside the instance, and
  `FELLOWSHIP42_INSTANCE_SHA256` pins it to `instance_metadata`, which remains
  the only portable identity. It reads church records only through the public
  website contract. See ADR 0027.
- `apps/project-site` is the public project/community site. It is not the
  hosted-service dashboard.
- `packages/management-protocol` is the public, versioned contract shared with
  optional management software. It must not import an application or private
  control-plane package.
- `packages/website-contract` is the public, versioned, read-only contract for
  published church content. It must not import an application package.
- `packages/emdash` (the trusted EmDash integration) and
  `packages/emdash-connect` (the sandboxed registry connector) are public
  integration packages built on the website contract.
- `packages/brand` is public shared presentation code.
- `tooling/f42ctl` is reserved for portable provisioning, export, import,
  verification, and management enrollment tooling.
- The separate private repository is named `fellowship42-cloud`. It consumes
  published protocol packages and pinned Fellowship42 release artifacts.

Dependency direction is one-way:

```text
apps/instance ──► packages/management-protocol
       │    └───► packages/website-contract
       └────────► packages/brand

apps/website ───► packages/emdash ───► packages/website-contract
       │    └───► packages/website-contract
       └────────► packages/brand
packages/emdash-connect ──► packages/emdash, packages/website-contract

fellowship42-cloud (separate private repo)
       └────────► published management protocol + release artifacts
```

The website never imports instance code and never reads the instance's D1;
church content crosses between them only through the website contract over
HTTPS (or a same-account service binding when the deployment pins the
instance address).

The public instance must never import from the private repository. The private
repository must operate instances through public contracts rather than private
database access or unpublished application internals.

## Data and security rules

- Keep `church_id` checks and composite tenant foreign keys even though the
  deployment boundary is a single church. They remain defense in depth and
  preserve explicit domain ownership.
- `instance_metadata` is the singleton portable installation identity. Do not
  use a Cloudflare account ID, Worker name, D1 ID, or control-plane customer ID
  as the portable instance ID.
- Never put Cloudflare credentials, management private keys, Access JWTs,
  production exports, donor data, or member data in source control or logs.
- Management capabilities are deny-by-default, independently revocable, and
  audited. Infrastructure deployment credentials are separate from instance
  management credentials.
- D1 is authoritative. R2 objects require D1 authorization metadata. Durable
  Objects coordinate realtime state and do not become the business record.
- Keep browser state out of authorization decisions. Validate input and use
  prepared D1 statements.
- The public website contract (`/api/website/v1`) never reads identity and
  returns only published, allowlisted fields. Adding a field there is a public
  disclosure; review it like one.

## Working here

- Before changing the system shape, read `README.md`, `docs/architecture.md`
  and `docs/repository-strategy.md`. `docs/handover.md` says where a normal
  feature change starts. Read `docs/management-protocol.md` for management
  changes and `docs/ui-design-system.md` for UI work. Folder rules live in
  `apps/instance/src/AGENTS.md` and `apps/instance/worker/AGENTS.md`.
- Cloudflare work follows the shared Cloudflare preferences. Here,
  `pnpm cf-typegen` regenerates binding types after a Wrangler change, and the
  instance's background delivery goes through its outbox Queue.
- Run `pnpm verify` before handing off a code change; CI runs the same on every
  pull request. Its task list in `package.json` is authoritative.
- Tagged releases and management-protocol packages follow `docs/releases.md`.
  The private repository must pin a published artifact and checksum; it must
  not consume a relative checkout or an unpublished public branch.
- Any change to ownership, deployment topology, management trust, repository
  boundaries, portability, authentication, or data custody requires an ADR in
  `docs/adr`.

<!-- agent-guidance:start -->
## Shared agent guidance

Deliver the requested outcome with code that is easy to read and change. The
task and the project's own instructions come first; these are defaults.

- Read the owning code and its callers before changing it. Give each behavior
  and each kind of state one clear owner. Keep related logic together,
  interfaces small, names concrete, and persistence and external calls visible.
- Take the smallest complete change: leave out what the task doesn't need, then
  reuse existing code, the platform and installed dependencies before writing
  new code. Avoid generic helper buckets, pass-through layers and speculative
  extension points. A focused refactor is often the simplest complete change.
- When you replace something, update its callers and delete the old path in the
  same change. Keep compatibility only for consumers the project's stage
  statement names; without one, ask before breaking something people use.
- Treat confusing ownership, duplicated policy and leftover old paths as defects
  when they would make the next likely change harder, even if tests pass. Name
  the consequence and the fix; a different taste is not a defect.
- Make routine reversible decisions and keep going. Ask before changing product
  direction, authority or a support promise. Protect other people's work,
  secrets and real content.
- Remove each worktree you create once its branch merges or is dropped, after
  pushing what isn't merged; its build output can reach tens of gigabytes.

### Verify in proportion

Check what the change could break, with the cheapest check that would catch it.

- Code changes: the project's fast gate (lint, types and unit tests unless it
  names another) and the tests for the code you touched, and look at the result
  when it's user-visible. Keep the main branch green on that gate. Add a test
  for a meaningful failure, not one that restates the implementation.
- Slow suites, other platforms, live runtimes and the review seat belong at
  checkpoints: a release, a build others will use, the end of a batch, a spike
  whose experiment is the test, and any the project declares. Run those its
  changes bear on. A build for whoever directs the work, which they can undo, is
  tested by their use. Keep CI within budget. When a checkpoint fails, fix the
  change that broke it, and move a check that would have caught it sooner into
  the fast gate.
- Breaks you can't take back: either make the effect reversible and check that
  the undo works, or prove before it takes effect that it won't break. Take
  whichever is cheaper and faster for this change, never both, and say which and
  why.
- A failure the change can't cause doesn't hold it up: confirm it's unrelated,
  report it so it gets fixed, and carry on.

These are defaults. When you predict a cheaper way to the same confidence, take
it and say so.

### Examples

- A button label: check the rendered wording. No plan document, no extra reviewer.
- A docs or comment change: check its syntax and links; code tests can't catch
  what it breaks. A CI change: check which events and jobs will run.
- A new operation used by two interfaces: one definition and implementation,
  thin callers, focused tests.
- A confusing internal API: replace it, update the callers, delete the old one.
- A data format no supported consumer relies on: change it, update readers and
  writers, rebuild fixtures and test data. No compatibility layer.
- Replacing stored data in place: keeping the previous copy and testing its
  restore is often cheaper than proving every import path is safe.

Later stages add checkpoints when a project declares them: real-runtime checks
for a capability being validated, and the declared release checks before
customers rely on it.

Report what changed, what you checked and what remains unproved. Don't create
plans, contracts or decision records for routine work; leave a short note only
when another session will need it.

This project's CI budget is US$7 a month (wayof7's default).

### Read when relevant

- `.agent-guidance/guidance/code-design.md`: Where code belongs, small interfaces, visible effects, replacing old paths and truthful contracts.
- `.agent-guidance/guidance/proportional-verification.md` (trial): Where expensive checks go (a fast gate per change, the rest at checkpoints), how to protect against breaks you can't take back, the review seat, and how proof grows by stage.
- `.agent-guidance/preferences/models.md`: Preferred models for kinds of work.
- `.agent-guidance/preferences/review-seat.md` (trial): Who fills the independent, adversarial review seat.
- `.agent-guidance/preferences/technology.md`: Preferred stacks and providers.
- `.agent-guidance/roles/builder.md`: What good building work looks like.
- `.agent-guidance/roles/planner.md`: What a useful plan for a substantial or ambiguous request looks like.
- `.agent-guidance/roles/reviewer.md`: What a useful review looks like.
- `.agent-guidance/blueprints/web-app.md`: A starting shape for a web application or content site.
- Skill `guidance-design-change`: Design substantial code changes, new module boundaries or significant technology choices.
- Skill `guidance-review-change`: Review code changes for defects, unclear ownership, hidden effects and leftover old paths.
- `.agent-guidance/REFERENCES.md`: The sources these ideas build on.

`python3 .agent-guidance/query.py find --task "<the task>"` suggests guidance for a task,
and `pref <key>` reads one preference. Run them from the project root.

### Keeping guidance current

- If a pull or rebase brings changes to `.agent-guidance/` or this section mid-task,
  reread this section, say in your report what changed, and redo finished work only
  if the change requires it.
- When you're corrected on how you worked, find guidance that contradicts the task,
  the code or other guidance, or work out something another project would need,
  append one line to `.agent-guidance/evidence.jsonl`:
  `{"date": "YYYY-MM-DD", "item": "<item id, if one applies>", "note": "what happened"}`.

This section is generated from wayof7. Change shared guidance there, not here;
keep project instructions outside this section.
<!-- agent-guidance:end -->
