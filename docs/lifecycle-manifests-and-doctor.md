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

Every current step is explicitly `destructive: false`. The plan is reviewable
evidence only: it does not authenticate to Cloudflare or mutate resources.
Future reconciliation must preserve preview/apply separation and require an
explicit target account at execution time.

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
Cloudflare account. The current public health endpoint does not reveal it, so
doctor reports `identity-runtime-check-required`. A future locally authorized
endpoint or offline D1 inspection may prove it without weakening privacy.

## Private consumer boundary

Fellowship42 Cloud may ingest a validated plan or doctor report as external
evidence and may call the public library from orchestration code. It must pin a
published protocol/CLI package and release artifact, reject unknown fields,
and keep provider identifiers and operational credentials in private adapter
state. It must not read the instance D1 database directly or reinterpret an
`attention` report as healthy.

Active resource reconciliation, export, import, cutover, enrollment, and
management commands are later lifecycle increments and must not be inferred
from these evidence-only commands.
