# `f42ctl`

`f42ctl` is the public, Apache-2.0 lifecycle tool for portable Fellowship42
instances. It validates desired-state manifests, produces deterministic
non-destructive deployment plans and reconciliation previews, executes approved
plans through an injected provider adapter, verifies immutable releases,
inspects local Wrangler/migration shape plus optional runtime health, and
assembles and verifies portable exports.

```bash
pnpm f42ctl plan \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json

pnpm f42ctl doctor \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json \
  --offline

pnpm f42ctl export \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json \
  --d1 ./database.sql \
  --r2-index ./r2-source.json \
  --r2-root ./r2-capture \
  --directory ./church-export \
  --quiesced-at 2026-07-19T21:00:00.000Z

pnpm f42ctl verify-export --directory ./church-export

pnpm f42ctl plan-import \
  --directory ./church-export \
  --destination ./destination-deployment.json

pnpm f42ctl verify-cutover \
  --plan ./import-plan.json \
  --destination ./destination-deployment.json \
  --approval ./cutover-approval.json
```

Omit `--offline` to download and verify the exact published release manifest.
Add `--runtime https://instance.example.org` to include `/api/health`. Both
commands write versioned JSON to stdout. `--output <new-file>` uses exclusive
creation and will not overwrite an existing file.

The `plan` CLI is evidence, not execution. It contains no credential, provider
account ID, or destructive step. The callable, Worker-safe
`@fellowship42/f42ctl/reconciliation` subpath adds strict provider observations,
desired-state diff, one-hour digest-bound approval, and idempotent sequential
execution through an injected adapter. The adapter privately owns scoped
credentials and provider IDs; neither enters public evidence. See
[`docs/lifecycle-manifests-and-doctor.md`](../../docs/lifecycle-manifests-and-doctor.md)
and the payload-safe staging fixture in `fixtures/reconciliation.staging.json`.

Portable export collection, bundle sensitivity, and the strict input/output
formats are documented in [`docs/portable-exports.md`](../../docs/portable-exports.md).
Import staging, the provider-adapter boundary, credential rotation, and cutover
approval are documented in
[`docs/portable-import-and-cutover.md`](../../docs/portable-import-and-cutover.md).
The callable `runPortableRestoreConformance` suite drives the real assembly,
verification, planning, and staged-restore functions through injected success,
nonempty-destination, and partial-failure adapters. It stops before cutover and
emits only the strict public payload-free report in
`portable-restore-conformance.v1.json`; it never emits bundle contents or
provider identifiers.
`buildMigrationRehearsalEvidence` verifies the complete plan, restore report,
church-owner approval, completion report, credential disposition, and adapter
observations. Run `pnpm test:migration-rehearsal` at repository root to execute
the public hosted-to-church-owned compatibility fixture.

The CLI is expected to add:

- `f42ctl deploy` — wrap the callable reconciliation library with an
  operator-selected provider adapter;
- `f42ctl connect` — explicitly enroll with compatible management software;
- `f42ctl disconnect` — revoke management locally;

Fellowship42 Cloud must call these same public contracts and reconciliation
library rather than maintaining a private deployment implementation.
