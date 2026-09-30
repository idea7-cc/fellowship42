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
- D1, R2, Queue, dead-letter Queue, Durable Object, and schedule bindings;
- non-secret Access and payment-adapter configuration state; and
- optionally, the installation's EmDash website component.

It intentionally excludes Cloudflare account IDs, provider resource IDs,
tokens, API keys, private keys, Access audiences, webhook secrets, church data,
and control-plane customer IDs. `accountAlias` is an operator-local label, not
a portable identity or credential.

Production manifests require Access configuration. Queue and dead-letter Queue
names must differ. Unknown fields and release coordinates that are not exact
fail schema validation.

### Optional website component

A Fellowship42-first installation may include an EmDash website Worker
([ADR 0027](adr/0027-emdash-church-websites.md)). The website is part of the
same installation: it shares the manifest's portable identity, custody,
target, and deployment authority, and the topology stays `single-church`. An
installation may omit it and run only the instance.

```json
"website": {
  "cms": { "name": "emdash", "version": "1.0.1" },
  "worker": {
    "name": "fellowship42-website",
    "domains": ["www.example.org"]
  },
  "resources": {
    "d1": { "binding": "DB", "name": "fellowship42-website" },
    "r2": { "binding": "MEDIA", "name": "fellowship42-website-media" },
    "sessionKv": {
      "binding": "SESSION",
      "name": "fellowship42-website-session"
    },
    "instanceService": { "binding": "FELLOWSHIP42" },
    "schedules": ["* * * * *"]
  }
}
```

The website has one to eight domains, none shared with the instance, and its
own Worker, D1 database, and R2 bucket; EmDash and the instance both create
`media` and `users` tables. A website requires at least one instance domain
because it connects to the instance's public origin. `instanceService` is
`null` when the two Workers do not share an account. `SESSION` holds
disposable Astro/EmDash sessions: it is never exported and is recreated on
restore, like the instance's optional `OAUTH_KV`. EmDash applies its own core
migrations at runtime, so the website has no numbered SQL migrations; `cms`
records the EmDash version whose database schema the export carries.

