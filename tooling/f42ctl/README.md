# `f42ctl`

`f42ctl` is the public, Apache-2.0 lifecycle tool for portable Fellowship42
instances. The current first increment validates desired-state manifests,
produces deterministic non-destructive deployment plans, verifies an immutable
release manifest, and inspects local Wrangler/migration shape plus optional
runtime health.

```bash
pnpm f42ctl plan \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json

pnpm f42ctl doctor \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json \
  --offline
```

Omit `--offline` to download and verify the exact published release manifest.
Add `--runtime https://instance.example.org` to include `/api/health`. Both
commands write versioned JSON to stdout. `--output <new-file>` uses exclusive
creation and will not overwrite an existing file.

The deployment plan is evidence, not execution. It contains no credential,
provider account ID, or destructive step. Resource creation/reconciliation is
the next lifecycle increment.

The CLI is expected to provide:

- `f42ctl deploy` — reconcile one instance in a target Cloudflare account;
- `f42ctl export` — produce a checksummed D1/R2/configuration export bundle;
- `f42ctl import` — create a destination instance without reusing secrets;
- `f42ctl connect` — explicitly enroll with compatible management software;
- `f42ctl disconnect` — revoke management locally;
- `f42ctl verify-export` — validate an export without deploying it.

Fellowship42 Cloud must call these same public contracts and reconciliation
library rather than maintaining a private deployment implementation.
