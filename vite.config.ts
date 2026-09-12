import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          map: ['maplibre-gl'],
          sync: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
