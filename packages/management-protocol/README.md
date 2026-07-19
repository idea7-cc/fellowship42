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
- typed command inputs, bounded expiry, nonces, and result contracts;
- explicit expiring grants and mandatory local approval for high-risk actions;
- enrollment, instance-initiated sync, replay, rotation, and disconnect schemas;
- standard Ed25519 flattened-JWS signing and verification through Web Crypto;
- a mandatory public signature interoperability vector;
- the checksummed Fellowship42 release-manifest schema and immutable fixtures;
- strict portable-export manifests, configuration, R2 indexes, and
  privacy-bounded verification evidence;
- staged import plans, new-empty destination preflight, bounded execution
  reports, and exact cutover approval; and
- privacy-bounded hosted-to-church-owned rehearsal evidence and a packaged
  compatibility fixture.

Wire protocol v1 and its `f42-jws-eddsa-v1` security profile are stable. Package
1.1 adds empty heartbeat results and duplicate-capability rejection without
changing the wire major. The instance adapter is implemented as local-owner
enrollment plus outbound-only operator sync. See
`../../docs/management-protocol.md`, ADR 0010, and ADR 0011 before changing the
trust boundary.

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
