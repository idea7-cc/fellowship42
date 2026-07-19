# Optional instance management adapter

This directory is the only intended HTTP boundary between an open Fellowship42
instance and optional management software.

The adapter is currently scaffolding: no remote enrollment or command endpoint
is enabled yet. ADR 0010 and the public protocol package now fix authentication,
signing, replay, revocation, compatibility, and an executable interoperability
fixture. The next increment must implement those contracts without weakening
them.

Rules for this boundary:

- Consume `@fellowship42/management-protocol`; never import private dashboard or
  control-plane code.
- Deny every capability until an instance owner explicitly enrolls and grants it.
- Keep infrastructure deployment credentials separate from management identity.
- Prefer instance-initiated polling so independently operated deployments need
  no privileged inbound channel.
- Do not transmit member, donor, financial, or pastoral data as telemetry.
- Make disconnect and key rotation locally available to the church owner.
- MCP belongs in a separate adapter over this API, not in this core transport.
