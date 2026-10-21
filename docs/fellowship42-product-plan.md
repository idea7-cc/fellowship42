# Fellowship42 product plan

Updated: 2026-10-02. This is the delivery plan, not a declaration of release or
service readiness. See [Current state](current-state.md) for implementation
status and [GA readiness](ga-readiness.md) for required evidence.

## Product thesis

Fellowship42 is a portable, open-source operating system for a church. A church
can choose managed hosting without surrendering the ability to take over a
working deployment and all of its data.

The initial market remains small and midsize U.S. Protestant and Evangelical
churches with lean staff teams. The product should remain adaptable to other
traditions without making the first workflows generic or abstract.

The customer promise is not “learn Cloudflare.” It is:

> Fellowship42 is managed for you when you want it and genuinely yours when you
> need it.

## Platform decision

Each church instance is an independent Cloudflare application:

- React and Hono deploy together as one Worker application;
- D1 is the relational system of record;
- R2 stores media and export objects;
- Durable Objects coordinate church-scoped realtime clients;
- instance-owned staff passkeys and sessions are the default; Cloudflare Access
  is an optional staff authentication adapter;
- Wrangler is the local and direct deployment toolchain;
- the public `f42ctl` owns planning, doctor evidence, export verification,
  provider-neutral import/cutover and reconciliation contracts; live collection
  and provider execution still require operator adapters.

Payments and communications remain external integrations. “All Cloudflare”
means Fellowship42 needs no second application backend, not that Cloudflare
replaces payment processors or delivery vendors.

## Product surfaces

### Open church instance

The complete React and Worker application for staff, ministry leaders, finance
users, members, and public church content is the product goal. Working source
currently covers staff workflows and public content; member identity and a
self-service portal remain proposed. The instance remains usable without any
commercial connection. Bible study and church communications will be optional
features of this same open application.

### Church website

The EmDash website is part of the church's installation. It owns editorial
pages, articles, menus, and presentation, and reads published church records
through the public website contract. Its database and media belong to the same
backup, restore, and exit boundary as the instance.

### Public project site

The Astro site for documentation, releases, community, self-management, and
public explanation of Fellowship42 services. It is not the customer dashboard.

### Fellowship42 Cloud

A separate private control plane and dashboard for provisioning, releases,
backups, monitoring, support, billing, and hosted customer operations.
The planned hosted phone offering adds managed SignalWire provisioning, usage
billing, number onboarding, support, and offboarding. The church-facing phone
app and communications records remain in the public instance.

### Partner Pro

A private role and product surface in Fellowship42 Cloud for certified experts
to manage their own client churches with delegated access, audit history,
release workflows, support tooling, and clear customer offboarding.

### Management API and MCP

The open management API is the stable optional connection between instances and
compatible control planes. A private MCP adapter may expose approved control-
plane operations to AI-enabled operator clients.

## Service editions

- **Community** — Apache-2.0 instance, public documentation, manual Wrangler or
  `f42ctl` lifecycle, no required management connection.
- **Hosted** — Fellowship42-operated instance, monitoring, backups, updates,
  support, and a documented export/redeployment exit; an optional managed phone
  service follows its own launch gate.
- **Sovereign managed** — church-owned Cloudflare account operated by
  Fellowship42; exit is primarily credential revocation rather than migration.
- **Partner managed** — church-owned account operated by a certified partner.
- **Partner Pro** — multi-client operational dashboard and commercial partner
  program.

Partners should generally operate church-owned infrastructure instead of owning
their clients' accounts. Ownership, billing, delegated access, emergency
revocation, and offboarding must be explicit.

## Domain priorities

The D1 model covers church profile and publishing, users and memberships,
people and households, ministries and groups, attendance, courses, events,
sermons, facilities, contributions, media, audit, idempotency, webhook
ingestion, and outbox delivery.

The product should deepen complete workflows on that model rather than add more
tables speculatively.

## Delivery sequence

### Existing software baseline — working source, locally tested

Staff passkeys, first-owner setup, team roles, people/households, ministry and
publishing workflows, manual contributions, normalized payment-event ingestion,
and durable outbox delivery exist. The EmDash website and both setup journeys
have local synthetic acceptance evidence, with independent review and public
distribution still pending. See the [website build handoff](emdash-build-handoff.md).

