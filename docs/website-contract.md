# Public website contract

A Fellowship42 instance serves its church's **published** content to websites
through a small, versioned, read-only HTTP contract. Both the website a
Fellowship42 installation deploys and any independently operated EmDash site
read church content through it. See [ADR 0027](adr/0027-emdash-church-websites.md).

- Contract name: `fellowship42-website`
- Current major version: `1`
- Base path: `/api/website/v1` on the instance origin
- Package: [`@fellowship42/website-contract`](../packages/website-contract)
  (types, strict parsers, a runtime-neutral client, and time-zone-safe
  formatters)

## Guarantees

- **Anonymous and identity-independent.** The instance never reads cookies,
  Access assertions, or sessions for these routes. A staff session cannot make
  a draft or private record appear.
- **Published only.** A record appears only while it and the church website are
  published and it is not deleted. Fields come from an explicit allowlist:
  no versions, internal ids of other records, capacities, drafts, people, or
  finance data.
- **No stale copies.** Every response is `Cache-Control: no-store`. Withdrawing
  or deleting a record removes it from the next response.
- **Readable from any origin.** Responses carry `Access-Control-Allow-Origin: *`
  and `Cross-Origin-Resource-Policy: cross-origin`, and never set cookies.
  Public `/media/*` responses are also embeddable cross-origin. They answer
  `HEAD`, entity-tag and date preconditions, `If-Range`, and a single byte
  range as RFC 9110 specifies; any other `Range` gets the whole file.
- **No silent truncation.** Every list is paged with an opaque cursor.
- **Absolute links and unambiguous time.** URLs are absolute on the instance
  origin. Instants are ISO 8601 UTC (`Z`) with the IANA zone in which they
  should be shown. Sermon dates are calendar dates. Service times are wall-clock
  times in the church's zone.

## Envelope

Every successful response and every 4xx contract error starts with:

```json
{
  "contract": "fellowship42-website",
  "version": 1,
  "instance": { "portableIdentitySha256": "<64 hex>" }
}
```

`portableIdentitySha256` is the SHA-256 of the instance's portable identity,
the same value `/api/health` reports as `bootstrap.portableIdentitySha256`. A
consumer may pin it to refuse a different church. Consumers must refuse any
other `contract` value or major `version`. Within version 1, fields may be
added; consumers ignore fields they do not know.

5xx responses have no envelope. Their body is only
`{ "error": { "code", "message", "requestId" } }`: an instance without a
valid portable identity has no digest to report.

## Routes

All routes are `GET` (with `HEAD` and `OPTIONS`).

| Route | Returns |
| --- | --- |
| `/api/website/v1` | Descriptor: `site.status` (`published` or `unpublished`), `church` (`{name, slug}` only while published, otherwise `null`), and `origin` |
| `/api/website/v1/church` | `church`: name, slug, tagline, summary, `timezone`, address, contact (`phone`, `email`, `website`), links (`giving`, `livestream`), `logo`/`cover` (`{url, alt}` or `null`), `theme.preset`, and `serviceTimes[]` (`label`, `day` 0 = Sunday, `time` `HH:MM`) |
| `/api/website/v1/events` | Events that have not ended (by end time, or start time when there is no end), soonest first: `id`, `slug`, `title`, `summary`, `startsAt`, `endsAt`, `timezone`, `location`, `registrationUrl`, `featured` |
| `/api/website/v1/sermons` | Newest first: `id`, `slug`, `title`, `speaker`, `series`, `summary`, `preachedOn` (`YYYY-MM-DD`), `videoUrl`, `audio` (`{url, contentType}` for public audio, or `null`), `featured` |
| `/api/website/v1/groups` | Featured first, then by title: `id`, `slug`, `title`, `groupType`, `audience`, `schedule`, `location`, `enrollment` (`open`, `request`, `closed`), `featured`, `summary` |
| `/api/website/v1/courses` | Featured first, then by title: `id`, `slug`, `title`, `courseType`, `deliveryMode`, `audience`, `duration`, `featured`, `certificateOffered`, `summary`, `lessonCount`, and `url` (the course's public page on the instance) |

Only `http` and `https` links are ever returned. Images and audio are included
only while their media is public.

### Paging

List routes accept `limit` (1–100, default 20) and `cursor`. A response is
`{ ...envelope, items, nextCursor }`; `nextCursor` is `null` on the last page.
Cursors are opaque keyset positions: pages never overlap or skip records.
Records that change while a reader pages are seen as of each request.

A cursor is at most 1024 URL-safe characters (`A–Z`, `a–z`, `0–9`, `-`, `_`)
and works only on the route that issued it. It encodes its key as UTF-8, so
titles in any script page correctly. Pass it back unchanged; its contents may
change without notice.

### Errors

| Status | `error.code` | Envelope | Meaning |
| --- | --- | --- | --- |
| 404 | `site_unpublished` | Yes | The church website is not published. No church details are returned. |
| 404 | `route_not_found` | Yes | No contract route has this path. |
| 400 | `invalid_limit` | Yes | `limit` is not 1–100. |
| 400 | `invalid_cursor` | Yes | The cursor is malformed or was issued by another route. |
| 503 | `instance_unconfigured` | No | The instance has no valid portable identity. |
| 500 | `internal_error` | No | The instance failed unexpectedly. |

## Client states

`createChurchSource()` in the package turns every outcome into data or one of
these named states, which a website renders deliberately instead of showing
stale or guessed content:

| State | When |
| --- | --- |
| `not-configured` | No or invalid instance address |
| `unavailable` | Network failure or timeout, including while the body is read; 5xx; or 429 |
| `incompatible` | Not this contract, another major version, a body that is not JSON, a malformed document, or a 4xx contract error this client does not know (such as `route_not_found`) |
| `unpublished` | The church website is not published |
| `wrong-instance` | The identity digest differs from the pinned one |
| `invalid-request` | A malformed, stale, or foreign page cursor |

## Changing the contract

Additive fields are allowed within version 1: update the types, parsers,
instance mapping, and tests together. Removing or reinterpreting a field,
changing an ordering, or changing a guarantee requires a new major version under
a new base path. Pre-alpha, version 1 itself may still change without a new
major version; that allowance ends when the alpha is declared.
