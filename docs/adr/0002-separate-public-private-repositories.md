# ADR 0002: Separate public and private repositories

- Status: Accepted
- Date: 2026-07-18

## Context

The church application, lifecycle tooling, and management contract are intended
to be Apache-2.0. Hosted billing, fleet operations, commercial dashboards, and
partner administration may remain private and need a faster independent
release cadence.

## Decision

Keep the open instance in the public `fellowship42` repository and commercial
operations in a separate private `fellowship42-cloud` repository. Integrate
through published protocol packages, release manifests, and public lifecycle
tooling. Do not use a private subdirectory, private branch, or commercial-code
submodule in the public repository.

## Consequences

- Accidental publication and inaccessible mixed history are less likely.
- CI, issues, access controls, and release cadence remain independent.
- The public/private boundary must be a real versioned interface.
- Cross-repository integration needs canary packages and compatibility tests.
- The private service cannot rely on unpublished instance internals.
