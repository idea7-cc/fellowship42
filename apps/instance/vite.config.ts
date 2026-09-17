import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@brand': resolve(import.meta.dirname, '../../packages/brand/src'),
    },
  },
})
