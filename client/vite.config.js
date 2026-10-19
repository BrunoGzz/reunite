import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API runs on the Express server.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3100' } },
})
