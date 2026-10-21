# EmDash church websites and Fellowship42 Connect

Status: implemented and independently reviewed (2026-10-21); not yet published.  
Prepared: 2026-09-30. Builder: Claude Opus 5.5. Independent reviewer: Codex.

## Outcome

Fellowship42's default published church website is an EmDash website, with a
reusable Fellowship42 integration already installed and connected. A church
starting with an independently operated EmDash website can install that same
integration and obtain the same church-content capabilities.

Both paths use the same public contract and rendering behavior. Themes may
differ. Fellowship42 owns church records; EmDash owns editorial website content.
The result works without Fellowship42 Cloud, Core7 Cloud, or a proprietary
service.

This plan defines the product outcome and acceptance evidence. The builder
chooses the implementation, deployment layout, package boundaries, sequencing,
and appropriate tests. Use the simplest supported design that meets the outcome.

## Required outcomes

### Reliable existing workflows

Close the three confirmed defects before handing over the integrated result:

- A successful contribution save reports success. Retrying an entry after a lost
  response creates one contribution for that action.
- Switching between records cannot carry one record's unsaved values into
  another. A previous request completing cannot alter a newly opened editor.
- Recorded attendance and participant visibility survive subsequent roster
  changes, including completed or removed memberships.

Cover the reproduced failures and materially similar affected workflows. The
broader staff backlog remains separate from this build.

### Two setup paths, one integration

- **Fellowship42 first:** a fresh church installation provides an EmDash website
  with the integration and required renderers installed and tied to the correct
  church. The owner can enter the staff app and website editor through documented
  setup, preview the website, and publish it.
- **EmDash first:** an administrator installs the distributable integration on
  an independent EmDash site, connects the intended Fellowship42 instance, and
  uses the same church-content components. This path needs neither Core7web nor
  a managed-service subscription.

Prepare the connector for EmDash registry distribution, together with any
required renderer or theme packages. Package structure is the builder's choice.
Validate the registry artifact locally and explain any trusted-package or theme
installation requirements. Actual public publication follows independent review.

### A usable church website

An editor can create, edit, preview, and publish ordinary website pages and
articles through EmDash without changing code. Provide a suitable default church
presentation and reusable components for church information/service times,
upcoming events, and recent sermons. Existing public group and course workflows
remain reachable and usable.

The website is usable on mobile and with a keyboard, has meaningful
server-rendered content and page metadata, and handles empty or unavailable
church content clearly. Local instructions must provide a working authenticated
evaluation journey with synthetic data.

### One authority for each kind of content

Church profile, service times, events, sermons, groups, and courses remain
authoritative in Fellowship42. EmDash owns pages, articles, navigation, and
presentation. Editors understand where to change each kind of content and what
each publish action makes public. Avoid a second independently editable copy of
church records.

Provide a documented, versioned public website contract suitable for distributed
plugins. It exposes only intended published fields, handles larger datasets
without silent truncation, and identifies incompatible connections clearly.
Images, links, and event times work when the app and website have different
origins and staff browsers use different timezones.

Withdrawing or deleting Fellowship42 content removes it from both website paths
on the next fresh public request. Staff sessions and website previews never make
private church data public. An unavailable source produces a deliberate website
state rather than silently presenting withdrawn content.

### Church ownership and permission boundaries

Preserve one church-owned operational and portable installation boundary,
independent of the number of physical components. Church workflows, website
operation, and the documented exit path remain independent of private management.
Each website has one deployment authority; connecting church content does not
silently transfer hosting control.

Public content requires no staff credential. Any privileged connection uses
explicit, revocable permissions. Website editor access does not confer church
finance, directory, or fleet access. Preserve the existing draft-only church
agent capabilities and staff publication controls. Provide a clear editor
sign-in path; seamless single sign-on is an implementation choice, not a reason
to grant every editor owner privileges.

Document the source, configuration, databases, media, and credential disposition
needed to reconstruct a generated church installation. Reflect new website
components in the public lifecycle inventory and deterministic portability
fixtures. An independently operated EmDash site retains explicit ownership and
backup responsibilities. Follow the repository's pre-alpha policy: live upgrade,
restore, and cross-account exit exercises await an alpha declaration.

