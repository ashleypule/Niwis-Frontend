# Lighthouse scores

Targets: performance ≥ 85 and accessibility ≥ 95 on Overview, Drought and Dams. Lighthouse 12.8.2 with the installed
Chrome (headless), against the production stack (`deploy/docker-compose.prod.yml` in the backend repository: nginx
serving `npm run build:release` with gzip and the production CSP, the API on the NIWIS database, warm cache). Mobile is
Lighthouse's default profile (simulated slow 4G, 4× CPU slowdown). Each page was measured three times; the table gives
the median run (by performance) and all three performance scores.

## Current (23 October 2026)

### Mobile

| Page               | Performance (runs)  | Accessibility | Best practices | FCP   | LCP   | TBT    | CLS |
| ------------------ | ------------------- | ------------- | -------------- | ----- | ----- | ------ | --- |
| Overview `/`       | **89** (87, 89, 91) | **100**       | 96             | 2.3 s | 3.3 s | 90 ms  | 0   |
| Drought `/drought` | **87** (86, 87, 89) | **100**       | 93             | 2.4 s | 3.2 s | 180 ms | 0   |
| Dams `/dams`       | **87** (87, 87, 90) | **100**       | 96             | 2.4 s | 3.3 s | 180 ms | 0   |

### Desktop (`--preset=desktop`)

| Page               | Performance (runs)      | Accessibility | Best practices | FCP   | LCP   | TBT  | CLS   |
| ------------------ | ----------------------- | ------------- | -------------- | ----- | ----- | ---- | ----- |
| Overview `/`       | **99** (99, 99, 99)     | **100**       | 96             | 0.6 s | 0.8 s | 0 ms | 0.003 |
| Drought `/drought` | **100** (99, 100, 100)  | **100**       | 96             | 0.6 s | 0.7 s | 0 ms | 0.004 |
| Dams `/dams`       | **100** (100, 100, 100) | **100**       | 96             | 0.6 s | 0.7 s | 0 ms | 0.004 |

## Before (same stack, 23 October 2026, one run each)

| Page     | Mobile performance | LCP   | TBT    |
| -------- | ------------------ | ----- | ------ |
| Overview | 62                 | 6.7 s | 330 ms |
| Drought  | 56                 | 7.2 s | 490 ms |
| Dams     | 64                 | 6.8 s | 220 ms |

(The 22 October numbers below were taken with a Node stand-in for nginx while Docker was unavailable: mobile 62 / 50 /
56, desktop 94 / 97 / 94.)

## What changed

1. **Shell before page.** Routes are `React.lazy` components under Layout's Suspense boundary instead of the router's
   `lazy` property, which made the router wait for the page chunk before rendering anything: header, sidebar and
   filter bar now paint at once (`src/app/router.tsx`).
2. **ECharts only when a chart nears the viewport.** `EChart` renders its box (accessible name, size, `data-chart`
   summary) at once and imports `EChartCanvas` (ECharts, 250 KB gzipped) with a dynamic import when the box is within
   300 px of the viewport (`src/components/charts/EChart.tsx`, `src/lib/useInView.ts`).
3. **Leaflet only when a map nears the viewport, after the page has loaded.** Everything Leaflet-dependent moved to
   `src/components/map/MapCanvas.tsx` (dynamic import); the map's layer data and boundary files (up to 240 KB each)
   load with it. A map near the top of a phone screen starts 1.2 s after `load` and an idle moment, so it never
   competes with the first paint.
4. **Vendor chunks hold only their own packages.** The `manualChunks` map had put `react-dom` into the Leaflet chunk,
   so every page preloaded Leaflet; a `manualChunks` function now assigns `react` / `echarts` / `leaflet` by package
   (`vite.config.ts`). The entry preloads only React.
5. **Panel data load on approach.** Series, breakdown, matrix and table panels, mini maps and the Database variables
   section request their data when they near the viewport, so the first screen's requests are not queued behind every
   panel's (Card / ChartCard `sectionRef` + `useInView`).
6. **Smaller work during load.** The header's live badge reserves its final width and text size (no layout shift, no
   late LCP); skeletons pulse with opacity (compositor) instead of repainting a moving gradient; the CSV writer is a
   20-line function instead of papaparse (`tests/unit/csv.test.ts` pins the format).

Accessibility stayed at 100: chart boxes keep `role="img"` and their labels before the canvas loads; the drawer, KPI
headings and pill contrast fixes of 22 October are unchanged. The e2e tests scroll each page through
(`tests/e2e/scroll.ts`) before checking every panel, as a reader would.

## Reproduce

```bash
# backend repository, with the frontend checked out beside it
cd deploy && FRONTEND_DIR=../../Niwis-Frontend NIWIS_HTTP_PORT=8088 docker compose -f docker-compose.prod.yml up -d --build
npx lighthouse@12.8.2 http://localhost:8088/drought --only-categories=performance,accessibility,best-practices
npx lighthouse@12.8.2 http://localhost:8088/drought --preset=desktop
```
