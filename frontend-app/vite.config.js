import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/parse': 'http://localhost:1080',
      '/jobs': 'http://localhost:1080',
      '/delete': 'http://localhost:1080',
      '/upload': 'http://localhost:1080',
    },
  },
})
