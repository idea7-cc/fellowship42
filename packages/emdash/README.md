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

```js
// astro.config.mjs
import { fellowship42 } from '@fellowship42/emdash'
emdash({ /* database, storage */ plugins: [fellowship42()] })
```

Connect it with plugin settings (Administrators only), or pin it in the site's
environment with `FELLOWSHIP42_URL` and optionally
`FELLOWSHIP42_INSTANCE_SHA256` and a `FELLOWSHIP42` service binding.

EmDash loads Portable Text blocks and their renderers only from trusted npm
packages registered in site code, so installing this package needs source and
deploy access. The EmDash registry artifact `fellowship42-connect` offers the
connection, data routes, and structured data without the blocks. See
[EmDash church websites](https://github.com/idea7-cc/fellowship42/blob/main/docs/emdash-church-websites.md).

License: Apache-2.0.
