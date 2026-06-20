import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_DEV_BACKEND_URL ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/webchat': backendTarget,
      '/reports': backendTarget,
      '/admin': backendTarget,
      '/products': backendTarget,
      '/knowledge': backendTarget,
      '/static': backendTarget,
      '/health': backendTarget,
    },
  },
})
