# NIWIS Frontend — Progress

## Status: complete (phases 1–9)

| Phase | Scope                                                                                                                                                      | Commit        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1–3   | Foundation (stack, tokens, shell, URL-synced filters, MSW + zod, config, real boundaries, seeded generators), component library, Overview / Drought / Dams | `e438526`     |
| 4     | Climate, Vegetation, Rainfall, Runoff, Surface Water (+ forecasts)                                                                                         | `ac274b3`     |
| 5     | Groundwater, GW Reserve, Water Quality (+ forecast), Green Drop, Blue Drop, RWQO                                                                           | `a21d6f5`     |
| 6     | IWRM, Water Quantity, Services, Tariffs, Settlements (+ forecasts)                                                                                         | `8b770e0`     |
| 7     | Drought / Dams forecasts, AI & predictive analytics, Data Integration (+ report view), Governance, Roadmap                                                 | `6832047`     |
| 8     | Alerts centre, Reports (standard reports, builder, CSV/Excel export, print view), `/dev/components`, unit + consistency tests                              | `fb63f6e`     |
| 9     | Hardening: Playwright smoke (39 routes × 1440/390 px), axe WCAG 2.1 AA (light/dark), responsive pass (1920/1440/1280/1024/768/390), docs generator, README | see `git log` |

## Verification (last run)

- `npm run typecheck` ✔ · `npm run lint` ✔ (0 warnings) · `npm run build` ✔
- `npm test`: 44 unit tests ✔. They cover SPI → drought class, %FSC → alert level, SANS 241 pass/fail, WQI and Green / Blue Drop bands,
  Σ volume / Σ capacity aggregation, seeded determinism, SPI ≈ N(0,1), SA number formatting, and Gariep %FSC being identical across the table, map, info card and
  Overview / Dams KPIs.
- `npm run test:e2e`: 80 smoke tests ✔ (no console errors, no failed requests, no horizontal overflow, all panels resolve) and 26 axe checks ✔.
- `npm run docs`: every module dataset (summary, timeseries, forecast, breakdown, table, matrix, map, entities) executes and passes schema validation.

## Fixed during hardening

- Filters were lost on first load from a shared link (`/drought?province=WC`). The store is now seeded synchronously from the URL.
- Ctrl/⌘K search raced its own navigation and landed on `/?entity=…`. The URL is now the single writer.
- `surface-water/forecast` requested a `statistics` table the module did not serve.
- Contrast: the action button green, the "High" severity orange and the architecture diagram headers now meet 4.5:1, and diagram headers choose their ink colour by contrast.

## Known limitations / backend hand-off

- Mock mode (`npm run dev`): all data is generated sample data (badge shown). Hybrid mode (`npm run dev:live`): five modules are live; see "Backend integration" below.
- Alert acknowledge / assign actions and the downloads history are stored in the browser (localStorage) until the alert-workflow API exists.
- The Excel export is tab-separated values with an `.xls` extension, which avoids a heavy xlsx dependency. Swap in a server-side export if true `.xlsx` is required.
- The programme risk count on the Roadmap summary is static, pending a risk-register endpoint.
- The ECharts vendor chunk (about 240 kB gzipped) is split out and loaded after the app shell with the first page. The mock engine (about 210 kB gzipped) loads only in mock mode.

## Backend integration (October 2026)

Plan: `PLAN.md` §7. Backend docs, findings and reports: `docs/backend/`.

