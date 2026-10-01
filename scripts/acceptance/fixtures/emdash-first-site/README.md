# EmDash-first acceptance fixture site

An independently operated EmDash 1.0.1 Cloudflare site, modeled on the upstream
`templates/starter-cloudflare` of EmDash 1.0.1. It imports nothing from
`apps/website`. `scripts/acceptance/emdash-first.mjs` copies it to a temporary
directory, fills the placeholders in `package.json` and `pnpm-workspace.yaml`
so `@fellowship42/emdash` and `@fellowship42/website-contract` come from
freshly packed tarballs, installs with pnpm, builds with `astro build`, and
serves the production build with `wrangler dev`.

The only Fellowship42-specific code is what the EmDash-first guide asks a
site developer to add: the registration in `astro.config.mjs`,

```js
emdash({ /* database, storage */ plugins: [fellowship42()] })
```

and the caching middleware from the `@fellowship42/emdash` README
(`src/middleware.ts`), which keeps pages with church blocks out of every
cache.

The connection is not pinned by the environment: an EmDash Administrator sets
it in plugin settings. Because the acceptance instance runs on `localhost`,
the run sets the local-evaluation opt-in `FELLOWSHIP42_ALLOW_PRIVATE_HOSTS=true`
in the site's environment, and finally restarts the site without it to show
that the address is then refused. `fonts: false` only keeps the build offline
and deterministic.
