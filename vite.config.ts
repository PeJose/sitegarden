import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Hono server (server/) owns /api and the rendered files under /a; PORT moves it off 8787 when another one is running.
const api = `http://localhost:${process.env.PORT ?? 8787}`
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api, '/a/': api } },
  preview: { proxy: { '/api': api, '/a/': api } }, // pnpm perf runs against the preview build
})
