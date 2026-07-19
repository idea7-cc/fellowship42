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

Before 1.0, an application or package minor release may contain a breaking
change. Patch releases must remain compatible with the corresponding minor
line. A protocol compatibility policy will become stricter before the first
management endpoint is declared stable.

## Release contents

`pnpm release:artifacts` builds and verifies these files in
`artifacts/release/` from a clean commit:

- `fellowship42-<version>-source.tgz`: the complete tracked public repository,
  suitable for a reproducible installation or deployment build;
- `fellowship42-management-protocol-<version>.tgz`: the installable public
  contract package with compiled JavaScript and declarations;
- `release-manifest.json`: the exact commit, application/schema versions,
  protocol package/wire versions, sizes, and SHA-256 digests; and
- `SHA256SUMS`: independent checksums for the archives and manifest.

The source archive is created with `git archive`, so untracked files, ignored
secrets, generated credentials, and a developer's local state cannot enter a
release. The builder refuses to run from a dirty worktree. The verifier checks
every recorded size and digest before CI can publish anything.

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

## Protocol package publication

The protocol tarball attached to every application release is directly
installable and gives private or third-party consumers an immutable input
without a relative filesystem dependency. Publishing the same package to npm
will be enabled only after the public npm scope and trusted-publishing policy
are established. Until then, consumers pin the GitHub release asset and its
SHA-256 digest.

## What remains portable

A release never enrolls an instance in Fellowship42 Cloud, creates billing or
partner records, or grants management capability. The same artifact must be
deployable into a church-owned, partner-operated, or Fellowship42-operated
Cloudflare account. Enrollment remains a separate, explicit, revocable action.
