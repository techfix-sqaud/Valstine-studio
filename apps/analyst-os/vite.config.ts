import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  base: "/",
  server: {
    host: "::",
    port: 8081,
    hmr: {
      overlay: false,
    },
    proxy: (() => {
      const backendPort = process.env.SERVER_PORT ?? "3001";
      return {
        "/api": { target: `http://localhost:${backendPort}`, changeOrigin: true },
        "/download": { target: `http://localhost:${backendPort}`, changeOrigin: true },
        "/terminal": { target: `ws://localhost:${backendPort}`, ws: true, changeOrigin: true },
      };
    })(),
  },
  preview: {
    host: "::",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
