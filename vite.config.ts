import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function mapKitTokenDevApi(): Plugin {
  return {
    name: 'hecate-mapkit-token-api',
    configureServer(server) {
      // Vite otherwise resolves this request to api/mapkit-token.mjs and sends
      // its source to the browser. The production host runs the same handler
      // as a Vercel serverless function.
      server.middlewares.use('/api/mapkit-token', (request, response, next) => {
        void import('./api/mapkit-token.mjs')
          .then(({ default: handler }) => handler(request, response))
          .catch(next)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_* variables to import.meta.env. Load the signing
  // configuration explicitly for the local server-side token route.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'APPLE_MAPS_'))

  return {
    plugins: [react(), mapKitTokenDevApi()],
    server: { host: '0.0.0.0' },
    preview: { host: '0.0.0.0' },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            map: ['@apple/mapkit-loader'],
            sync: ['@supabase/supabase-js'],
          },
        },
      },
    },
  }
})
