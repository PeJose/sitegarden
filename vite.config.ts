import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Hono server (server/) owns /api and the rendered files under /a.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787', '/a/': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787', '/a/': 'http://localhost:8787' } }, // pnpm perf runs against the preview build
})
