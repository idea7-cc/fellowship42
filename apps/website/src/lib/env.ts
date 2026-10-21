/** Website Worker variables and secrets this app reads itself. */
export interface WebsiteEnv {
  WEBSITE_SETUP_SECRET?: string
  EMDASH_SITE_URL?: string
  SITE_URL?: string
}

/**
 * The Worker's variables and secrets. Workers with `nodejs_compat` expose
 * them on `process.env`; Vite would bake `import.meta.env` in at build time.
 */
export function runtimeEnv(): WebsiteEnv {
  return (globalThis as { process?: { env?: WebsiteEnv } }).process?.env ?? {}
}
