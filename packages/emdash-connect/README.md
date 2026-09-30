# Fellowship42 connector for the EmDash registry

`fellowship42-connect` is the sandboxed EmDash plugin that the EmDash plugin
registry can distribute. It connects an EmDash site to a church's Fellowship42
instance through the public [website contract](../../docs/website-contract.md):

- a **Fellowship42** admin page showing the connection, the connected church,
  and where each kind of content is edited;
- public JSON routes `church`, `events`, `sermons`, `groups`, and `courses`
  under `/_emdash/api/plugins/<plugin id>/`; and
- church structured data (JSON-LD) on the home page.

Only EmDash Administrators can change the connection (plugin settings). The
connector holds no credential and reads only published church content.

## What it cannot do

EmDash 1.0.1's registry only distributes sandboxed plugins. A sandboxed plugin
cannot add Portable Text blocks or ship Astro components, and its network
access refuses private and loopback addresses. The church page blocks therefore
come from the trusted npm package `@fellowship42/emdash`, which a site
developer adds to the site's code and redeploys. See
[EmDash church websites](../../docs/emdash-church-websites.md).

## Build and verify locally

```sh
pnpm --filter @fellowship42/emdash-connect test
```

This validates the manifest, runs the plugin through EmDash's production
sandbox boundary on workerd, builds the registry bundle, and checks it with the
same offline verification as a registry install. Publishing
(`emdash-plugin publish`) requires the publisher's atproto account and follows
independent review; replace the placeholder `publisher` first.
