# Stable operator references

Every Fellowship42 release publishes `operator-references.json` as a
checksummed release artifact. It gives operator clients a small, typed catalog
of the exact release manifest, release page, and public runbooks that apply to
that release.

Documentation links in the catalog are pinned to the release source commit.
Release links are pinned to the matching immutable tag. An operator dashboard,
CLI, or AI adapter can therefore display the right guidance without scraping a
moving branch or inventing private instructions.

The catalog is informational. It does not grant a management capability,
authorize an operation, certify a live deployment, or replace exact command and
evidence contracts. Consumers must validate it with
`operatorReferenceCatalogSchema`, verify its artifact checksum from
`release-manifest.json`, and continue to authorize every operation normally.

The maintained source list is
[`operator-reference-definitions.json`](operator-reference-definitions.json).
Release assembly validates every referenced path and adds the two release
references before producing the immutable artifact.
