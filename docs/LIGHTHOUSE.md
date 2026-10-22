# Lighthouse scores

Lighthouse 12.8.2 with the installed Chrome (headless), 22 October 2026. Production build (`npm run build:release`, api mode) served
the way `deploy/nginx.conf` serves it (gzip for the app, immutable assets, CSP), with the API running locally against
the NIWIS database (warm cache). Docker was unavailable on the test machine, so a small Node stand-in replaced the nginx
container; it does not compress the proxied `/api` JSON, which nginx does (`gzip_proxied any`), so the scores are a
little pessimistic.

Targets: performance ≥ 85, accessibility ≥ 95.

## Desktop preset (`--preset=desktop`)

| Page               | Performance | Accessibility | Best practices | FCP   | LCP   | TBT   | CLS   |
| ------------------ | ----------- | ------------- | -------------- | ----- | ----- | ----- | ----- |
| Overview `/`       | **94**      | **100**       | 96             | 0.7 s | 1.5 s | 10 ms | 0.018 |
| Drought `/drought` | **97**      | **100**       | 96             | 0.7 s | 1.1 s | 40 ms | 0.028 |
| Dams `/dams`       | **94**      | **100**       | 96             | 0.7 s | 1.6 s | 20 ms | 0.021 |

## Mobile (default: simulated slow 4G, 4× CPU slowdown)

| Page               | Performance | Accessibility | Best practices | FCP   | LCP   | TBT    | CLS   |
| ------------------ | ----------- | ------------- | -------------- | ----- | ----- | ------ | ----- |
| Overview `/`       | 62          | **100**       | 96             | 3.4 s | 7.0 s | 340 ms | 0.029 |
| Drought `/drought` | 50          | **100**       | 93             | 3.4 s | 7.3 s | 770 ms | 0.021 |
| Dams `/dams`       | 56          | **100**       | 96             | 3.5 s | 7.1 s | 440 ms | 0.074 |

Desktop meets both targets on all three pages. **Mobile performance does not reach 85**: on a throttled phone the
first view downloads and parses about 450 KB of gzipped JavaScript (ECharts 252 KB, Leaflet 86 KB, the app 73 KB,
React 35 KB) before the first chart and map draw. Reaching 85 needs the chart and map libraries loaded only when their
panels scroll into view (or a lighter chart library for the first screen) — a structural change left for a follow-up.

## Fixed while measuring

- Layout shift on the Overview (desktop CLS 0.288 → 0.018): the header's live badge grew from "Connecting…" to
  "10 of 24 modules live" when `/health` answered, re-wrapped the title row and pushed the page down. It now reserves
  its final width.
- Accessibility (92–95 → 100): the closed mobile navigation drawer is `inert` as well as `aria-hidden`; KPI strips
  have a heading (`h2`, visually hidden) above the card titles (`h3`); pill text reaches 4.5 : 1 on every colour-scale
  bin (`inkFor` falls back to black or white on mid tones; `tests/unit/ink.test.ts` checks every bin).
- The ECharts chunk was already tree-shaken (`src/components/charts/echarts.ts`); changing the chunking did not reduce
  the total and was not kept.
