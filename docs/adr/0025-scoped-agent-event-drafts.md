# ADR 0025: Scoped agent event drafts

- Status: Accepted
- Date: 2026-09-18

## Decision

Extend the church-owned OAuth/MCP surface with `events:read` and `events:write`.
Both require the current local `events.write` permission. Event-only grants do
not require website administration. The existing church/website scopes still
require `church.write`; mixed token scopes require both permission sets. Refresh may narrow the token
to an approved subset, whose permissions are checked independently. Consent,
token exchange, every request, and conditional event creation enforce the
intersection of approved scopes and current local permissions.

`list_events` uses the same church-scoped list service as the staff API, with
bounded filters and cursor pagination. `create_event_draft` uses the same
validated creation service as the staff API, but accepts no publication field
and can create only a draft. Publication, editing, deletion, and participation
remain staff-app operations. Responses link to the church's event review page.

For an uncertain create result, clients retain the same UUID request key and
normalized input. An instance-local D1 ledger binds the key to its church,
connection, input hash, and event. The event, ledger, audit, and outbox record
are one atomic batch. Each connection can create at most 100 events; the cap is
checked inside the same write. Replays do not consume another creation. Competing identical retries return the existing event;
changed input conflicts. Deleting an event does not allow a soft-deleted event
to be recreated by retry. A retry returns the current event, so staff edits made
after creation are preserved. This is connection-scoped deduplication, not a
cross-agent or cross-connection guarantee. Reconnection requires reconciling
existing events before another create request.

## Consequences

Ministry leaders can delegate event preparation without website or financial
privileges. D1 remains authoritative, role removal and revocation fence writes,
and rejected writes emit no success audit/outbox evidence. OAuth credential
rotation can discard connection-scoped retry metadata; church events remain
portable business records. MCP does not gain publication or fleet privileges.

The initial pre-alpha schema is updated in place; no upgrade or migration
compatibility is promised. Existing grants gain no new scopes automatically.
