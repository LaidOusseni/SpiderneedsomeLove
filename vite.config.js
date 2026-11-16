import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import seo from './scripts/vite-seo-plugin.mjs'

export default defineConfig({
  plugins: [react(), seo()],
  publicDir: 'public',
  server: {
    port: 3000,
    open: true,
  },
})
