import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_DEV_BACKEND_URL ?? 'http://localhost:3000'

// Keep the browser's Host header (changeOrigin: false) so the backend's same-origin
// check on cookie-authenticated requests sees the dashboard's own origin.
// Prefixes must not swallow dashboard routes: `/webchat/` (API) vs `/webchat` (page).
const proxyPaths = [
  '/auth',
  '/webchat/',
  '/reports',
  '/admin',
  '/products/search',
  '/knowledge/chunks',
  '/static',
  '/health',
]

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxyPaths.map((path) => [path, { target: backendTarget, changeOrigin: false }]),
    ),
  },
})
