# Published contract fixtures

Fixtures in this directory are immutable examples captured from published
Fellowship42 releases. They exercise compatibility without importing an
application checkout or relying on unpublished implementation details.

`release-manifest.v1.json` is the manifest published with `v0.1.0`. Do not edit
it to describe a newer release; add a new fixture when the manifest format or a
meaningful compatibility case changes.

`migration-rehearsal.v1.json` is privacy-bounded evidence produced by the
deterministic hosted-to-church-owned compatibility rehearsal. CI reruns the
public export/import/cutover code and requires byte-equivalent canonical
evidence. The fixture contains digests and assertions, never synthetic D1/R2
payloads, resource names, domains, or credentials.
