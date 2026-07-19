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
or if any export artifact is invalid.

The ordered plan contains 17 steps. New-empty D1 and R2 checks happen before
any restore. The Worker deploys without domains before credential rotation and
runtime checks. Domain cutover and source-routing retirement are the only
approval-bearing steps.

## Execute through an adapter

The callable `executePortableImportRestore` lifecycle core accepts a
`PortableImportAdapter`. An adapter must independently return a strict
destination preflight proving that the bound D1 and R2 were created after the
plan and remain empty, while the Worker, Queues, and Durable Object namespace
are absent. The core then restores D1, streams each content-addressed R2 object,
applies forward migrations, deploys without domains, rotates deployment,
application-secret, and management credentials, verifies the restored portable
identity, and verifies the destination runtime. Failure stops later steps and
returns a bounded report with no raw provider error or church payload.

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
- intended domains;
- confirmation that deployment credentials and application secrets were
  rotated and management credentials were rotated or disconnected; and
- a future rollback deadline.

Verify a prepared approval offline:

```bash
pnpm f42ctl verify-cutover \
  --plan ./import-plan.json \
  --destination ./destination-deployment.json \
  --approval ./cutover-approval.json
```

`executePortableCutover` then calls the adapter to attach the exact domains,
verify independent operation, and retire only the source routing. It does not
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
