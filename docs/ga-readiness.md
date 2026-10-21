# General-availability readiness

Fellowship42 distinguishes a releasable open-source application from a proven
hosted service. A passing repository gate establishes the software baseline; it
does not by itself establish a production security assessment, legal posture,
service objective, live restore, successful exit, or church/partner outcome.

## Current assessment and delivery order

Assessed for planning: 2026-10-02. The source has working staff features and local
synthetic website acceptance evidence. The website change passed its independent
review on 2026-10-21 and still awaits public distribution. Member identity, STEP Bible study,
and SignalWire communications/phone service remain planned. This public
repository does not establish the private hosted service's implementation state.

The [product plan](fellowship42-product-plan.md) owns scope and sequencing. The
[current-state record](current-state.md) and
[website build handoff](emdash-build-handoff.md) describe the software and the
limits of existing evidence.

| Gate | Evidence needed to call it ready |
|---|---|
| Working alpha | Reviewed staff and website journeys with synthetic data, usable setup instructions, larger-dataset/retry checks, `pnpm verify`, both website acceptance journeys, and an explicit alpha declaration |
| First live church pilot / beta | Agreed staff scope, wider browser/mobile/accessibility and concurrent-user coverage, security/privacy findings resolved, a real deployment and backup/isolated restore including the website, and pilot acceptance |
| Live donations or member portal | A tested payment-provider adapter for donation claims; instance-owned member identity, claiming/recovery, and member-scoped views for portal claims |
| Hosted service | Private provisioning, domains, scheduled backups, updates, monitoring, billing, support, and recovery demonstrated against a pinned public release, with live exit evidence and matching terms |
| Hosted phone service | Tested phone app and office routing, provider/commercial isolation model, emergency calling, messaging registration, costs/abuse controls, support/fallback, and a real phone pilot and number exit |
| GA / partner certification | The hosted GA evidence below and an independent partner pilot, with any offered add-on meeting its own gate |

The pre-alpha policy in `AGENTS.md` remains authoritative until the working
alpha is explicitly declared, regardless of "early alpha" language in the
README. Keep schema version 1 and synthetic lifecycle fixtures; live upgrade,
restore, and exit evidence belongs to the later gates, not pre-alpha changes.
Do not infer eligible upgrade sources from historical tags.

STEP Bible and phone work do not block a staff-only alpha or beta. A native
Bible reader must have verified resource rights and usable reference/search
behavior before it is advertised. A full phone service has its own operating
and exit obligations even if the core hosted application is ready.

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

## Evidence required for a hosted phone-service launch

The [SignalWire milestone](fellowship42-product-plan.md#signalwire-communications-and-hosted-church-phone-service)
defines the planned feature set. In addition to the core hosted-service evidence:

- A named, dated phone pilot exercises real inbound/outbound calls, SMS/MMS,
  office hours, auto-attendant, staff routing, hold/transfers, queues, voicemail,
  caller ID, concurrency, and the browser/mobile/SIP endpoints being sold.
- An emergency-calling review defines supported locations and endpoint mobility,
  address updates, direct access, notifications where required, and responsibility
  for provisioning. Evidence includes active provider status and the approved
  test-number procedure. SignalWire documents address provisioning and 933
  testing in its [E911 guide](https://signalwire.com/docs/platform/e911).
- The relevant messaging registrations are approved and the app demonstrates
  consent, opt-out, delivery failure, abuse response, usage limits, and toll-fraud
  controls. See SignalWire's [messaging guide](https://signalwire.com/docs/platform/messaging).
- Provider outage, closed-browser, lost-network, credential rotation, and
  suspension scenarios have tested routing/fallback and support procedures.
  Availability and recovery promises match the measured service.
- Commercial/reseller terms, telecom responsibilities, pricing/unit economics,
  privacy/subprocessors, and recording/transcription policies have been reviewed
  and match the feature set and supported regions.
- A church-specific provider isolation model prevents one church's credentials
  or routing from accessing another church. Private provisioning and metering
  use public contracts; ordinary calls do not require the Cloud dashboard.
- A real offboarding exercise exports retained records and authorized media,
  transfers provider administration where supported or ports the church's
  numbers out, preserves routing through cutover, and rotates credentials.
  External provider retention and non-exportable data are documented.

Phone-service readiness is separate from a working SignalWire adapter, a browser
call demo, or a Fellowship42 export. Retain detailed provider, commercial, and
pilot evidence in `fellowship42-cloud`; publish only safe summaries here.

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
