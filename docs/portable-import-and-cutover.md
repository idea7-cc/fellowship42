# Portable import and cutover

Portable import is a staged migration, not a database upload followed by a DNS
change. The public lifecycle contract preserves the portable instance identity,
requires an exact v1 release match, proves the destination is new and empty,
restores only into destination resources, rotates every credential class,
verifies both runtimes, and gates domain cutover and source-routing retirement
with explicit approval.

## Build the plan

Create a destination deployment manifest with the exported `instanceId`, exact
source release, newly named D1/R2/Worker/Queue resources, destination custody,
and intended domains. Then run:

```bash
pnpm f42ctl plan-import \
  --directory ./church-export \
  --destination ./destination-deployment.json \
  --output ./import-plan.json
```

Planning re-runs the complete offline export verifier and binds the resulting
manifest digest to the canonical destination-manifest digest. It fails if the
portable identity or release drifts, if a production destination has no domain,
or if any export artifact is invalid. The destination must declare a website
exactly when the export contains one, with the same EmDash name and version.

The ordered plan contains 17 steps for an instance-only installation. New-empty
D1 and R2 checks happen before any restore. The Worker deploys without domains
before credential rotation and runtime checks. Domain cutover and
source-routing retirement are the only approval-bearing steps.

With a website the plan contains 23 steps. Six website steps are interleaved
with their instance counterparts so that every restore still precedes every
credential change and every runtime check precedes cutover:

| # | Step | Risk |
| --- | --- | --- |
| 01–05 | `verify-export` … `verify-new-empty-r2` | read-only |
| 06 | `verify-new-empty-website-d1` | read-only |
| 07 | `verify-new-empty-website-r2` | read-only |
| 08–09 | `restore-d1`, `restore-r2` | writes-destination |
| 10 | `restore-website-d1` | writes-destination |
| 11 | `restore-website-r2` | writes-destination |
| 12–13 | `apply-forward-migrations`, `deploy-without-domains` | writes-destination |
| 14 | `deploy-website-without-domains` | writes-destination |
| 15–17 | `rotate-deployment-credentials` … `rotate-management-credentials` | credential-change |
| 18–19 | `verify-restored-identity`, `verify-runtime` | read-only |
| 20 | `verify-website-runtime` | read-only |
| 21 | `cutover-domains` | cutover, approval |
| 22 | `verify-independent-operation` | read-only |
| 23 | `retire-source-routing` | source-change, approval |

The website deploy depends on both website restores and on the domainless
instance deploy, because its optional `FELLOWSHIP42` service binding targets
the instance Worker. A plan contains either every website step or none.

## Execute through an adapter

The callable `executePortableImportRestore` lifecycle core accepts a
`PortableImportAdapter`. An adapter must independently return a strict
destination preflight proving that the bound D1 and R2 were created after the
plan, while explicitly reporting each as `empty` or `occupied`; either occupied
resource is rejected before any write. The Worker, Queues, and Durable Object
namespace must be absent. The core then restores D1, streams each content-addressed R2 object,
applies forward migrations, deploys without domains, rotates deployment,
application-secret, and management credentials, verifies the restored portable
identity, and verifies the destination runtime. Failure stops later steps and
returns a bounded report with no raw provider error or church payload.

With a website the preflight adds a `website` object: the website D1 and R2
are `empty` or `occupied` with creation times after the plan, and the website
Worker and session KV namespace are `absent`. The preflight must include the
`website` object exactly when the plan has website steps. The adapter also
implements `restoreWebsiteD1`, `restoreWebsiteR2Object`,
`deployWebsiteWithoutDomains`, and `verifyWebsiteRuntime`. These methods are
optional for instance-only adapters. If a website plan meets an adapter
without them, the executor fails at `verify-destination-manifest` with
`website-adapter-unsupported` before any provider call. The website deploy
creates a fresh, empty `SESSION` namespace, configures the preserved
`EMDASH_ENCRYPTION_KEY`, and pins `FELLOWSHIP42_INSTANCE_SHA256` to the
restored identity. `verifyWebsiteRuntime` succeeds only when the website runs
and pins that identity. EmDash applies any pending core migrations itself at
runtime.

