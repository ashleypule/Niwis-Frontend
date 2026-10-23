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
          // A function, not a { chunk: [entries] } map: with the map, Rollup put shared dependencies (react-dom) into
          // the leaflet chunk, so every page preloaded Leaflet. Vendor chunks hold only their own packages, and ECharts /
          // Leaflet load only with EChartCanvas / MapCanvas (dynamic imports).
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](echarts|zrender|echarts-for-react)[\\/]/.test(id)) return 'echarts';
            if (/[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return 'leaflet';
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
            return undefined;
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
