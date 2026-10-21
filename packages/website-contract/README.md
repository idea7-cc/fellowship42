# @fellowship42/website-contract

Types, strict parsers, a runtime-neutral client, and time-zone-safe formatters
for the Fellowship42 **public website contract** (version 1): a church's
published profile, service times, events, sermons, groups, and courses, served
anonymously by a Fellowship42 instance under `/api/website/v1`.

```ts
import { createChurchSource } from '@fellowship42/website-contract'

const source = createChurchSource({
  url: 'https://app.example.org',
  expectedInstanceSha256: null, // or the instance's identity digest to pin it
  fetch: (url, init) => fetch(url, init),
})
const page = await source.list('events', { limit: 10 })
if (page.ok) console.log(page.data.items, page.data.nextCursor)
else console.log(page.state) // not-configured, unavailable, incompatible, …
```

Every outcome is either data or a named state, so a website can render a
deliberate notice instead of stale content. The contract, its guarantees, and
its versioning rules are documented in
[docs/website-contract.md](https://github.com/idea7-cc/fellowship42/blob/main/docs/website-contract.md).

The package also contains the short-lived setup claims a Fellowship42
installation uses to let its owner claim the website's first administrator.

License: Apache-2.0.
