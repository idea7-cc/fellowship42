# Lifecycle manifests and doctor

`f42ctl` is the public lifecycle boundary shared by self-managed operators,
certified partners, and Fellowship42 Cloud. Its first shippable increment owns
three versioned contracts: desired deployment state, a deterministic plan, and
a bounded diagnostic report. It does not require or create a management
connection.

## Desired deployment state

`deploymentManifestSchema` is exported by
`@fellowship42/management-protocol`. A manifest describes one portable,
single-church installation:

- portable `instance_id`, custody, operator, and target environment;
- exact application, D1 schema, protocol package, and protocol wire versions;
- immutable release-manifest URL, SHA-256 digest, and source commit;
- Worker name and public domains;
- D1, R2, Queue, dead-letter Queue, Durable Object, and schedule bindings; and
- non-secret Access and payment-adapter configuration state.

It intentionally excludes Cloudflare account IDs, provider resource IDs,
tokens, API keys, private keys, Access audiences, webhook secrets, church data,
and control-plane customer IDs. `accountAlias` is an operator-local label, not
a portable identity or credential.

Production manifests require Access configuration. Queue and dead-letter Queue
names must differ. Unknown fields and release coordinates that are not exact
fail schema validation.

The checked-in example is pinned to the published `v0.6.0` release:

```bash
pnpm f42ctl plan \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json
```

## Deterministic deploy plan

`plan` canonicalizes the validated manifest, records its SHA-256 digest, and
emits the same ordered dependency graph for the same semantic input regardless
of JSON key order. The eleven current steps cover release verification,
dedicated storage and Queue resources, Worker configuration, migrations,
deployment, domains, Access, and runtime verification.

Every current step is explicitly `destructive: false`. `plan` itself remains
reviewable evidence only: it does not authenticate to Cloudflare or mutate
resources. The callable reconciliation library described below preserves that
preview/apply separation and requires an explicit operator-local account alias,
provider observation, and exact approval before execution.

Canonical JSON is also published from the side-effect-free
`@fellowship42/f42ctl/canonical` subpath. Worker and browser-compatible
consumers can combine it with Web Crypto without loading the Node filesystem or
CLI modules.

## Doctor evidence

`doctor` validates the desired manifest and inspects:

- the exact tagged release-manifest bytes, digest, source commit, schema, and
  protocol compatibility;
- committed Wrangler Worker, D1, R2, Queue/DLQ, Durable Object, cron, domain,
  and non-secret Access shape;
- the highest local numbered D1 migration; and
- optional public `/api/health` service/topology readiness.

Release downloads have a ten-second timeout and a 64 KiB limit. A digest match
is required before parsing. Redirected GitHub asset delivery is acceptable
only because the final bytes, strict manifest, expected versions, and source
commit are all verified.

```bash
pnpm f42ctl doctor \
  --manifest deployment-manifest.json \
  --runtime https://instance.example.org
```

Use `--offline` when network verification is deliberately unavailable. Use
`--output <new-file>` to create an evidence file without overwriting an
existing one. JSON is the only stdout output; diagnostics and failures go to
stderr. Exit code `2` means a report was produced with a failed check, while
exit code `1` means the command or input itself failed.

Checks expose enumerated IDs, statuses, and bounded machine codes—never raw
provider errors, credentials, member/donor data, counts, resource IDs, or
arbitrary payloads. A failed check makes the report `failed`; warning or
unknown evidence makes it `attention`; all checks must pass for `healthy`.

Portable identity is deliberately not inferred from a Worker name, D1 ID, or
Cloudflare account. The manifest value is configured explicitly as
`F42_PORTABLE_INSTANCE_ID`, and the public health endpoint returns only its
SHA-256 digest plus `awaiting-owner-configuration`, `awaiting-owner`,
`configured`, or bounded failure state. Doctor compares that evidence to the
manifest without exposing the identifier, owner selector, or church data.
Without runtime evidence the check remains `identity-runtime-check-required`.

## Callable reconciliation

`@fellowship42/f42ctl/reconciliation` is a Worker-safe public subpath for
provider-neutral observation, preview, and apply. It contains no Node built-in,
filesystem access, provider credential, or Cloudflare API implementation.

A provider adapter first returns exactly eleven ordered observations. Each has
the lifecycle step ID/kind, `absent`, `matching`, `drifted`, or `unknown` state,
an ownership class, an optional SHA-256 fingerprint, and a bounded machine code.
It cannot return a provider account/resource ID or arbitrary payload. Existing
provider resources require verified portable-instance ownership; unverified,
foreign, unknown, or contradictory observations produce a blocked preview.

`buildReconciliationPreview` recomputes the canonical manifest digest and a
separate desired-state fingerprint for every step. It emits only `none`,
`create`, `update`, `execute`, `verify`, or `blocked` changes, preserves the
dependency graph, and never emits a destructive change. The synthetic staging
fixture at `tooling/f42ctl/fixtures/reconciliation.staging.json` exercises a
clean, absent-resource preview without provider identifiers or credentials.

`executeDeploymentReconciliation` accepts only a ready preview and an approval
bound to its digest, the manifest digest, portable identity, and account alias.
Approvals expire within one hour. Before the first effect the executor
recomputes the plan, dependencies, allowed actions, and desired fingerprints.
It supplies an injected adapter the validated manifest, exact plan step,
expected actual fingerprint, stable operation ID, and derived per-step
idempotency key. Malformed outcomes and thrown provider errors become bounded
failure codes and stop later steps; raw responses are never copied into the
report. Reports store only the idempotency-key digest.

The adapter privately owns credentials and provider identifiers. Exact retry
behavior depends on its durable idempotency store. See
[ADR 0012](adr/0012-provider-neutral-reconciliation-and-scoped-adapters.md).

## Private consumer boundary

Fellowship42 Cloud may ingest a validated plan or doctor report as external
evidence and may call the public library from orchestration code. It must pin a
published protocol/CLI package and release artifact, reject unknown fields,
and keep provider identifiers and operational credentials in private adapter
state. It must not read the instance D1 database directly or reinterpret an
`attention` report as healthy.

The public reconciliation library now owns deploy preview/apply semantics, but
it does not itself provide Cloudflare transport or certify a live account.
Export collection, live cutover, enrollment, and management commands retain
their separate approval and trust paths.
