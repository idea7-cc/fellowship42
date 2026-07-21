# General-availability readiness

Fellowship42 distinguishes a releasable open-source application from a proven
hosted service. A passing repository gate establishes the software baseline; it
does not by itself establish a production security assessment, legal posture,
service objective, live restore, successful exit, or church/partner outcome.

## Public software baseline

A public release is technically ready when its reviewed source passes the full
repository checklist, produces reproducible checksummed artifacts, preserves a
complete independently useful instance, and documents deployment, security,
privacy, support, governance, compatibility, recovery, and exit boundaries.

Its public compatibility path consists of exact release verification, offline
and runtime doctor evidence, management-adapter conformance, payload-free
isolated-restore conformance, and the deterministic hosted-to-church-owned
migration rehearsal. These tests are available to every operator and do not
grant certification.

## Evidence required for a hosted-service GA claim

- An independent security/privacy review has a named scope, date, reviewer,
  disposition for every finding, and a safe public summary.
- A real isolated restore and hosted-to-church-owned exit have been exercised
  in dedicated provider accounts; redacted evidence records versions, timing,
  identity continuity, integrity, credential rotation, acceptance, and any
  exception.
- Service terms, privacy/data-processing terms, subprocessors, support and
  incident channels, backup/retention policy, recovery objectives, and exit
  responsibilities are approved and match implemented operations.
- At least one church pilot and one independently operated partner pilot have
  exercised onboarding, normal operation, support, upgrade, recovery, and exit
  expectations with findings resolved or explicitly accepted.
- The private service pins the exact published public release and continues to
  pass its own security, migration, contract, build, and deployment dry-run
  gates with remote effects disabled until separately approved.

## Honest release language

Until that evidence exists, describe the public software as a tested release
or release candidate and the hosted/partner service as a pilot or pre-GA
offering. Do not turn deterministic fixtures into claims about a live account,
operator, partner, or recovery time. Record external evidence in the private
service repository; never publish credentials, provider identifiers, church
records, donor data, raw exports, or private review details here.

See [Security and privacy](security-and-privacy.md),
[Third-party operators](third-party-operators.md), and
[Partner compatibility](partner-compatibility.md).