Management enrollment, scoped grants, rotation, disconnect, health, update
authorization, and diagnostic support approval exist. Export/import, restore,
and exit contracts have deterministic conformance evidence. They do not prove
a live backup, restore, upgrade, hosted service, or successful church exit.
Backup command execution and live provider adapters are still follow-up work.

### Readiness stages

| Stage | Required outcome | Current evidence / next work |
|---|---|---|
| Working alpha | A repeatable staff and website evaluation with synthetic data | Working source and local journeys; finish independent website review, staff reliability and larger-dataset checks, then explicitly declare alpha |
| Church beta / first live pilot | Staff can rely on the agreed workflows, with reviewed access and recoverable records | Browser/mobile/multi-user coverage, security/privacy review, real deployment and backup/restore proof, pilot findings |
| Hosted service | Managed provisioning, monitoring, updates, recovery, support, billing, and exit actually work | Public contracts exist; private implementation and live service evidence must be assessed separately |
| Hosted phone service | A supported church phone system with calling, messaging, numbers, emergency calling, and a tested exit | Planned; SignalWire spike, open phone app, private operations, and a separate phone pilot |
| Partner / GA | Independent operators and churches have demonstrated the advertised service | Public compatibility exists; live church/partner outcomes and GA evidence remain pending |

### 1. Working alpha — next delivery gate

- [ ] Complete the independent review of the EmDash change and resolve blocking
      findings; retain the evidence for both setup paths.
- [ ] Verify the everyday staff journeys: first owner and invitation, people
      and households, group roster and attendance, courses, publishing, and
      manual contributions, including denied access and uncertain save outcomes.
- [ ] Finish access beyond the first page in lists and selectors; improve retry
      and conflict messages; check empty states, keyboard use, and mobile layouts
      with realistic synthetic datasets.
- [ ] Pass `pnpm verify` and both website acceptance journeys on the reviewed
      revision. Prepare immutable artifacts and a usable distribution path for
      the website integration; public package/registry claims need actual
      publication evidence.
- [ ] Explicitly declare the working alpha and revisit the pre-alpha policy.

Until that declaration, follow `AGENTS.md`: edit schema version 1 in place,
declare no eligible upgrade sources, and keep deterministic fixtures green.
Do not spend this stage on live upgrade, restore, or exit certification.

### 2. Church beta — prove the first real workflows

- [ ] Agree the initial pilot scope: staff directory and ministry operations,
      website publishing, and manual contribution records. Resolve pilot findings
      with clear acceptance criteria.
- [ ] Exercise supported browsers, mobile, accessibility, concurrent edits,
      permission changes, and larger datasets across complete journeys.
- [ ] Before receiving real church records, review security/privacy and prove a
      deployment, scheduled backup, and isolated restore in dedicated accounts,
      including the website. Resolve blocking findings and define retention and
      recovery expectations.
- [ ] Add and test a real payment-provider adapter before accepting live gifts;
      the normalized payment-event API alone is not donation processing. Test
      reconciliation and any refund/recurring-giving behavior actually offered.
- [ ] Implement member identity, account claiming, recovery, and member-scoped
      views before advertising a member portal; this is a separate milestone
      from a staff-only beta.

After alpha, define supported upgrade sources and run live upgrade/exit
exercises when the pilot and hosted-service gates require them. No historical
pre-alpha tag becomes an upgrade source automatically.

### 3. Managed hosting — public contracts plus private operations

- [ ] Assess the private `fellowship42-cloud` implementation against the exact
      published public release; this repository does not establish its status.
- [ ] Complete live provisioning, domain setup, backup scheduling, health and
      alerts, update execution, customer billing, support, and incident recovery.
      Public update authorization is not evidence of a completed deployment.
- [ ] Prove isolated restore and hosted-to-church-owned exit, including the
      website, credential rotation, and local management revocation.
- [ ] Establish service terms, privacy/data-processing terms, subprocessors,
      recovery objectives, support responsibilities, and the church pilot.

