# ADR 0013: Payload-free isolated-restore conformance

- Status: accepted
- Date: 2026-07-20

## Context

A checksummed portable export proves that a bundle is internally consistent,
but it does not prove that an operator can restore that bundle safely. A live
provider drill is necessary for service certification, while an executable
public contract is necessary so Fellowship42 Cloud, partners, and self-hosters
exercise the same lifecycle semantics before provider credentials are involved.

The bundle contains church records and media. A public conformance result must
therefore be useful to a control plane without copying D1 SQL, R2 keys or bytes,
domains, resource identifiers, credentials, or download locations into routine
telemetry.

## Decision

1. `f42ctl` owns an executable isolated-restore conformance runner. An operator
   supplies collector inputs, an exact destination manifest, and three injected
   provider adapters: successful isolated restore, nonempty destination, and
   partial restore failure.
2. The runner calls the real public export assembly, offline verification,
   import planning, and pre-cutover restore implementation. It does not fork or
   simulate lifecycle ordering.
3. Conformance requires nine ordered scenarios: export integrity, tamper
   rejection, new/empty destination, D1/R2 restore, credential rotation,
   portable identity, runtime readiness, no cutover/source mutation, and
   fail-closed partial restore.
4. The successful scenario must stop at `awaiting-cutover`. Domain cutover,
   independent production operation, and source retirement remain pending and
   require a separate explicit approval-bearing operation.
5. The output is a strict payload-free report containing only the exact
   application, schema, protocol-package, lifecycle-CLI, export-format, and
   import-format versions plus ordered passing scenario IDs.
6. The published fixture is reproduced by CI through the executable runner.
   It is compatibility evidence, not proof that a particular provider account,
   retention policy, encryption boundary, or recovery objective passed a live
   drill.

## Consequences

- Hosted and independent operators can test adapters against one public
  restore contract without sharing backup payloads with Fellowship42.
- Tampered bundles, unproven destinations, identity drift, unhealthy runtimes,
  and partial restores cannot produce a passing report.
- Private services may store the bounded report and export evidence, while
  sensitive artifact custody stays in a separately authorized backup boundary.
- Production backup claims still require encrypted storage, retention
  enforcement, and recurring isolated provider restores.
