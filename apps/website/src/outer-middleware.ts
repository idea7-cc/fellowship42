import { defineMiddleware } from 'astro:middleware'
import { runtimeEnv } from './lib/env'
import { createOuterMiddleware } from './lib/middleware'

/**
 * Wraps the complete EmDash pipeline: the setup gate before it, the public
 * cache policy after it. See `lib/middleware.ts`.
 */
export const onRequest = defineMiddleware(createOuterMiddleware(runtimeEnv))
