# NIWIS — National Integrated Water Information System (frontend)

Web dashboard for the Department of Water and Sanitation (DWS): national drought, climate, rainfall, runoff, dams, surface water,
groundwater, water quality and compliance (Green / Blue Drop, RWQO), water resources (IWRM, quantity, services, tariffs,
settlements) and the platform modules (AI, data integration, governance, roadmap), plus alerts and reports.

This repository is the **frontend only**. The NIWIS backend (`../Niwis Backend`, FastAPI on the DWS database) serves **rainfall,
drought, climate, vegetation and runoff**; every other module runs on a seeded mock API (Mock Service Worker) that answers the same
`/api/v1/*` contract. In **hybrid** mode each panel says where its numbers come from (**Live** or **Sample**); in **mock** mode
every screen shows a "Sample data" badge.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (mock API, sample data)
npm run dev:live     # hybrid: five modules from the backend on localhost:8000, sample data for the rest
```

Node ≥ 20. No backend, database or API key is needed for development.

| Command                               | What it does                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                         | Vite dev server with the mock API                                                                                                                                                                                                                                             |
| `npm run build`                       | Type-check (`tsc -b`) and production build to `dist/`                                                                                                                                                                                                                         |
| `npm run preview`                     | Serve `dist/` on port 4173                                                                                                                                                                                                                                                    |
| `npm run typecheck` / `npm run lint`  | TypeScript strict / ESLint (zero warnings)                                                                                                                                                                                                                                    |
| `npm test`                            | Vitest unit tests (thresholds, aggregation, determinism, cross-page consistency)                                                                                                                                                                                              |
| `npm run test:e2e`                    | Playwright: hybrid pages with recorded backend responses, backend-down errors, and the mock smoke test of all 39 routes at 1440 px and 390 px (screenshots → `tests/screenshots/`) and axe WCAG 2.1 AA in light and dark themes. First run: `npx playwright install chromium` |
| `npm run dev:live`                    | Hybrid mode against the backend on `localhost:8000` (see "Running against the backend")                                                                                                                                                                                       |
| `npm run build:live` / `preview:live` | Production build in hybrid mode to `dist-live/` (never `dist/`, which the mock e2e project serves) / serve it                                                                                                                                                                 |
| `npm run contract:check`              | Validate every live endpoint the pages use against the zod schemas and diff it with the mock → `docs/backend/CONTRACT_CHECK.md`                                                                                                                                               |
| `npm run fixtures:record`             | Record the backend's responses for the Playwright hybrid project → `tests/fixtures/backend/`                                                                                                                                                                                  |
| `npm run test:live`                   | Opt-in Playwright smoke against the running backend; writes `docs/backend/UI_VERIFICATION.md`                                                                                                                                                                                 |
| `npm run verify`                      | Typecheck, lint, Prettier, unit tests, both builds and docs (run before every commit)                                                                                                                                                                                         |
| `npm run docs`                        | Regenerate `docs/API_CONTRACT.md` and `docs/DATA_DICTIONARY.md` from the code                                                                                                                                                                                                 |
| `npm run geo`                         | Rebuild the simplified boundary GeoJSON in `public/geo` (see `public/geo/SOURCES.md`)                                                                                                                                                                                         |

## Configuration (`.env`)

| Variable                | Default                                             |                                                                                                                              |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `VITE_DATA_SOURCE`      | `hybrid` if `VITE_LIVE_MODULES` is set, else `mock` | `mock` = all sample data; `hybrid` = live modules from the backend, sample for the rest; `api` = everything from the backend |
| `VITE_LIVE_MODULES`     | —                                                   | Modules the backend serves: `rainfall,drought,climate,vegetation,runoff`                                                     |
| `VITE_LIVE_META`        | `true`                                              | `/health` and `/meta/*` from the backend (header summary, Data Integration, Governance)                                      |
| `VITE_API_BASE_URL`     | —                                                   | Backend origin for production builds; empty in development (the Vite proxy forwards `/api`)                                  |
| `VITE_API_PROXY_TARGET` | `http://localhost:8000`                             | Where the dev / preview server proxies `/api`                                                                                |
| `VITE_UNAVAILABLE_MODE` | `sample` (dev), `empty` (production builds)         | What a panel shows when the database has no data for it (501): marked sample data, or "Not yet available"                    |
| `VITE_LIVE_LABEL`       | `Live`                                              | Marker text for backend data (e.g. `Database` until the data team confirms the values are measured)                          |
| `VITE_MOCK_LATENCY_MS`  | `300`                                               | Simulated network latency in mock mode                                                                                       |
| `VITE_AS_OF`            | today                                               | Pin the "data as of" date (`YYYY-MM-DD`) for reproducible screenshots                                                        |

`npm run dev` uses `.env` (mock). `npm run dev:live` uses `--mode live` (`.env.live`: hybrid against `localhost:8000`). The
Playwright hybrid project builds with `--mode fixtures` (`.env.fixtures`).

## Running against the backend

1. Start the backend in `../Niwis Backend` (`docker compose up` or `uv run uvicorn app.main:app`) and check
   `http://localhost:8000/api/v1/health`.
2. `npm run dev:live` → http://localhost:5173. Requests for the live modules, `/health`, `/meta/*` and the province / WMA /
   district lists go through the Vite proxy to the backend; MSW stays on and answers everything else (`isLive()` in
   `src/config/app.ts` decides, for the client and for MSW). The first requests after a backend restart can take up to ~20 s.
3. Production: build with `VITE_DATA_SOURCE=hybrid`, `VITE_LIVE_MODULES=…` and `VITE_API_BASE_URL=https://…`; the backend's
   `CORS_ORIGINS` must include the frontend origin. For authentication, call `setAuthTokenProvider(() => getAccessToken())`
   from `src/api/client.ts` once at startup.

**What the user sees.** Every panel carries a marker: **Live · as of Sep 2026** (source tables in the tooltip), an amber
**Data to Dec 2025** when the source is stale, **Modelled** on runoff, **Approximate (district-based)** under a WMA filter, or
a violet, hatched **Sample** when the numbers are generated. The header shows "5 of 24 modules live". Anomaly titles show the
backend's real baseline (e.g. "vs 2000–2026 mean"), never 1981–2010 over live data.

**How the client handles the backend** (`src/api/client.ts`):

| Response                           | Panel shows                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 200                                | Live data; `null` values as "—" with the backend's reason; all-null or withheld series hidden and listed under the chart |
| 501 `DATA_UNAVAILABLE`             | `sample` mode: the sample version, marked Sample with the backend's reason · `empty` mode: "Not yet available"           |
| network error, timeout (30 s), 5xx | Error state with Retry and the `X-Request-Id` (retried twice with back-off). **Never** sample data.                      |
| 400 / 404                          | Error state (logged to the console; backend problems go to `docs/backend/BACKEND_ISSUES.md`)                             |
| 429                                | Waits for `Retry-After`, retries twice                                                                                   |

**Districts.** The database is keyed by the 52 district / metro municipalities (MDB codes). Filters are Province → District →
Local municipality; on a live page a local municipality is rolled up to its district (with a notice), and catchment filters
show "Not yet available". District maps use `public/geo/districts.json` (from the backend).

**Checks.** `npm run contract:check` (live responses vs the zod schemas and the mock's structure), `npm run test:e2e` (mock,
hybrid with recorded fixtures, and backend-down projects), `npm run test:live` (UI values vs direct API calls). Backend docs
and findings: [`docs/backend/`](docs/backend/) — `FRONTEND_INTEGRATION.md`, `CONTRACT_CHANGES.md`, `BACKEND_ISSUES.md`,
`CONTRACT_CHECK.md`, `UI_VERIFICATION.md`.

### Connecting further modules

1. When the backend serves another module, add it to `VITE_LIVE_MODULES`. Its pages switch to live data with no code change;
   add its requests to `src/api/liveManifest.ts` and run `npm run contract:check` and `npm run fixtures:record`.
2. [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) lists every module, `metric` / `layer` key and response shape the pages request.

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
- [`docs/backend/`](docs/backend/): backend integration guide, contract changes, issues found, contract check, UI verification.
- [`PLAN.md`](PLAN.md): mockup → page mapping, routes, the data plan and the backend integration plan (§7). [`PROGRESS.md`](PROGRESS.md): build status and known limitations.
- `/dev/components`: a live gallery of every building block (not linked from the navigation).
