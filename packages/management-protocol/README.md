# `@fellowship42/management-protocol`

This public package contains the versioned contracts shared by a portable
Fellowship42 instance and optional compatible management software.

It deliberately contains no Fellowship42 Cloud client, billing model, partner
implementation, Cloudflare credential, custom cryptography, or MCP server. The
private control plane consumes this package in the same way as any third-party
implementation.

Current contracts establish:

- the `single-church` deployment topology;
- portable instance identity and application/schema versions;
- infrastructure owner separately from operator;
- independently grantable management capabilities;
- strict privacy-bounded instance-health observations shared by doctor and
  optional fleet management;
- typed command inputs, bounded expiry, nonces, and result contracts;
- explicit expiring grants and mandatory local approval for high-risk actions;
- enrollment, instance-initiated sync, replay, rotation, and disconnect schemas;
- standard Ed25519 flattened-JWS signing and verification through Web Crypto;
- a mandatory public signature interoperability vector;
- an executable instance-adapter conformance harness and strict report;
- the checksummed Fellowship42 release-manifest schema and immutable fixtures;
- exact-source upgrade metadata and fail-closed eligibility assessment;
- strict update preparation and one-use local authorization evidence;
- strict portable-export manifests, configuration, R2 indexes, and
  privacy-bounded verification evidence;
- staged import plans, new-empty destination preflight, bounded execution
  reports, and exact cutover approval; and
- privacy-bounded hosted-to-church-owned rehearsal evidence and a packaged
  compatibility fixture;
- provider-neutral reconciliation observations, non-destructive previews,
  digest-bound approvals, adapter outcomes, and bounded reports; and
- strict runtime health and first-owner readiness evidence bound to a hashed
  portable identity; and
- an executable, payload-free isolated-restore conformance profile covering
  tamper rejection, new/empty destinations, D1/R2 restore, credential rotation,
  identity/runtime checks, cutover isolation, and partial failure; and
- strict local management-disposition, hosted-exit handoff, exit-packet, and
  packet-verification evidence contracts.

Wire protocol v1 and its `f42-jws-eddsa-v1` security profile are stable. Package
1.1 added empty heartbeat results and duplicate-capability rejection. Package
1.2 adds the transport-neutral adapter conformance runner and report schema
without changing the wire major. Package 1.3 adds deployment reconciliation
evidence, package 1.4 adds provisioning/bootstrap readiness evidence, and
package 1.5 adds isolated-restore conformance without changing management wire
v1. Package 1.6 adds independently verifiable hosted-exit evidence, and package
1.7 adds an independently grantable instance-health observation without
changing management wire v1. Package 1.8 adds exact-source release upgrade
metadata and eligibility assessment without changing management wire v1.
Package 1.9 adds update preparation and deployment-authorization evidence
without changing management wire v1. The
instance adapter is
implemented as local-owner enrollment plus outbound-only operator sync. See
`../../docs/management-protocol.md`, ADR 0010, ADR 0011, and ADR 0012 before
changing the trust or provider boundary.

The package is built before it is consumed. Published exports point only at
compiled ESM and generated declarations in `dist`; consumers do not need the
Fellowship42 monorepo or a TypeScript source loader. Each application release
includes an installable package tarball and checksums as described in
`../../docs/releases.md`.

Release-manifest consumers should import `releaseManifestSchema` from the main
package export. Published examples are available through the
`@fellowship42/management-protocol/fixtures/*` subpath; fixtures supplement but
never replace verification of the intended release asset and checksum.

Export bundle payloads remain local to the church or its operator. Compatible
management software consumes only `exportEvidenceSchema`; it must not receive
the D1 SQL, R2 index, object keys, or object bytes.
