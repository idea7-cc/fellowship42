import { getViteConfig } from 'astro/config'

// Astro's Vite setup, so tests can render the church components with the
// Container API.
export default getViteConfig({ test: { include: ['src/**/*.test.ts'] } })