The website Worker's non-secret variables are derived rather than declared.
The first domain listed for each Worker is its canonical origin:
`EMDASH_SITE_URL` is `https://` plus the first website domain,
`FELLOWSHIP42_URL` is `https://` plus the first instance domain, and
`FELLOWSHIP42_INSTANCE_SHA256` is the SHA-256 of the portable instance ID, the
same digest the instance health endpoint exposes as
`bootstrap.portableIdentitySha256`. The instance may set `WEBSITE_ORIGIN` so
that `/` redirects to the website; when set, it must equal `EMDASH_SITE_URL`,
because the instance mints the owner's setup claim for `WEBSITE_ORIGIN` and
the website accepts only claims for `EMDASH_SITE_URL`. Other website domains
are routed to the same Worker. `websiteOriginsFor(manifest)`, exported by
`f42ctl` and its reconciliation subpath, returns both canonical origins.
Secrets never appear in the
manifest: `EMDASH_ENCRYPTION_KEY` and the shared, setup-only
`WEBSITE_SETUP_SECRET` are covered in
[Portable import and cutover](portable-import-and-cutover.md#credential-disposition).

### Examples

`tooling/f42ctl/examples/deployment-manifest.local.json` is an instance-only
installation. It mirrors the committed `apps/instance/wrangler.jsonc`
placeholders (release `v0.26.0`, schema 1, an all-zero manifest digest), so
`doctor --offline` against the repository reports `attention` rather than
`failed`. The f42ctl tests enforce that match. Update the example with the
Worker's release coordinates when a release changes them.
`deployment-manifest.website.json` is the same installation with a website:

```bash
pnpm f42ctl plan \
  --manifest tooling/f42ctl/examples/deployment-manifest.local.json
pnpm f42ctl plan \
  --manifest tooling/f42ctl/examples/deployment-manifest.website.json
```

## Deterministic deploy plan

`plan` canonicalizes the validated manifest, records its SHA-256 digest, and
emits the same ordered dependency graph for the same semantic input regardless
of JSON key order. The eleven instance steps cover release verification,
dedicated storage and Queue resources, Worker configuration, migrations,
deployment, domains, Access, and runtime verification.

With a website, six steps follow, for seventeen in total:

| Step | Kind | Depends on |
| --- | --- | --- |
| `step-12` | `ensure-website-d1` | `step-01` |
| `step-13` | `ensure-website-r2` | `step-01` |
| `step-14` | `ensure-website-session-kv` | `step-01` |
| `step-15` | `deploy-website-worker` | `step-08`, `step-12`, `step-13`, `step-14` |
| `step-16` | `configure-website-domains` | `step-15` |
| `step-17` | `verify-website` | `step-11`, `step-16` |

The website deploys after the instance Worker because its optional service
binding targets it, and is verified after the instance runtime because it
renders instance content. A plan contains either exactly the eleven instance
steps or all seventeen; any other combination fails schema validation.

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
- the highest local numbered D1 migration;
- optional public `/api/health` service/topology readiness; and
- with a website, the website Worker's Wrangler file.

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

Doctor also requires `F42_RELEASE_TAG` and
`F42_RELEASE_MANIFEST_SHA256` to match the exact deployment release. These
non-secret coordinates let the instance prove which immutable source is
running before it prepares an upgrade. The Worker name, package version, or a
mutable release channel is never accepted as a substitute.

### Website checks

When the manifest declares a website, doctor reads a second Wrangler file,
`apps/website/wrangler.jsonc` by default, or the path given with
`--website-wrangler`. Supplying `--website-wrangler` for an instance-only
manifest is an input error. Nine checks follow the fourteen instance checks:

| Check | Passes when |
| --- | --- |
| `website-worker-name` | the Worker `name` matches `website.worker.name` |
| `website-d1-binding` | `DB` binds the website D1 database name |
| `website-r2-binding` | `MEDIA` binds the website R2 bucket name |
| `website-session-kv` | `SESSION` binds a KV namespace ID |
| `website-instance-service` | `FELLOWSHIP42` binds the instance Worker, or no such binding exists when `instanceService` is `null` |
| `website-schedule` | the crons are exactly `* * * * *` |
| `website-domains` | the routes are exactly the website domains |
| `website-instance-pin` | `FELLOWSHIP42_INSTANCE_SHA256` is the SHA-256 of the portable instance ID |
| `website-origins` | `EMDASH_SITE_URL` is the canonical website origin, `FELLOWSHIP42_URL` is the canonical instance origin, and the instance's `WEBSITE_ORIGIN` is the canonical website origin |

Origins must be bare `https://<domain>` URLs with no path, query, port, or
credentials; a trailing `/` is accepted. An empty instance `WEBSITE_ORIGIN` is a `warning`
(`instance-website-origin-unset`): the church keeps the instance homepage.
Doctor never reads or reports secret values and does not expose the identity
digest.

```bash
pnpm f42ctl doctor \
  --manifest deployment-manifest.json \
  --website-wrangler apps/website/wrangler.jsonc \
  --runtime https://app.example.org
```

## Callable reconciliation

`@fellowship42/f42ctl/reconciliation` is a Worker-safe public subpath for
provider-neutral observation, preview, and apply. It contains no Node built-in,
filesystem access, provider credential, or Cloudflare API implementation.

A provider adapter first returns one ordered observation per plan step:
exactly eleven, or seventeen when the manifest declares a website. Each has
the lifecycle step ID/kind, `absent`, `matching`, `drifted`, or `unknown` state,
an ownership class, an optional SHA-256 fingerprint, and a bounded machine code.
It cannot return a provider account/resource ID or arbitrary payload. Existing
provider resources require verified portable-instance ownership; unverified,
foreign, unknown, or contradictory observations produce a blocked preview.

`buildReconciliationPreview` recomputes the canonical manifest digest and a
separate desired-state fingerprint for every step. With a website, the
`configure-worker` state includes the instance's `WEBSITE_ORIGIN`, and the
`deploy-website-worker` state includes `EMDASH_SITE_URL`, `FELLOWSHIP42_URL`,
and `FELLOWSHIP42_INSTANCE_SHA256`, so an adapter that fingerprints what it
observes sees drift in them. An instance-only installation's fingerprints are
unchanged. It emits only `none`,
`create`, `update`, `execute`, `verify`, or `blocked` changes, preserves the
dependency graph, and never emits a destructive change. An observation or
approved preview whose step count differs from the manifest's plan is
rejected before any effect. The synthetic staging fixture at
`tooling/f42ctl/fixtures/reconciliation.staging.json` describes an
installation with a website and exercises a clean, absent-resource preview
without provider identifiers or credentials; the tests derive the
instance-only case from it.

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
