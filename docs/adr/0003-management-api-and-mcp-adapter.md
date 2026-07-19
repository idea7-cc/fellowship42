# ADR 0003: Management API with optional MCP adapter

- Status: Accepted
- Date: 2026-07-18

## Context

Instances need reliable enrollment, health, backup, update, support, revocation,
and audit semantics across independently owned Cloudflare accounts. AI-enabled
operator clients would also benefit from MCP tools.

## Decision

Define a public, versioned management application protocol over authenticated
HTTPS. Prefer instance-initiated communication and independently scoped
capabilities. Put any MCP server in the private control-plane repository as an
adapter over the same application services used by the dashboard.

Do not use MCP as the durable fleet protocol, pass MCP tokens through to
instances, or invent a proprietary encryption layer.

## Consequences

- Non-AI dashboards, CLIs, partners, and third parties can implement the same
  management behavior.
- MCP remains useful without controlling transport, retries, or releases.
- Enrollment and signing require a threat-model ADR before implementation.
- Destructive MCP tools require confirmation, authorization, and audit logging.
