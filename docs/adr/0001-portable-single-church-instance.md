# ADR 0001: Portable single-church instance

- Status: Accepted
- Date: 2026-07-18

## Context

A shared multi-tenant SaaS would make operational convenience easy but would
weaken data ownership, self-management, partner operation, and migration away
from Fellowship42 hosting.

## Decision

One Fellowship42 deployment is one portable church instance. It owns a Worker,
D1 data, R2 objects, Durable Object namespace, configuration, and portable
instance identity. It may run in Fellowship42-, church-, or partner-operated
Cloudflare infrastructure.

Domain records retain explicit `church_id` integrity and authorization checks
as defense in depth. Deployment isolation does not justify removing them.

## Consequences

- Churches can move by exporting and recreating an instance in another account.
- Hosted operations require fleet orchestration rather than a shared database.
- Migrations, backups, telemetry, and releases must work across many versions.
- A control-plane outage does not stop normal instance operation.
- Compute isolation is straightforward; operational tooling becomes the main
  commercial engineering investment.
