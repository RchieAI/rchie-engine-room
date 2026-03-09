import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  preview: {
    host: true, // Listen on all network interfaces (0.0.0.0)
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    allowedHosts: true, // Allow Railway generated domains
  },
  server: {
    host: true,
  }
})
