import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  // Absolute base so asset paths (/assets/...) resolve correctly from any
  // route depth in both Electron (valstine://app/) and the web deployment.
  // './' would break reloads at nested routes (e.g. /studio -> ./assets/... resolves wrong).
  base: '/',
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [
      'valstine.com',
      'www.valstine.com',
      'platform.valstine.com',
      'valstine-platform-35dh7.ondigitalocean.app',
      '.valstine.com',
    ],
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/download': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/terminal': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