Use [GA readiness](ga-readiness.md) for the evidence gate. The phone add-on is
separately launchable and does not delay a useful staff application or core
hosted service.

### 4. Partner operations and GA

- [ ] Implement and prove private partner organizations, delegated staff and
      church assignments, least privilege, operational audit, billing, and handoff.
- [ ] Complete an independently operated partner pilot and resolve its findings.
- [ ] Establish certification, support, and offboarding practices consistent
      with the public compatibility tests and trademark policy.

## STEP Bible integration and built-in study

Status: planned. First users are pastors and ministry leaders preparing sermons,
lessons, and group studies. This is a focused study workspace inside the church
app, with deeper STEP tools available through explicit links.

Recommended sequence:

1. **Reference integration.** Store structured scripture references on sermons
   and lessons, validate book/chapter/verse ranges, and open the same passage in
   STEP Bible. Keep references usable when STEP is unavailable. Only the
   intended passage and translation go into an external URL; private notes and
   church records stay local; suppress staff-page referrers. Evaluate an optional
   supported embed during the spike if it provides a good accessible mobile
   experience.
2. **Built-in reader.** Add passage lookup, navigation, search, and a small
   curated set of translations with confirmed distribution rights. Build the
   Fellowship42 UI around locally installed data; avoid making an upstream STEP
   server a required deployment component.
3. **Study tools.** Add selected STEP Greek/Hebrew lexicons, word information,
   morphology, translation comparison, and private study notes where pilot
   feedback demonstrates value. Member reading plans can follow member identity.

