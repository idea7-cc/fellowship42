# Optional management protocol

## Purpose

The management protocol connects a portable Fellowship42 instance to compatible
management software without making that software a dependency. Fellowship42
Cloud is one implementation; an independent church or partner may implement
another.

The TypeScript and Zod contract starts in
`packages/management-protocol`. The instance integration point is
`apps/instance/worker/management`. No management endpoint is enabled yet.

## Protocol layers

Keep these layers separate:

1. **Application protocol** — versioned descriptors, capabilities, commands,
   results, export metadata, and error contracts.
2. **Secure transport** — HTTPS, instance/control-plane identity, request
   signing or mutually authenticated transport, expiration, nonces, replay
   rejection, and key rotation.
3. **Infrastructure authorization** — separately scoped Cloudflare authority
   used to create or deploy Workers, D1, R2, domains, and secrets.
4. **MCP adapter** — optional tools/resources for AI-enabled operator clients.

A management credential must never silently become a Cloudflare deployment
credential. An MCP bearer token must never be passed through to an instance or
to the Cloudflare API.

## Connection lifecycle

The intended lifecycle is:

1. A local church administrator enables management and receives a short-lived,
   one-time enrollment challenge.
2. The instance creates or selects its own management identity.
3. The administrator approves an operator and a minimal capability set.
4. The instance initiates status polling over authenticated HTTPS.
5. Commands include the instance ID, command ID, issue and expiry times, nonce,
   required capability, and typed input.
6. The instance verifies identity, expiry, replay state, capability, and command
   validity before performing an operation.
7. Results and all security-relevant decisions are audited on both sides.
8. A local administrator can disconnect or rotate identity without contacting
   the control plane.

The exact key format, signing algorithm, canonical request representation, and
enrollment exchange require a dedicated threat-model ADR before implementation.
Use platform Web Crypto and established formats; do not create custom encryption.

## Initial capabilities

The contract reserves these independently grantable capabilities:

- `instance.status.read`
- `backup.export`
- `update.prepare`
- `update.apply`
- `support.session.request`
- `management.disconnect`

Enrollment grants nothing implicitly. Reading operational status must not imply
access to church records. Preparing an update must not imply authority to apply
it. Support sessions must be time-limited and separately approved.

## Privacy baseline

Routine control-plane status may include:

- portable instance ID;
- application, schema, protocol, and export-format versions;
- binding/resource readiness without account secrets or resource IDs;
- backup freshness and integrity status;
- aggregate request/error health that cannot identify church members.

It must not include member, donor, contribution, attendance, counseling,
pastoral, authentication-token, message, or document contents.

## MCP position

MCP is a useful adapter for an operator to discover instances, read health,
prepare upgrades, request exports, or open approved support workflows. It is not
the instance-to-control-plane durability mechanism.

The MCP server belongs in the private `fellowship42-cloud` repository and calls
the same control-plane application services as the dashboard. Mutating tools
require user confirmation, scoped authorization, and audit records.

## Compatibility

Every descriptor and command carries a wire protocol version. The application
release manifest will declare the management protocol versions it supports.
Unknown commands or capabilities are rejected safely; they are never treated as
generic code execution.

Protocol changes that affect trust, identity, capability semantics, export, or
backward compatibility require an ADR and contract tests in both repositories.
