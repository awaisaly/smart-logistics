import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// A single monorepo-root .env drives every service and the frontend, so point
// Vite's env loading there too (this is what exposes VITE_* to the client).
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  return {
    plugins: [react()],
    envDir: repoRoot,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src")
      }
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.FRONTEND_PORT ?? 5173)
    }
  };
});
