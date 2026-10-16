import { defineConfig } from '@playwright/test';

/**
 * Projects
 *   mock          every route in mock mode (sample data), axe checks       → vite preview of dist (npm run build first)
 *   hybrid        the five live pages with recorded backend responses      → dist-fixtures (VITE_FIXTURES=true)
 *   backend-down  hybrid build with the backend unreachable                 → dist-live, proxy to a closed port
 *   live          opt-in smoke against the running backend (npm run test:live) → dist-live, proxy to localhost:8000
 */
const LIVE = process.argv.some((a) => a === '--project=live' || a === 'live');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: { trace: 'off' },
  projects: [
    {
      name: 'mock',
      testIgnore: ['hybrid/**', 'live/**'],
      use: { baseURL: 'http://localhost:4173' },
    },
    {
      name: 'hybrid',
      testMatch: ['hybrid/hybrid.spec.ts', 'hybrid/categories.spec.ts'],
      use: { baseURL: 'http://localhost:4174' },
    },
    {
      name: 'backend-down',
      testMatch: 'hybrid/backend-down.spec.ts',
      use: { baseURL: 'http://localhost:4175' },
    },
    {
      name: 'live',
      testMatch: 'live/**/*.spec.ts',
      timeout: 180_000,
      use: { baseURL: 'http://localhost:4176' },
    },
  ],
  webServer: LIVE
    ? [
        {
          command:
            'npx vite build --mode live --outDir dist-live && npx vite preview --mode live --outDir dist-live --port 4176 --strictPort',
          port: 4176,
          reuseExistingServer: true,
          timeout: 240_000,
        },
      ]
    : [
        {
          command: 'npm run preview -- --port 4173 --strictPort',
          port: 4173,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command:
            'npm run build:fixtures && npx vite preview --mode fixtures --outDir dist-fixtures --port 4174 --strictPort',
          port: 4174,
          reuseExistingServer: true,
          timeout: 240_000,
        },
        {
          command:
            'npx vite build --mode live --outDir dist-live && npx vite preview --mode live --outDir dist-live --port 4175 --strictPort',
          port: 4175,
          reuseExistingServer: true,
          timeout: 240_000,
          // nothing listens on port 9: every live request fails at the proxy
          env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:9' },
        },
      ],
});
