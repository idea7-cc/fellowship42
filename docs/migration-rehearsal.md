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

## Evidence and compatibility fixture

The rehearsal emits migration evidence format version 1. The public schema
binds:

- the operation and portable instance IDs;
- exact source and destination release coordinates;
- export and destination-manifest digests;
- canonical plan, restore-report, approval, and completion-report digests;
- monotonic restore, approval, and completion timestamps; and
- ten ordered passing assertions covering export, empty destination, D1/R2
  integrity, credential disposition, identity, runtime, approval, independent
  operation, and source retirement.

CI compares the generated result with
`packages/management-protocol/fixtures/migration-rehearsal.v1.json`. The
fixture is based on the published `v0.9.0` import contract and is packaged with
the public protocol so external operators can test compatibility without a
relative checkout.

The evidence intentionally excludes D1 SQL, R2 content and keys, resource
names, account/resource IDs, domains, credentials, and provider responses.
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

The checked fixture is immutable for its meaningful compatibility case. If an
intentional contract change requires new evidence, add a new versioned fixture
rather than rewriting the old semantic claim. To inspect the deterministic
candidate during development:

```bash
node scripts/rehearse-hosted-to-church-owned.mjs --print-fixture
```

Do not add production exports, real church records, domains, credentials, or
provider identifiers to a fixture.