## Design freedom and scope

Read `AGENTS.md`, the architecture, and repository strategy. This proposal
changes the default website direction; record the chosen architecture in an ADR
and align affected instructions and documentation when implementing it. Preserve
church ownership, private-data protection, and the public/private boundary.
Changes to physical deployment topology are permitted within those outcomes.

Use supported EmDash/Astro APIs and suitable open Core7web work where useful.
Core7web is a reference and possible public dependency, not a required desktop
manager or hosted runtime. Its general website tooling and Fellowship42's church
business logic retain distinct responsibilities. Do not vendor private Cloud
code or depend on another checkout's unpublished internals.

Choose current, compatible dependency versions and verify the upstream behavior
the integration relies on. The earlier review found Core7web's latest M4 work on
EmDash 0.42.0 with a planned 1.0.1 move; that is context, not a version requirement.

This build covers the public Fellowship42 repository. Member self-service,
payment-provider integration, a new private control plane, Core7web changes, and
public package/site publication are separate work. Existing ministry publication
lifecycles and ordinary staff workflows must continue working.

## Acceptance and review handoff

Provide observable evidence for these journeys and failure cases:

| Outcome | Evidence expected |
| --- | --- |
| Existing reliability | Reproductions of the three defects now pass, including an uncertain contribution retry, record switching with an outstanding request, and historical attendance after roster changes. |
| Fellowship42-first setup | A fresh synthetic installation reaches staff sign-in, EmDash editing, private preview, and a published church website using documented steps. |
| EmDash-first setup | A separate EmDash site installs and connects the integration and renders the same source records through the same contract. |
| Editorial work | An editor creates a page, previews an unpublished edit, and publishes it; public visitors see only the published result. |
| Church-content lifecycle | Publish, edit, withdraw, and delete source content; verify both website paths, timezone behavior, cross-origin media/links, empty lists, larger datasets, and an unavailable source. |
| Access boundaries | Draft/private content stays private, unauthorized connection changes fail, and relevant revocation or role removal stops privileged access. |
| Distribution and ownership | The registry bundle validates locally, renderer requirements are documented, and lifecycle fixtures account for the generated installation's components. |
| Usability and verification | Browser checks cover the principal journeys, mobile and keyboard use; required repository checks and checks for new product surfaces pass. |

Run `pnpm verify` with the repository toolchain. Report failures honestly and
distinguish local, simulated-provider, and deployed evidence. No production
credentials or real church data are needed for this handoff.

Leave a concise, repository-contained handoff identifying the reviewed revision
or exact diff, design decisions, tested versions, reproduction commands,
acceptance evidence, and remaining limitations. Keep progress resumable across
sessions. Completion means the required outcomes work and the evidence is ready
for Codex's independent review. Public release and deployment follow that review.

## References

- [Current Fellowship42 state](current-state.md), [architecture](architecture.md),
  and [repository strategy](repository-strategy.md).
- [Church publishing](church-setup-and-publishing.md), [agent permissions](agent-connections.md),
  and [portable exports](portable-exports.md).
- [Core7web CMS template](https://github.com/idea7-cc/core7web/blob/45752356382f13f0988d93980ecaa22851a6819f/templates/cms/base/astro.config.mjs)
  and [EmDash conformance approach](https://github.com/idea7-cc/core7web/blob/45752356382f13f0988d93980ecaa22851a6819f/conformance/emdash/README.md)
  from the remote-branch review. Recheck current upstream work before reuse.
- EmDash [plugin formats](https://docs.emdashcms.com/plugins/creating-plugins/choosing-a-format/),
  [rendering components](https://docs.emdashcms.com/plugins/creating-native-plugins/portable-text-components/),
  [publishing packages](https://docs.emdashcms.com/plugins/creating-plugins/publishing/),
  and [site transfer](https://docs.emdashcms.com/guides/site-transfer/).
- [Copy-ready Opus build prompt](emdash-opus-build-prompt.md).