| Step | Scope                                                                                                                                                                        | Commit        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1    | Per-module data source (`hybrid`, `isLive`), MSW passthrough, Vite proxy, `npm run dev:live`                                                                                 | `e8a34a2`     |
| 2    | Client: 501 → `DataUnavailable` / Sample, nulls with reasons, errors with request id, 429 back-off, 30 s timeout, slow-load hint; provenance fields in zod; `contract:check` | `2c02f9a`     |
| 3    | Provenance UI: Live / Sample / stale / Modelled / Approximate markers, header live summary, baselines                                                                        | `dccb691`     |
| 4    | Districts: boundaries, Province → District → Local municipality, LM → district roll-up                                                                                       | `3614412`     |
| 5    | The five live pages wired and checked by eye                                                                                                                                 | `323c956`     |
| 6    | Overview, Data Integration and Governance wiring                                                                                                                             | `b4ddbb1`     |
| 7    | Fixtures, Playwright hybrid / backend-down / live projects, UI verification, docs                                                                                            | see `git log` |

### What is live, sample, and waiting

- **Live (backend):** Rainfall, Drought, Climate, Vegetation and Runoff pages (KPIs, maps by district / province, charts,
  tables); on the Overview the rainfall and drought-class KPIs, the drought trend, the drought / rainfall / vegetation map
  layers and the rainfall indicator tab; on Data Integration the source status, pipeline status and module coverage; on
  Governance the data-quality issues and the variable register; province, WMA and district lists; `/health` (header).
- **Sample (marked, hatched):** the other 19 modules; alerts and search; every forecast and outlook (the database has no
  forecast models); the Overview's other KPIs and panels; on live pages, the panels the database cannot serve (501):
  stations, dam / borehole / settlement points, catchment layers, EVI / SAVI / MSAVI2 / VPI / ASI / SVI / NDII, land cover,
  restrictions, population at risk, climate projections, irrigation, risk index, vulnerability. Production builds show these
  as "Not yet available" instead (`VITE_UNAVAILABLE_MODE=empty`).
- **Waiting on the data team** (`../Niwis Backend/docs/DATA_GAPS.md`): station / gauge / point data with coordinates
  (station maps, entity cards), a 1981–2010 baseline or a confirmed one, SPI calibration documentation, `satellite_remote_sensing`
  and `hydrological_drought_master` beyond Dec 2025 (shown stale), a fixed `5.1` vegetation table (EVI, SAVI …), settlement
  and population data, forecasts. Confirmation whether the database holds measured or test data (`VITE_LIVE_LABEL`).
- **Waiting on the backend team** (`docs/backend/BACKEND_ISSUES.md`): #6 values for 1981–2000 the database cannot hold
  (hidden by the frontend), #1 vegetation `set` ignored, #2–3 cascade row shapes (adapted), #4 per-IP rate limit, #5 null
  series without reason, #7 annual data flagged stale.

### Verification (backend integration)

- `npm run verify` ✔ (typecheck, lint, Prettier, unit tests, `build` and `build:live`, docs).
- Unit tests: 501 → `DataUnavailable` (empty / sample mode), no sample fallback on 5xx / network errors, 400, 429 back-off,
  `isLive` routing, provenance stamping, null KPI rendering, all-null and withheld series, baseline replacement, stale logic
  for `components`, mixed live / sample panels, LM → district roll-up.
- `npm run contract:check`: 223 requests, 0 schema failures, 0 errors, 63 unavailable (501), 12 structural differences (all
  explained in `BACKEND_ISSUES.md` or handled: null series, cascade shapes). Report: `docs/backend/CONTRACT_CHECK.md`.
- Playwright hybrid (recorded fixtures, 627 responses): five live pages at 1440 and 390 px with Live markers, visibly marked
  Sample / Not-yet-available panels, no sample panel without a Sample marker, no console errors, no horizontal scroll;
  Overview rainfall = Rainfall page KPI; LM → district roll-up; WMA → Approximate; no 1981–2010 over live data; runoff
  Modelled. Backend-down: live panels show errors with Retry, never sample data.
- `npm run test:live`: 15 / 15 KPI values on the dashboard equal the API (`docs/backend/UI_VERIFICATION.md`); screenshots in
  `tests/screenshots/live/` checked by eye (production `empty` mode: calm "Not yet available" cards, stale markers on the
  Dec 2025 satellite / hydrology values, "Some sources stale" on the source table).
