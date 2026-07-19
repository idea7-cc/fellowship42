# `f42ctl`

`f42ctl` is the public, Apache-2.0 lifecycle tool for portable Fellowship42
instances. It validates desired-state manifests, produces deterministic
non-destructive deployment plans, verifies immutable releases, inspects local
Wrangler/migration shape plus optional runtime health, and assembles and
verifies portable exports.

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
```

Omit `--offline` to download and verify the exact published release manifest.
Add `--runtime https://instance.example.org` to include `/api/health`. Both
commands write versioned JSON to stdout. `--output <new-file>` uses exclusive
creation and will not overwrite an existing file.

The deployment plan is evidence, not execution. It contains no credential,
provider account ID, or destructive step. Resource creation/reconciliation is
the next lifecycle increment.

Portable export collection, bundle sensitivity, and the strict input/output
formats are documented in [`docs/portable-exports.md`](../../docs/portable-exports.md).

The CLI is expected to add:

- `f42ctl deploy` — reconcile one instance in a target Cloudflare account;
- `f42ctl import` — create a destination instance without reusing secrets;
- `f42ctl connect` — explicitly enroll with compatible management software;
- `f42ctl disconnect` — revoke management locally;

Fellowship42 Cloud must call these same public contracts and reconciliation
library rather than maintaining a private deployment implementation.
