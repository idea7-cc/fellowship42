# Published contract fixtures

Fixtures in this directory are public compatibility examples. They exercise
compatibility without importing an application checkout or relying on
unpublished implementation details.

Two kinds of fixture live here. `release-manifest.v1.json` is a capture from a
published release and is never rewritten. The deterministic lifecycle
fixtures, `migration-rehearsal.v1.json`,
`migration-rehearsal.instance-only.v1.json`, and
`portable-restore-conformance.v1.json`, are synthetic: CI regenerates them
through the public code and requires exact equality. Before the alpha is
declared they are regenerated in place when a lifecycle contract changes (see
`AGENTS.md`); since the unreleased website component was added,
`migration-rehearsal.v1.json` and `portable-restore-conformance.v1.json` carry
website entries that no published protocol package can parse. After the
alpha, each is immutable for its compatibility case and a change adds a new
versioned fixture.

`release-manifest.v1.json` is the manifest published with `v0.1.0`. Do not edit
it to describe a newer release; add a new fixture when the manifest format or a
meaningful compatibility case changes.

`migration-rehearsal.v1.json` is privacy-bounded evidence produced by the
deterministic hosted-to-church-owned compatibility rehearsal. CI reruns the
public export/import/cutover code and requires byte-equivalent canonical
evidence. The rehearsed installation includes the optional EmDash website
component, so the evidence has thirteen assertions, three of them for the
website. `migration-rehearsal.instance-only.v1.json` is the same rehearsal
without the website: ten assertions, byte-identical to the evidence produced
before the website component existed. CI checks both, so a regression in
either path fails verification. The fixtures contain digests and assertions,
never synthetic D1/R2 payloads, resource names, domains, or credentials.
Regenerate a candidate with
`node scripts/rehearse-hosted-to-church-owned.mjs --print-fixture` or
`--print-fixture=instance-only`.

`management-jws.v1.json` is the protocol-v1 Ed25519 flattened-JWS
interoperability vector. It contains only a public test key, a privacy-bounded
sync payload, and its signature; no private key or credential is included.

`management-adapter-conformance.v1.json` is the exact report emitted by the
public executable conformance suite against the `v0.17.0` release candidate.
It contains only release versions and ordered passing scenario IDs. CI reruns
the real adapter and requires exact equality; the fixture contains no portable
instance ID, key, challenge, endpoint, command/result body, or church data.

`portable-restore-conformance.v1.json` is the exact payload-free report emitted
by the public `f42ctl` isolated-restore conformance suite for an installation
with a website. It proves export integrity and tamper rejection, new/empty
destination enforcement, D1/R2 restore, website restore, credential rotation,
portable identity and runtime verification, cutover isolation, and fail-closed
partial restore for the exact release tuple. An instance-only run reports the
same scenarios without `website-restored`.
It is not evidence that a particular provider account has passed a live drill.

`partner-compatibility-profile.v1.json` is the ordered, public input profile
for compatible operators and future partner certification. It points to the
release, doctor, adapter, restore, and migration evidence that any operator can
produce without church payloads or provider credentials. Passing these public
inputs demonstrates software compatibility; it does not certify a live account
or confer the Fellowship42 certified-partner designation.
