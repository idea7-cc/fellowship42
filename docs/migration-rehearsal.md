# Hosted-to-church-owned migration rehearsal

Fellowship42 ships an executable compatibility rehearsal for the ownership
path the project promises: a church starts in Fellowship42-operated
infrastructure and leaves with the same portable instance running in a
church-owned account boundary.

Run it from a clean checkout:

```bash
pnpm test:migration-rehearsal
```

The command uses only the public management protocol and `f42ctl`. It creates
temporary, separate hosted-source and church-destination directories, assembles
and verifies a synthetic portable export, builds the complete import plan,
requires a new/empty destination, restores D1 and two R2 objects, applies the
exact-release migration boundary, deploys without domains, rotates all three
credential classes, verifies portable identity and runtime integrity, applies
an explicit church-owner cutover approval, verifies independent operation, and
retires source routing.

The rehearsed installation includes the optional EmDash website component, as
a generated Fellowship42-first installation does. The rehearsal also proves a
new/empty website D1 and R2, restores the website database and two website
objects, one of which shares bytes with an instance object in the
content-addressed store, and deploys the website after the instance with a
fresh session store and the preserved encryption key. It removes the setup
secret, verifies that the website pins the restored identity digest, and cuts
over instance and website domains in one approved step.

## Evidence and compatibility fixture

The rehearsal emits migration evidence format version 1. The public schema
binds:

- the operation and portable instance IDs;
- exact source and destination release coordinates;
- export and destination-manifest digests;
- canonical plan, restore-report, approval, and completion-report digests;
- monotonic restore, approval, and completion timestamps; and
- thirteen ordered passing assertions covering export, empty destination,
  D1/R2 integrity, website D1/R2 integrity, credential disposition, identity,
  runtime, website runtime, approval, independent operation, and source
  retirement. An instance-only rehearsal produces the ten non-website
  assertions.

CI compares the generated result with
`packages/management-protocol/fixtures/migration-rehearsal.v1.json`. The
fixture uses the `v0.9.0` release coordinates and is packaged with the
public protocol so external operators can test compatibility without a
relative checkout.

The evidence intentionally excludes D1 SQL, R2 content and keys, resource
names, account/resource IDs, domains, credentials, secrets, and provider
responses.
Digests bind the detailed public lifecycle objects without turning evidence
storage into a copy of the migration payload.

## What this proves

The deterministic rehearsal proves that the public artifact can preserve the
portable identity and exact bytes across an isolated account boundary model;
that restore cannot begin before new/empty-resource proof; that routing waits
for explicit approval and completed credential rotation; and that source
routing is not retired before independent destination operation succeeds.

It is not a claim that a real Cloudflare account transfer has been certified.
The adapter is a deterministic local conformance adapter, not the Cloudflare
REST API. A live staging exercise must additionally prove scoped account
credentials, real D1/R2 enumeration and restore, Queues/Durable Objects,
Access, DNS/custom-domain behavior, propagation, rollback, and provider audit
evidence. The public interface is intentionally the same adapter boundary that
a church, partner, or hosted operator must implement for that exercise.

## Updating the fixture

Before the alpha is declared, the fixture is synthetic and is regenerated in
place when the lifecycle contract changes, as it was when the website
component was added (see `AGENTS.md`). After the alpha, treat it as immutable
for its compatibility case and add a new versioned fixture instead. To inspect
or regenerate the deterministic candidate:

```bash
node scripts/rehearse-hosted-to-church-owned.mjs --print-fixture
```

Do not add production exports, real church records, domains, credentials, or
provider identifiers to a fixture.
