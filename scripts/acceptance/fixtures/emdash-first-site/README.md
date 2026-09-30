# EmDash-first acceptance fixture site

An independently operated EmDash 1.0.1 Cloudflare site, modeled on the upstream
`templates/starter-cloudflare` of EmDash 1.0.1. It imports nothing from
`apps/website`. `scripts/acceptance/emdash-first.mjs` copies it to a temporary
directory, fills the placeholders in `package.json` and `pnpm-workspace.yaml`
so `@fellowship42/emdash` and `@fellowship42/website-contract` come from
freshly packed tarballs, installs with pnpm, builds with `astro build`, and
serves the production build with `wrangler dev`.

The only Fellowship42-specific code is the registration in `astro.config.mjs`
that the EmDash-first guide asks a site developer to add:

```js
emdash({ /* database, storage */ plugins: [fellowship42()] })
```

The connection is not pinned by the environment: an EmDash Administrator sets
it in plugin settings. `fonts: false` only keeps the build offline and
deterministic.
