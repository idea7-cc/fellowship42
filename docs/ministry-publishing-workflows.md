# Ministry and publishing workflows

Fellowship42 keeps group, course, event, sermon, and media publishing inside the
portable church instance. These workflows work without Fellowship42 Cloud and
store their authoritative records in the church's D1 database and R2 bucket.

## Operator capabilities

The owner wildcard permission includes every workflow. The system
`ministry-leader` role receives these bounded permissions:

- `groups.write`
- `courses.write`
- `events.write`
- `sermons.write`
- `media.write`

Management endpoints show draft, published, and archived records and provide
server-side search, bounded cursor pagination, strict validation, optimistic
versions, soft deletion where the domain table supports it, redacted audit
evidence, minimal outbox events, and realtime invalidation. The public church
routes continue to return only published content.

## Courses and lessons

Courses own ordered lessons. Lesson text is plain content rendered safely by
React; it is not interpreted as HTML. Lesson writes are scoped by church and
course and use their own optimistic version. A published course may reference
only non-deleted public media from the same church. Publishing also rechecks all
existing lesson media, so a draft cannot bypass that rule.

## Sermons and events

Event inputs require valid IANA timezones and an end after the start. Public
event reads remain limited to upcoming published events. Sermons accept public
video URLs and may reference an audio media record owned by the same church. A
published sermon cannot reference private audio.

## R2 media lifecycle

Uploads are limited to 20 MiB and an allowlist of common image, audio, video,
and PDF content types. SVG is intentionally excluded from same-origin delivery.
The Worker computes SHA-256 from the received bytes, writes the object beneath a
church-scoped opaque R2 key, and then records ownership, type, size, checksum,
alt text, visibility, creator, and version in D1. If the D1 transaction fails,
the newly written R2 object is removed before returning the error.

Public delivery always authorizes through D1 before reading R2. It supports
conditional and ranged R2 reads, preserves safe HTTP metadata, emits an ETag,
and serves PDFs as attachments. Private or deleted media is never returned by
the public route.

Media referenced by published content cannot be made private or deleted. A
successful soft delete denies new requests through D1 and schedules the exact
R2 key for deletion after the response. Public responses have a five-minute,
must-revalidate browser cache; publication should therefore be treated as
public disclosure, not as a secure way to distribute sensitive material. D1
remains the authorization record even if asynchronous R2 cleanup needs a later
retry.

## Privacy and event shape

Audit and outbox records contain IDs, publishing state, changed-field names,
times, coarse media type/size, and operation evidence. They do not duplicate
lesson bodies, summaries, alt text, filenames, media bytes, or R2 keys. Every
optimistic mutation has a unique operation token so a losing concurrent request
cannot emit audit/outbox side effects.

Implementation and integration coverage live in:

- `apps/instance/worker/routes/groups.ts`
- `apps/instance/worker/routes/courses.ts`
- `apps/instance/worker/routes/events.ts`
- `apps/instance/worker/routes/sermons.ts`
- `apps/instance/worker/routes/media.ts`
- `apps/instance/test/content.spec.ts`
