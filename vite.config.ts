import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createMapKitTokenHandler } from "./api/mapkit-token.mjs";

function mapKitTokenApi(environment: Parameters<typeof createMapKitTokenHandler>[0]): Plugin {
  const handler = createMapKitTokenHandler(environment);
  const install: NonNullable<Plugin["configureServer"]> = (server) => {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] !== "/api/mapkit-token") return next();
      handler(request, response);
    });
  };
  return { name: "hecate-mapkit-token", configureServer: install, configurePreviewServer: install };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "APPLE_MAPS_");
  return {
    plugins: [react(), mapKitTokenApi(environment)],
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
  };
});
