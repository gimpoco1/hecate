import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: {
    rollupOptions: {
      input: { app: "index.html", privacy: "privacy-policy.html", support: "support.html" },
      output: {
        manualChunks: {
          map: ["maplibre-gl"],
          sync: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