The public repository intentionally does not infer “empty” from a new resource
name or an operator checkbox. Current Wrangler supports D1 SQL execution and
individual R2 object upload, but its R2 object command does not provide the
complete destination-inventory proof this gate requires. A Cloudflare adapter
must establish new resources through reconciliation or list them through an
authorized binding/API before calling the core.

After restore, the report status is `awaiting-cutover`; it is not a completed
migration.

## Approve and cut over

A cutover approval binds all of these fields:

- operation, portable instance, export-manifest, and destination-manifest IDs;
- source and destination runtime verification times;
- intended domains: the instance domains followed by the website domains,
  exactly as in the destination manifest (at most eight, or sixteen with a
  website);
- confirmation that deployment credentials and application secrets were
  rotated and management credentials were rotated or disconnected;
- with a website, the website credential disposition described below; and
- a future rollback deadline.

### Credential disposition

The approval's credential classes apply to the whole installation, not to
one Worker:

| Class | Instance | Website |
| --- | --- | --- |
| `deployment: rotated` | scoped Cloudflare deployment token | the same authority deploys the website Worker, D1, R2, and KV |
| `applicationSecrets: rotated` | instance Worker secrets such as `PAYMENT_WEBHOOK_SECRET`; the [deployment guide](deployment.md) names keys preserved for migration | see `website` below |
| `management` | `rotated` or `disconnected` | not applicable |

With a website, `credentialDisposition.website` is required and strict:

- `encryptionKey: "preserved"`: `EMDASH_ENCRYPTION_KEY` decrypts EmDash
  plugin secret settings stored in the website D1 export. Carry it through
  the church-authorized secret store like `MANAGEMENT_KEY_ENCRYPTION_KEY`,
  never through the bundle. After cutover, rotate it with EmDash's
  prepend-and-resave procedure, and rotate any third-party plugin secrets the
  former operator could read.
- `setupSecret: "removed" | "rotated"`: `WEBSITE_SETUP_SECRET` is shared by
  both Workers only until the first EmDash administrator is claimed. It is
  `removed` from both Workers when setup is complete. If setup is still
  pending, it is `rotated` to a new value on both Workers.
- `sessionStore: "recreated"`: the `SESSION` KV namespace is new and empty;
  every website editor signs in again.

EmDash stores its preview secret, IP salt, and hashed API and auth tokens in
D1, so they travel with the export. Revoke and reissue website API tokens
after a hosted exit.

Verify a prepared approval offline:

```bash
pnpm f42ctl verify-cutover \
  --plan ./import-plan.json \
  --destination ./destination-deployment.json \
  --approval ./cutover-approval.json
```

`executePortableCutover` first requires the execution report to carry exactly
the plan's ordered step IDs and kinds, so a report that skipped the website
cannot complete a website plan, nor the reverse; rehearsal evidence and exit
packets apply the same check. It then calls the adapter to attach the exact domains
(instance routes to the instance Worker, website routes to the website
Worker), verify independent operation, and retire only the source routing. It does not
delete source D1/R2 data. Source disposal is a later retention-controlled,
separately authorized operation.

Cloudflare Custom Domains are configured as Worker routes and become active on
deployment. This is why the destination deploy and verification precede the
approval-bearing domain attachment.

## Current boundary

The public schemas, deterministic planner, executor, failure behavior, and
adapter conformance tests are implemented. Provider-specific provisioning and
credential custody remain adapter responsibilities; the private service may
add convenience, but a church or third-party operator can implement the same
published interface.

`pnpm test:migration-rehearsal` now executes the complete path against separate
hosted and church-owned local account models and verifies the packaged evidence
fixture. See [migration rehearsal](migration-rehearsal.md) for its exact proof
and limitations. A live Cloudflare staging-account certification remains a
separate milestone and must use released artifacts rather than source coupling.

## Cloudflare references

- [D1 execute and import](https://developers.cloudflare.com/d1/wrangler-commands/)
- [R2 object commands](https://developers.cloudflare.com/workers/wrangler/commands/r2/)
- [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
