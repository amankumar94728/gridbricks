import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately (uvicorn on :8000); in Docker and on
// Vercel it is served from the same origin, so the app always calls /api.
export default defineConfig({
  plugins: [react()],
  // Recharts is most of the bundle; one ~190 kB gzipped chunk is fine for this app.
  build: { chunkSizeWarningLimit: 800 },
  server: {
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8000" },
  },
});
