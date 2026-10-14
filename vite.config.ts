/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Dev / preview proxy: live /api/v1 calls reach the backend same-origin, so no CORS setup is needed in development.
  const proxy = {
    '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true },
  };
  return {
    plugins: [react(), tailwindcss()],
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
