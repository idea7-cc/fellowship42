# `f42ctl` roadmap

`f42ctl` will be the public, Apache-2.0 lifecycle tool for portable Fellowship42
instances. This directory records that ownership now; it does not yet contain a
shippable CLI.

The CLI is expected to provide:

- `f42ctl deploy` — reconcile one instance in a target Cloudflare account;
- `f42ctl doctor` — verify bindings, schema, domains, and runtime health;
- `f42ctl export` — produce a checksummed D1/R2/configuration export bundle;
- `f42ctl import` — create a destination instance without reusing secrets;
- `f42ctl connect` — explicitly enroll with compatible management software;
- `f42ctl disconnect` — revoke management locally;
- `f42ctl verify-export` — validate an export without deploying it.

Fellowship42 Cloud must eventually call the same public reconciliation and
migration library rather than maintaining a private deployment implementation.
