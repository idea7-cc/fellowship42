import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

// https://astro.build/config
export default defineConfig({
  integrations: [
    // React islands for truly interactive UI only
    react(),
  ],
  // Output static HTML by default — maximum performance
  output: 'static',
})