The upstream [STEPBible data repository](https://github.com/STEPBible/STEPBible-Data)
currently permits reuse under CC BY 4.0 with attribution and recorded changes.
That does not license every Bible translation shown on the STEP website. Record
the exact dataset/translation source, revision, checksum, terms, attribution,
and conversion changes for each distributed resource. The
[STEP application license](https://github.com/STEPBible/step/blob/master/LICENSE.md)
is a separate software license.

The spike must demonstrate reference parsing and versification, data conversion,
Cloudflare storage/search fit, licensing, and a mobile/keyboard reader. Completion
means a pastor can attach a passage to a sermon or lesson, read it, reach deeper
STEP study, and retain private notes and references through export/restore.
Public scripture fields require an explicit website-contract disclosure review.
Reference integration can follow the alpha reliability work; native study is a
separate deliverable and is not a beta prerequisite.

## SignalWire communications and hosted church phone service

Status: planned. SignalWire provides the external voice/messaging transport;
Fellowship42 provides the church's integrated communications experience. The
target is a usable church office phone system, including an in-app phone and
communications linked to authorized church workflows.

### Open church communications and phone app

Implement the church-facing features in `apps/instance`, usable with a church's
own SignalWire account as well as managed service credentials:

- shared, permission-scoped SMS/MMS inbox, one-to-one replies, consent and
  opt-out records, delivery status, and later ministry announcements;
- browser inbound/outbound calling, church caller ID, mute/hold, transfers,
  staff extensions, ring groups/queues, office hours, auto-attendant, forwarding,
  voicemail, and missed-call follow-up;
- explicit links between communications and people/households when the user
  has both permissions; a matching phone number alone grants no record access;
- administrative number/routing settings, staff access, authorized call/message
  history, retention, and portable export.

The [SignalWire Browser SDK](https://signalwire.com/docs/browser-sdk/v4/guides/overview)
supports browser communications, and its
[voice platform](https://signalwire.com/docs/platform/voice) supports SIP and
programmable call handling. Validate the required phone behaviors in a spike;
SDK availability does not prove a complete phone system. Keep transport and
real-time media at SignalWire; use Worker HTTPS handlers and provider-hosted
routing where supported, without making the Cloud dashboard a call handler.
Test desk-phone/SIP support and mobile/background incoming calls explicitly;
provide forwarding or another supported endpoint when a browser is closed.

Stage delivery as follows:

1. Prove Worker webhook verification, scoped browser tokens, outbound SMS,
   delivery events, and one browser call in an isolated test account. Confirm
   SDK/runtime compatibility, call routing, cost model, and provider account
   isolation before committing to the implementation shape.
2. Deliver the communications adapter and shared inbox with consent,
   deduplication, retry reconciliation, failure visibility, and export tests.
3. Deliver the phone app and office routing, then run a limited phone pilot with
   fallback endpoints. Complete the advertised phone feature set before selling
   it as full phone service.

### Hosted phone operations — private service

Fellowship42 Cloud offers managed phone onboarding, number purchase/porting,
registration, provisioning, usage metering, billing, fraud response, monitoring,
support, and offboarding. This implementation stays in `fellowship42-cloud` and
uses published public contracts for any instance configuration or records.
Community and church-owned modes use the same open phone app with their own
provider setup. Managed phone service is an optional commercial offering.

Before selling or replacing a church's main phone service:

- [ ] Confirm SignalWire commercial/reseller terms, church-specific provider
      resource/credential isolation, supported locations, number rights, and
      port-in, account-transfer, and port-out procedures. Validate any manual
      provider steps instead of assuming every operation has an API.
- [ ] Prove office routing, transfers, queues, voicemail, caller ID, simultaneous
      calls, SIP/desk phones where offered, mobile behavior, and carrier failures
      with real endpoints and measurable support/recovery objectives.
- [ ] Provision and verify emergency calling for the supported endpoint and
      location model. SignalWire's [E911 guide](https://signalwire.com/docs/platform/e911)
      requires address provisioning; prove active status and its 933 test path.
      Review emergency access/location and telecom obligations with qualified
      counsel before advertising a replacement phone service.
- [ ] Complete applicable messaging registration, consent, opt-out, and abuse
      controls. SignalWire's [messaging guide](https://signalwire.com/docs/platform/messaging)
      describes U.S. 10DLC brand/campaign requirements; handle toll-free numbers
      according to their own requirements.
- [ ] Define usage limits, toll-fraud controls, pricing and margins, suspension
      handling, incident support, and provider outage forwarding/fallback.
- [ ] Review recording/transcription consent, access, retention, and deletion;
      default optional recording and transcription to off.
- [ ] Prove church offboarding: export communication records and authorized
      media, transfer provider administration where supported or port numbers
      out, reconfigure routing/credentials, and preserve service during cutover.

### Data custody and independence

D1 owns church routing intent, permissions, consent, and retained communication
records; SignalWire owns live transport state and carrier observations. Durable
Objects coordinate UI state. Authorized voicemail/recording copies belong in
R2 with D1 metadata when retained by the church. Document SignalWire's external
copies, retention/deletion limits, and anything a portable export cannot contain.
Voicemail capture is distinct from optional whole-call recording.

Credentials remain server-side; browser clients get short-lived scoped tokens.
Verify provider webhooks using the documented signature scheme, handle replay,
and reconcile uncertain sends before retrying. Use Queues/Workflows for durable
background delivery. Private call/message content and recipient/caller numbers
must not enter fleet telemetry or public website responses.

Turning off management preserves local records and core workflows. Continuing
carrier service depends on an active provider account; ending hosted billing
therefore requires an explicit provider handoff or number port, not just a
Fellowship42 data export. These are distinct procedures. Proposed custody and
repository boundaries are recorded in
[ADR 0028](adr/0028-optional-bible-and-signalwire-integrations.md).

## Open-source and commercial boundary

The public repository is Apache-2.0 and owns the complete church instance,
public contracts, and portable lifecycle tools. Private value is operational:
fleet management, billing, monitoring, releases, support, and the partner
network.

The repository's [trademark policy](../TRADEMARKS.md) protects the Fellowship42
name, official service, and certified-partner designation without restricting
legitimate code forks. Compatibility remains separate from endorsement or
certification.

## Current product questions

- Which staff workflows and service promises define the first live pilot?
- Which translations and study tools matter most to the first churches?
- Which phone endpoints, locations, and office-routing features define the first
  phone pilot, and what requires a native mobile client?
- Which SignalWire account/resource model supports both managed billing and a
  tested church takeover or number-port exit?
- What member identity and recovery behavior is needed before a member portal?
- What export/restore duration and recovery objectives can Hosted promise?
- When does the hosted fleet require Workers for Platforms rather than ordinary
  per-instance Workers?
