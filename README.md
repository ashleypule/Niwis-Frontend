# NIWIS — National Integrated Water Information System (frontend)

Web dashboard for the Department of Water and Sanitation (DWS): national drought, climate, rainfall, runoff, dams, surface water,
groundwater, water quality and compliance (Green / Blue Drop, RWQO), water resources (IWRM, quantity, services, tariffs,
settlements) and the platform modules (AI, data integration, governance, roadmap), plus alerts and reports.

This repository is the **frontend only**. Until the backend exists, it runs against a seeded mock API (Mock Service Worker), which
answers the same `/api/v1/*` contract the real backend will implement. Every screen shows a **"Sample data"** badge while in mock mode.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (mock API, sample data)
```

Node ≥ 20. No backend, database or API key is needed for development.

| Command                              | What it does                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Vite dev server with the mock API                                                                                                                                                             |
| `npm run build`                      | Type-check (`tsc -b`) and production build to `dist/`                                                                                                                                         |
| `npm run preview`                    | Serve `dist/` on port 4173                                                                                                                                                                    |
| `npm run typecheck` / `npm run lint` | TypeScript strict / ESLint (zero warnings)                                                                                                                                                    |
| `npm test`                           | Vitest unit tests (thresholds, aggregation, determinism, cross-page consistency)                                                                                                              |
| `npm run test:e2e`                   | Playwright: smoke test of all 39 routes at 1440 px and 390 px (screenshots → `tests/screenshots/`) and axe WCAG 2.1 AA in light and dark themes. First run: `npx playwright install chromium` |
| `npm run docs`                       | Regenerate `docs/API_CONTRACT.md` and `docs/DATA_DICTIONARY.md` from the code                                                                                                                 |
| `npm run geo`                        | Rebuild the simplified boundary GeoJSON in `public/geo` (see `public/geo/SOURCES.md`)                                                                                                         |

## Configuration (`.env`)

| Variable               | Default |                                                                       |
| ---------------------- | ------- | --------------------------------------------------------------------- |
| `VITE_DATA_SOURCE`     | `mock`  | `mock` = MSW sample data; `api` = real backend                        |
| `VITE_API_BASE_URL`    | —       | Backend origin, used when `VITE_DATA_SOURCE=api`                      |
| `VITE_MOCK_LATENCY_MS` | `300`   | Simulated network latency in mock mode                                |
| `VITE_AS_OF`           | today   | Pin the "data as of" date (`YYYY-MM-DD`) for reproducible screenshots |

### Connecting the real backend

1. Implement the endpoints in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). It lists every module, `metric` / `layer` key, and response
   shape the pages request.
2. Set `VITE_DATA_SOURCE=api` and `VITE_API_BASE_URL=https://…`, then rebuild. The mock worker is a lazily imported chunk that is never loaded in `api` mode.
3. For authentication, register a token provider once at startup: `setAuthTokenProvider(() => getAccessToken())` from `src/api/client.ts`.

Every response is validated with zod (`src/types/api.ts`). A payload that drifts from the contract shows a panel-level error
(the zod issues are logged to the console). It never renders silently wrong numbers.

## Architecture

```
src/
  app/          router (one lazy chunk per page), Layout shell, URL ⇄ filter sync
  api/          fetch client (zod-validated), endpoint paths, TanStack Query hooks
  config/       app env, modules & navigation, metric registry, thresholds, colour scales, icons
  store/        zustand UI store (filters, theme, sidebar, notifications)
  components/   shell, ui, kpi, charts (ECharts option builders), map (Leaflet), table, entity, alerts, viz, feedback
  pages/        one folder per module; forecast tabs live next to the status page
  mocks/        MSW router, module handlers, seeded generators, reference geography
  lib/          seeded PRNG, statistics (SPI, SPEI …), formatting (SA conventions), time, export (CSV / PNG / ZIP)
  types/        zod schemas = API contract
tests/
  unit/         Vitest
  e2e/          Playwright smoke + axe accessibility
docs/           API contract, data dictionary, reference mockups
```

**Rules the code follows:**

- **One source of truth per fact.** For example, a dam's `% FSC` comes from `damNow()` and is the same on the Overview, the Dams page, the map
  marker, the info card and the alerts. `tests/unit/consistency.test.tsx` enforces this.
- **Aggregates are computed from entities**, never averaged from percentages. National storage is Σ volume / Σ capacity.
- **Classes come from config.** Drought class, alert level, SANS 241 pass/fail, WQI band, Green / Blue Drop band and similar classes are
  derived in `src/config/thresholds.ts`, and colours in `src/config/palettes.ts`. The API returns values, and the UI classifies them.
- **KPI deltas are semantic.** Each metric declares `goodDirection` (`src/config/metrics.ts`), so "up" is green for dam storage and red
  for E. coli.
- **Filters live in the URL** (`?province=WC&period=24M&entity=dam-gariep`), so any view can be shared as a link.

### Mock data

`src/mocks/generators` simulates a consistent hydro-climate system from a fixed seed. It does not use random numbers per request.

- A 0.25° climate grid (1 810 cells) with mean annual precipitation, rainfall regimes, AR(1) anomalies, a warming trend and a recent dry spell.
- Derived soil moisture, runoff, NDVI and evapotranspiration, and SPI / SPEI / SSI / SGI with a 1981–2010 calibration.
- 151 dams with a monthly water balance driven by that runoff, 1 842 gauging stations, 1 480 boreholes, 1 084 water-quality stations,
  WWTWs / WSSs with effluent and SANS 241 samples, settlements, municipal services, tariffs and the platform programme.
- Forecasts use damped persistence with p10–p90 bands that widen with lead time.

The same seed always produces the same numbers (`tests/unit/data.test.ts`). Boundaries are real (geoBoundaries, the DWS NWRP WMAs / catchments,
and Natural Earth), simplified for the web.

## Accessibility & responsiveness

- WCAG 2.1 AA, checked by axe on 13 representative pages in both themes. Charts have `aria-label`s and table views, pills choose
  their text colour for contrast, and focus is visible.
- Layouts are tested at 1920, 1440, 1280, 1024, 768 and 390 px. Below 1024 px the sidebar becomes a drawer, and below 768 px the filter bar becomes a sheet and maps
  use bottom-sheet legends.
- Light and dark themes come from CSS-variable tokens (`src/index.css`). The default follows the OS setting, and the user can toggle it in the header.

## Further documentation

- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md): endpoints, parameters, schemas and every dataset key (generated).
- [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md): metrics, units, good direction, thresholds and colour scales (generated).
- [`PLAN.md`](PLAN.md): mockup → page mapping, routes and the data plan. [`PROGRESS.md`](PROGRESS.md): build status and known limitations.
- `/dev/components`: a live gallery of every building block (not linked from the navigation).
