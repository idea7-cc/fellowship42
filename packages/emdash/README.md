# @fellowship42/emdash

Fellowship42 church content for [EmDash](https://github.com/emdash-cms/emdash)
1.x sites. A trusted (native) EmDash plugin that adds:

- Portable Text blocks for church information, service times, upcoming events,
  recent sermons, groups, and courses, rendered live from the church's
  Fellowship42 instance through the public website contract;
- the same components for theme layouts (`@fellowship42/emdash/components`);
- a **Fellowship42** admin page that shows the connection and explains where
  each kind of content is edited; and
- schema.org Church data on the home page.

```sh
pnpm add @fellowship42/emdash
```

> **Not yet published.** This package and `@fellowship42/website-contract` are
> not on npm yet. Until they are, install the tarballs from a Fellowship42
> checkout (`pnpm --filter @fellowship42/website-contract pack` and
> `pnpm --filter @fellowship42/emdash pack`), as
> `pnpm acceptance:emdash-first` does.

```js
// astro.config.mjs
import { fellowship42 } from '@fellowship42/emdash'
emdash({ /* database, storage */ plugins: [fellowship42()] })
```

## Connection

An Administrator connects the site in **Plugins → Fellowship42 → Settings**,
or the site's deployment pins the connection:

| Deployment variable | Effect |
| --- | --- |
| `FELLOWSHIP42_URL` | Pins the instance address. Plugin settings are then not read at all. |
| `FELLOWSHIP42_INSTANCE_SHA256` | Pins the church identity whenever it is set, even when the address comes from plugin settings. The identity setting is then ignored. |
| `FELLOWSHIP42` service binding | Carries the requests to the instance Worker, only for an address pinned by `FELLOWSHIP42_URL`. An address from plugin settings always uses `fetch`. |
| `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` | Lets an address from plugin settings name a local or private host. For local evaluation only. |

An address from plugin settings must be a public host. Literal loopback,
private, link-local, carrier-grade NAT, and unspecified IPv4 and IPv6
addresses, `localhost`, `*.localhost`, `*.local`, and `*.internal` are
refused, and the **Fellowship42** page explains why, unless the deployment
sets `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true` or the site runs under
`astro dev`. An address the deployment pins is trusted as given.

The church identity pin is the instance's full 64-character portable identity
digest. Copy it from the **Fellowship42** admin page, which shows it in full
once connected, or from `instance.portableIdentitySha256` at
`<address>/api/website/v1` (the same value as
`bootstrap.portableIdentitySha256` at `<address>/api/health`). A pin that is
not 64 hexadecimal characters is reported on the admin page as "The church
identity pin is not a valid 64-character digest", and visitors see the
unavailable notice until it is corrected.

If the plugin settings cannot be read, church blocks show the unavailable
notice and the site logs `fellowship42.settings_unreadable`; the page still
renders.

The **Fellowship42** admin page is open to Contributors and above, so anyone
who can insert church blocks can see where church content is edited. Only
Administrators see its **Connection settings** link.

## Caching

Church blocks read the published records on every render, so a withdrawn or
deleted record disappears on the next visit, but only if nothing stores the
page. Pages that show church blocks or components must render on demand (no
`export const prerender = true`) and must not be cached by EmDash route
caching (`routeRules`, `Astro.cache.set`) or the Workers Cache. A church block
cannot opt its page out of caching itself: the response headers are decided
before the blocks finish rendering.

Keep those pages out of any `routeRules`, and add a middleware that marks
public HTML as not reusable, like the one the Fellowship42-first website uses.
Route caching follows its own options rather than `Cache-Control`, so the
middleware also opts the page out of it when a cache provider is configured:

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware'

// Church blocks render live Fellowship42 data; never serve a stored copy.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next()
  const isHtml = response.headers
    .get('Content-Type')
    ?.toLowerCase()
    .startsWith('text/html')
  if (!isHtml || context.url.pathname.startsWith('/_emdash')) return response
  if (context.cache.enabled) context.cache.set(false)
  if (response.headers.has('Cache-Control')) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})
```

## Theme components

```astro
---
import { UpcomingEvents } from '@fellowship42/emdash/components'
---
<UpcomingEvents node={{ _key: 'this-week', heading: 'This week', limit: 3, paginate: true }} />
```

`node` takes the same display choices as the block. `_key` (letters, digits,
`-`, `_`) names the component's paging parameter (`?f42-<_key>=`). Give each
paginated component on a page its own `_key`; without one, components of the
same type share a paging parameter. Heading ids stay unique either way.

## Packaging

EmDash loads Portable Text blocks and their renderers only from trusted npm
packages registered in site code, so installing this package needs source and
deploy access. The EmDash registry artifact `fellowship42-connect` offers the
connection, data routes, and structured data without the blocks. See
[EmDash church websites](https://github.com/idea7-cc/fellowship42/blob/main/docs/emdash-church-websites.md).

License: Apache-2.0.
