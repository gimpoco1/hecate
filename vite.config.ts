import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mapProxy = {
  '/map': {
    target: 'https://tiles.openfreemap.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/map/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: { host: '0.0.0.0', proxy: mapProxy },
  preview: { host: '0.0.0.0', proxy: mapProxy },
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
