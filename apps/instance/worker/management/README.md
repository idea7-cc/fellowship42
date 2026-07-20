# Optional instance management adapter

This directory is the only intended HTTP boundary between an open Fellowship42
instance and optional management software.

The adapter implements the ADR 0010 wire/security profile and ADR 0011 runtime
boundary. Local owners control enrollment, grants, rotation, status, and
disconnect through `/api/management`. The only sessionless route consumes a
short-lived one-time challenge plus a signed operator proposal; it grants
nothing. Operator communication is initiated by the instance scheduler.

Runtime files:

- `service.ts` owns encrypted instance identity, enrollment, grants, local
  status, rotation, disconnect, and audit state.
- `sync.ts` owns bounded HTTPS delivery, signed polling/results, replay
  reservation, command authorization, and scheduled failure handling.
- `updates.ts` owns exact release verification, preparation state, local
  approval consumption, and signed deployment-authorization evidence.
- `../routes/management.ts` is the local HTTP surface. It is not the operator
  command transport.

This release executes `instance.status.read`, `instance.health.read`,
`update.prepare`, and `update.apply`. Update apply authorizes a separately
credentialed reconciler; it never deploys from inside the instance. Other
protocol commands are typed but fail closed until their own implementation and
tests land.

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

`MANAGEMENT_KEY_ENCRYPTION_KEY` is an optional 32-byte base64url Worker secret.
Do not put it in Wrangler vars or source control. For wrapping-key rotation,
temporarily configure the old secret as
`MANAGEMENT_KEY_ENCRYPTION_KEY_PREVIOUS`, rotate the local instance identity,
then remove the previous secret. See ADR 0011.
