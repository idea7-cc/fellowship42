# ADR 0019: Checksummed operator-reference catalog

- Status: accepted
- Date: 2026-07-20

## Context

Operator dashboards, lifecycle tools, and approved AI clients need to show the
public instructions that apply to an exact Fellowship42 release. Linking a
moving branch can silently change guidance after deployment, while copying
runbooks into private software creates drift and makes self-hosting guidance a
private dependency.

## Decision

Every new public release publishes `operator-references.json` as a checksummed
release artifact. The management-protocol package owns strict schemas for its
maintained definitions and generated catalog. Release assembly adds the exact
release manifest and tag page, pins each documentation URL to the release
source commit, verifies every source path, and records the catalog's size and
SHA-256 digest in `release-manifest.json`.

The catalog contains titles, bounded summaries, audiences, source paths, and
immutable public URLs only. It contains no secret, account identifier, church
record, private runbook, command input, or authorization state. It is an
informational discovery contract rather than a management wire message.

Consumers verify the release manifest and catalog digest before displaying a
reference. They still apply normal authentication, assignment, capability,
approval, and evidence requirements to any related operation.

## Consequences

- Self-hosted, partner, and hosted operators receive the same public guidance.
- Historical release guidance remains bound to the source it describes.
- Private clients can expose safe runbook references without copying public
  documentation or reaching into a checkout.
- Updating guidance for a released artifact requires a new release; an old tag
  and its checksums are never moved.
- The catalog does not make MCP part of the durable management protocol and
  cannot authorize a management action.
