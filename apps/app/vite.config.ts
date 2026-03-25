import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@brand': resolve(__dirname, '../../packages/brand/src'),
      '@convex': resolve(__dirname, '../../convex'),
    },
  },
})
