# `@fellowship42/management-protocol`

This public package contains the versioned contracts shared by a portable
Fellowship42 instance and optional compatible management software.

It deliberately contains no Fellowship42 Cloud client, billing model, partner
implementation, Cloudflare credential, custom cryptography, or MCP server. The
private control plane consumes this package in the same way as any third-party
implementation.

Current contracts establish:

- the `single-church` deployment topology;
- portable instance identity and application/schema versions;
- infrastructure owner separately from operator;
- independently grantable management capabilities;
- command expiry, nonce, and result fields needed by a secure transport.

The package is pre-1.0 scaffolding. No management endpoint is enabled in the
instance yet. See `../../docs/management-protocol.md` and ADR 0003 before adding
wire behavior.
