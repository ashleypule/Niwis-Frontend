/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import type { Connect, Plugin } from 'vite';

/** Serves tests/fixtures/backend under /__fixtures (dev and preview), for VITE_FIXTURES=true builds. */
function fixtures(): Plugin {
  const dir = path.resolve(__dirname, 'tests/fixtures/backend');
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/__fixtures/')) return next();
    const file = path.join(dir, path.basename(decodeURIComponent(req.url.slice(12).split('?')[0])));
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end('{}');
    }
    res.setHeader('content-type', 'application/json');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'niwis-fixtures',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Dev / preview proxy: live /api/v1 calls reach the backend same-origin, so no CORS setup is needed in development.
  const proxy = {
    '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true },
  };
  return {
    plugins: [react(), tailwindcss(), fixtures()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: { port: 5173, proxy },
    preview: { proxy },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            echarts: [
              'echarts/core',
              'echarts/charts',
              'echarts/components',
              'echarts/renderers',
              'echarts-for-react/lib/core',
            ],
            leaflet: ['leaflet', 'react-leaflet'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['tests/unit/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
