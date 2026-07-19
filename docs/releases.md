# Releases and immutable artifacts

Fellowship42 releases are the boundary between this public repository and any
deployment operator, including Fellowship42 Cloud. Operators consume a tagged,
checksummed release. They must not deploy an unpublished branch, reach into a
developer worktree, or depend on private application internals.

## Version surfaces

Three versions serve different purposes:

- The **application version** is the root and `apps/instance` semantic version.
  A stable release tag is exactly `v<application-version>`.
- The **schema version** is the largest ordered D1 migration prefix included in
  the release. The release manifest records it for upgrade planning.
- The **management protocol package version** follows semantic versioning
  independently. Its exported `MANAGEMENT_PROTOCOL_VERSION` is the wire-major
  version and changes only for an intentionally incompatible wire contract.

Application releases remain pre-1.0 and may contain breaking changes in a minor
release. Management protocol package `1.x` follows semantic versioning: additive
contracts use minor releases, fixes use patches, and changes to required wire
fields, signature bytes, capability meaning, or security rules require a new
wire major and parallel API prefix.

## Release contents

`pnpm release:artifacts` builds and verifies these files in
`artifacts/release/` from a clean commit:

- `fellowship42-<version>-source.tgz`: the complete tracked public repository,
  suitable for a reproducible installation or deployment build;
- `fellowship42-management-protocol-<version>.tgz`: the installable public
  contract package with compiled JavaScript and declarations;
- `fellowship42-f42ctl-<version>.tgz`: the installable public lifecycle CLI and
  callable planning/diagnostic library;
- `release-manifest.json`: the exact commit, application/schema versions,
  protocol package/wire versions, sizes, and SHA-256 digests; and
- `SHA256SUMS`: independent checksums for the archives and manifest.

The source archive is created with `git archive`, so untracked files, ignored
secrets, generated credentials, and a developer's local state cannot enter a
release. Package and source tar streams are recompressed with a pinned pure
JavaScript implementation so platform zlib versions cannot change asset bytes.
The builder refuses to run from a dirty worktree. The verifier checks every
recorded size and digest, and the release gate assembles everything twice and
requires identical checksums before CI can publish anything.

## Publishing flow

1. Make the release version changes on a reviewed branch and pass the complete
   repository checklist.
2. Merge the release commit to `main`.
3. Create and push the exact stable tag, for example `v0.1.0`.
4. The release workflow rebuilds the artifacts from that tag, re-runs the
   checks and Wrangler dry runs, and attaches the files to an immutable GitHub
   release.
5. Record the release manifest digest in the deployment system before
   promoting that artifact to staging or production.

Moving or reusing a release tag is prohibited. A correction receives a new
version. Production deployment credentials are never used by the public
release workflow.

## Public package publication

The protocol tarball attached to every application release is directly
installable and gives private or third-party consumers an immutable input
without a relative filesystem dependency. Publishing the same package to npm
will be enabled only after the public npm scope and trusted-publishing policy
are established. Until then, consumers pin the GitHub release asset and its
SHA-256 digest.

The lifecycle CLI tarball pins that protocol package version. Until both
packages are available from the public npm scope, install the matching protocol
and CLI tarballs together from the same release and verify both manifest
digests.

## Contract fixtures

The management-protocol package publishes immutable release-manifest fixtures
under `@fellowship42/management-protocol/fixtures/*`. A fixture captured from a
published release is never rewritten to resemble a newer release. Consumers
use it to test schema compatibility, while deployment systems still download
and verify the actual release manifest and artifacts they intend to deploy.

`migration-rehearsal.v1.json` is an immutable compatibility fixture containing
privacy-bounded evidence from the public hosted-to-church-owned rehearsal
against released `v0.9.0` lifecycle inputs. CI regenerates it through the real
public export/import/cutover code. Consumers validate it with
`migrationRehearsalEvidenceSchema` without receiving synthetic D1/R2 payloads
or provider-specific state.

`management-jws.v1.json` is the mandatory wire-v1 interoperability vector. It
contains a public Ed25519 JWK, a privacy-bounded sync request, and its flattened
JWS signature. Consumers must validate both its strict schema and signature. It
contains no private key or enrollment credential.

`management-adapter-conformance.v1.json` is generated by the packaged
`runManagementAdapterConformance` suite against the real instance adapter. It
proves the ordered public enrollment, status, replay, grant-denial, rotation,
and disconnect scenarios for its exact application/schema/protocol tuple. The
report is payload-free and does not certify a live deployment or operator.

The release builder validates every generated manifest with the same exported
`releaseManifestSchema` used by external consumers. This keeps the generated
artifact, public package, and private or third-party verifier on one contract.

## What remains portable

A release never enrolls an instance in Fellowship42 Cloud, creates billing or
partner records, or grants management capability. The same artifact must be
deployable into a church-owned, partner-operated, or Fellowship42-operated
Cloudflare account. Enrollment remains a separate, explicit, revocable action.
