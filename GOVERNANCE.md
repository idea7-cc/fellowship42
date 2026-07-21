# Fellowship42 governance

Fellowship42 is a maintainer-led open-source project. The current maintainers
are the people with write or administration authority in the canonical
`idea7-cc/fellowship42` repository. Repository permissions are the operational
record; this document does not grant private service or production access.

## How decisions are made

- Small fixes and compatible features are decided through public pull-request
  review.
- Significant product, data-custody, security, protocol, portability,
  deployment-topology, or repository-boundary changes require an issue or ADR
  before merge.
- Maintainers seek evidence and rough consensus, but may make the final call to
  preserve security, scope, and the project invariants in `AGENTS.md`.
- Security reports and embargoed fixes use GitHub's private security-advisory
  path until coordinated disclosure is safe.

Maintainers may close proposals that make the optional private service a
runtime dependency, weaken church ownership or exit, move private commercial
code into this repository, or create an incompatible contract without a
versioned migration path.

## Releases

Only maintainers may create canonical tags and GitHub releases. A release must
come from reviewed `main`, pass the documented release gate, and publish
reproducible checksummed artifacts. Tags are immutable. A correction receives a
new version.

## Contributors and maintainers

Contributors retain their copyright and submit changes under Apache-2.0. No
contributor license agreement is currently required. Consistent contributors
may be invited to triage or maintain an area after demonstrating sound judgment
about its tests, documentation, security, and ownership boundaries.

Maintainer access can be limited or removed for inactivity, compromised
credentials, repeated policy violations, or project safety. At least one other
maintainer should review changes to release automation, security boundaries,
or governance when project capacity permits.

## Public project and private service

Open-source governance controls this repository and its public contracts. It
does not expose private Fellowship42 Cloud code, customer information,
credentials, commercial decisions, or incident details. The private service
may narrow what it operates, but cannot redefine the public instance's license,
portable identity, local authority, or exit rights.
