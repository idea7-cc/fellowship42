# ADR 0028: Optional Bible study and SignalWire church communications

- Status: proposed
- Date: 2026-10-02

## Context

The product plan now includes STEP Bible integration or built-in study, a
SignalWire communications integration, and a managed church phone offering.
These additions affect external data custody, credential ownership, hosted exit,
and the public/private repository boundary. A plan must preserve an independently
useful church instance before any provider integration is implemented.

The existing architecture permits external payment and communication providers.
It does not permit a private control plane to become the church's application,
identity authority, record store, or required backend for normal workflows.

## Proposed decision

### One church application, optional integrations

Bible study and the church-facing phone/communications app belong to the public
`apps/instance` application. They use the existing portable instance identity,
church-scoped permissions, D1 records, and authorized R2 storage. They introduce
no second portable church identity or required private application backend.

The proposed [product plan](../fellowship42-product-plan.md) stages reference
links before native Bible study, and a provider spike and communications adapter
before a complete phone app and separately qualified hosted phone service.
Implementation details and any new public provider-management capability remain
subject to the spike and a reviewed versioned contract.

### STEP Bible data and study boundaries

Start with structured passage references and explicit links to STEP Bible.
Evaluate a native Fellowship42 reader using selected licensed data without
requiring an upstream STEP server or private study service. An embed is optional
and needs a verified supported mechanism and a usable privacy/accessibility model.

Resource selection records exact provenance, revision, checksums, redistribution
terms, attribution, and conversion changes. STEP's
[data license](https://github.com/STEPBible/STEPBible-Data) and
[software license](https://github.com/STEPBible/step/blob/master/LICENSE.md) are
distinct; neither implies permission to redistribute every translation displayed
on its website.

Private study notes and saved church references remain in the instance and its
portable export. External requests carry only the selected passage/translation,
never application-supplied private notes, user identifiers, or church records;
external links suppress staff-page referrers. Any added public scripture
fields go through the website contract's published-field disclosure review.

### SignalWire transport and church records

SignalWire handles PSTN, SMS/MMS, SIP/WebRTC media, and live carrier state.
The public church app owns permission-scoped communication workflows, routing
intent, consent/opt-out, retained history, and authorized media metadata. D1
remains the church's system of record; Durable Objects coordinate UI state.
Provider event IDs are adapter identifiers, never portable church identities.

Private provider credentials stay server-side and are separate from management
credentials. Browser clients receive short-lived tokens scoped to permitted
resources. Webhooks use SignalWire's documented signature verification plus
deduplication and reconciliation; durable background work uses Queues/Workflows.
External recipient numbers and required message/call content necessarily reach
the provider. Document that custody and its retention/deletion limits.

Retained voicemail and optional recording copies use R2 with D1 authorization
metadata. Private call/message content, study notes, and recipient/caller numbers
never become fleet telemetry or anonymous website content. A communication's
phone number match grants no directory or pastoral-record permission.

### Public app and private hosted operations

An independently operated church can use the same public phone app with its own
SignalWire account. No core workflow, export, or study feature requires a managed
phone subscription. Calls still require an active external carrier service.

The private `fellowship42-cloud` repository owns managed provider provisioning,
commercial entitlements, billing/metering, fleet administration, fraud operations,
and service support. It configures the instance only through reviewed public
contracts; it never imports public application internals or reads church D1
directly. Routine call handling must not depend on the Cloud dashboard.

The provider account/project/space isolation model is not selected by this ADR.
The spike must prove church-specific credential/resource isolation, commercial
terms, and a workable takeover or number-port path before that model is accepted.

### Exit and independent operation

Revoking Fellowship42 management leaves core workflows and retained records
intact. Disabling communications preserves local history and export. Revoking
carrier credentials ends transport access and is a separate owner action.

A Fellowship42 export includes retained communication records, routing intent,
consent, and authorized media, with provider secrets rotated/reprovisioned rather
than exported. Provider-held transport state and external copies have documented
limits. An export cannot transfer a carrier account or phone number by itself.

Hosted offboarding must therefore include provider administration transfer where
supported or number port-out, routing cutover, credential rotation, retained-data
handoff, and continuity/fallback. Provider billing termination and management
disconnect must not be conflated. Number rights and any manual provider steps
must be explicit in the commercial service agreement.

## Consequences

- The public church application remains complete and independently operable;
  managed phone value comes from operations and support.
- Native Bible data and retained communications expand resource/license and
  export inventories when implemented, not during this planning change.
- Carrier dependency and external custody are visible and separately revocable.
- A phone demo is not a church phone service. The separate
  [phone launch gate](../ga-readiness.md#evidence-required-for-a-hosted-phone-service-launch)
  requires emergency calling, messaging registration, supported endpoints,
  commercial review, live pilot, fallback, and number exit evidence.

This ADR records a proposed implementation boundary. It does not declare a
provider isolation model accepted, add capabilities or storage, or claim that
STEP Bible, SignalWire, or a hosted phone service has been implemented.
