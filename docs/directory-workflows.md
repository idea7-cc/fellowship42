# People and household directory

The directory is church-private application data. It is authoritative in the
church instance D1 database and is never copied into Fellowship42 Cloud fleet
metadata.

## Authorization

- `people.read` lists and reads people.
- `people.write` creates, changes, and soft-deletes people.
- `households.read` lists households and their active person links.
- `households.write` creates, changes, and soft-deletes households and manages
  household membership.
- The system owner role has `*`; other roles receive only deliberately assigned
  permissions. A church membership without the relevant grant is insufficient.

Every route resolves the signed-in Access identity to an active church
membership and checks the permission in D1. Browser state only determines which
controls to display.

## API behavior

People live under `/api/people/{churchId}` and households under
`/api/households/{churchId}`. List endpoints provide bounded, server-side
search plus opaque stable cursor pagination. People can be filtered by
membership status; household search includes household fields and linked person
names without returning notes.

Create and update bodies use strict schemas and reject unknown fields. Email is
unique within one active church directory. Person detail is the only directory
response that includes private notes.

Updates, deletes, and household-member changes require the record version that
the editor loaded. D1 increments that version only when it still matches. An
opaque per-operation token conditions every later statement in the same batch,
so a losing concurrent request cannot write an audit event, outbox event, or
household link after another editor wins.

Deletes are soft deletes. They disappear from directory reads while preserving
referential and audit history for later retention policy.

## Audit and realtime behavior

Successful mutations write an in-instance audit event and publish a minimal
outbox event. Audit snapshots record status, boolean presence indicators, and
changed field names rather than names, addresses, email, phone, or note text.
The church Durable Object broadcasts only entity ID, action, church ID, and
time so other authorized screens can invalidate cached reads.

Fellowship42 Cloud receives none of these directory payloads. Future support
health signals may report only privacy-bounded operational readiness, never
people or household contents or counts.
