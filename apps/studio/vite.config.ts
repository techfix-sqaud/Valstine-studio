import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";

const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"),
);

const VITE_FS_DENY = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**'];
const SAFE_DOT_SEGMENTS = new Set(['.vite', '.well-known']);

function isSensitiveRequest(rawUrl: string): boolean {
  try {
    const pathname = decodeURIComponent(new URL(rawUrl, 'http://vite.local').pathname);
    if (pathname.startsWith('/public/')) return true;

    return pathname
      .split('/')
      .filter(Boolean)
      .some((segment) => segment.startsWith('.') && !SAFE_DOT_SEGMENTS.has(segment));
  } catch {
    return false;
  }
}

function sensitiveRequestGuard() {
  const handleRequest = (req: { url?: string }, res: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }, next: () => void) => {
    if (!req.url || !isSensitiveRequest(req.url)) {
      next();
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  };

  return {
    name: 'sensitive-request-guard',
    configureServer(server: { middlewares: { use(handler: typeof handleRequest): void } }) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server: { middlewares: { use(handler: typeof handleRequest): void } }) {
      server.middlewares.use(handleRequest);
    },
  };
}

export default defineConfig({
  base: '/',
  envPrefix: ['VITE_', 'DO_AI_'],
  server: {
    host: "::",
    port: 8080,
    fs: {
      deny: VITE_FS_DENY,
    },
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
    proxy: (() => {
      const backendPort = process.env.SERVER_PORT ?? '3001';
      return {
        '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true },
        '/download': { target: `http://localhost:${backendPort}`, changeOrigin: true },
        '/terminal': { target: `ws://localhost:${backendPort}`, ws: true, changeOrigin: true },
      };
    })(),
  },
  preview: {
    host: '::',
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(rootPkg.version),
  },
  plugins: [react(), sensitiveRequestGuard()],
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
