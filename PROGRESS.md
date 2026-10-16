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

## Database category charts + audit fixes (October 2026)

DWS asked for every dataset to be shown as it exists in the database: category = table, variable = column, labels and
units from the backend catalogue (`GET /{module}/categories`, `docs/backend/CATEGORY_CATALOGUE.md`). Nothing in these
charts comes from the mockup screens.

| Step | Scope                                                                                                                       | Commit        |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1    | Schemas (`CategoryList`, category series fields), `useCategories` / `useCategorySeries`, manifest, recorder, contract check | `673ba7a`     |
| 2    | `CategoryChart`, "Database variables" on the five live pages, shared chart fixes, vegetation class names, alerts            | `8cfb1e6`     |
| 3    | Audit fixes: KPIs, header period, cascade, titles, tables                                                                   | `cc3a0e6`     |
| 4    | Hybrid / unit / live tests, fixtures re-recorded, backend issues #8–#13                                                     | `0900222`     |
| 5    | Live screenshots (1440 / 390 px), UI verification, this section                                                             | see `git log` |

### What the pages show

- **`CategoryChart`** (`src/components/charts/CategoryChart.tsx`, logic in `src/lib/categories.ts`): title = table
  label · group label · spec tag, as sent; one chip per column (catalogue label, colour swatch, `aria-pressed`, tooltip
  with `table.column`, data date, note and unit override; amber dot when stale); All / Reset; the selection is in the URL
  (`?drought.<table>.<group>=col1,col2`, absent = the catalogue's `defaultVisible`). One axis per unit, with the unit
  above the axis; a column that would need a third axis is blocked ("Different unit — hide X to compare"). Withheld
  columns are disabled chips with the backend's reason; a group with nothing live shows "Not yet available" with the
  reasons and is never requested. Duplicates are listed as "Also in the database: X (identical to Y)" under the chart of
  the column they repeat, else under the table. ⋮ menu: PNG, CSV of the visible columns (units in the headers), data
  table, full screen. One request per group (`vars=all`): switching chips never refetches.
- **Chart types:** the backend sends `kind: "line"` for every column (BACKEND_ISSUES #8), so the type is inferred per
  column: totals → bars, anomalies → bars around 0 coloured by sign, SPI / SPEI → lines over the D0–D4 bands
  (`thresholds.ts`), min / max pairs → a band, everything else → lines. A backend recommendation would win.
- **"Database variables"** (`DatabaseVariables.tsx`) at the bottom of Drought, Rainfall, Climate, Vegetation and
  Runoff: "Spec coverage" (e.g. "Drought: 4 tables · 54 columns · 24 live · 14 withheld · 16 duplicates", expandable
  to every column with table, label, unit, status and reason), then one collapsible block per table (open state kept in
  localStorage) with its charts, two columns on desktop, one on phones.

| Page       | Tables (charts plotted / not yet available)                                                                                                                                                                                              | Columns live / withheld / duplicate |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Drought    | Meteorological Drought §3.1 (3 / 3), Satellite Remote Sensing §3.2 (5 / 1), Hydrological Drought §3.3 (1 / 5), Rainfall Derived Drought Indices §6.2 (1 / 0)                                                                             | 24 / 14 / 16                        |
| Rainfall   | Wet Dry Spells §4.2 (3 / 0), Mean Annual Precipitation §4.3 (3 / 5), Core Rainfall Variables §6.1 (8 / 0), Rainfall Derived Drought Indices §6.2 (1 / 0)                                                                                 | 32 / 5 / 4                          |
| Climate    | Temperature Change §4.1 (5 / 0), Wet Dry Spells §4.2 (3 / 0), Mean Annual Precipitation §4.3 (3 / 5), Potential Evaporation Daily §4.4 (0 / 3), Irrigation Demand Daily §4.5 (0 / 5), Streamflow and Climate Linkage Annual §4.6 (0 / 4) | 23 / 23 / 0                         |
| Vegetation | Satellite Remote Sensing §3.2 (5 / 1), Primary Satellite Vegetation Variables SANSA §5.1 (0 / 5), Meteorological Drivers SAWS §5.2 (1 / 0)                                                                                               | 10 / 15 / 10                        |
| Runoff     | Hydrological Drought §3.3 (1 / 5), Runoff Variables §7.1 (3 / 7)                                                                                                                                                                         | 4 / 18 / 1                          |

- **Summary panels:** series that plot one column as stored (drought SPI, soil moisture, SGI and vegetation; rainfall
  SPI / SPEI; vegetation indices) take that column's catalogue label and unit, read from the live catalogue
  (`src/config/seriesColumns.ts`; the backend does not name source columns on these series, #11). Derived series keep
  the backend's names. **No chart was removed:** none is an exact duplicate of a database chart (the closest, the
  vegetation "Condition" tab, is one tab of a three-tab panel; the drought vegetation chart combines NDVI with VCI / VHI
  on two axes; the summary soil-moisture chart adds the min–max range and the long-term mean).

### Audit fixes

1. Log axes span the data's decades and leave out values ≤ 0 (FDC 0.1–10 000 m³/s, was 1–10; flood frequency over
   1–100 years; water-quality log charts use the same rule).
2. Every bar axis includes 0 in the shared presets, whatever `min` a dataset sets (vegetation anomaly started at 15 %).
3. Live pages say "Alerts will appear when the alert service is connected" instead of showing sample alerts.
4. "Historical | Forecast" is drawn only when values follow `asOf` (forecast and projection charts).
5. Date axes: a minimum tick spacing per period and labels only at period starts, so no "Nov 2025 Nov 2025"; axis
   unit titles moved above the axis (they were clipped); legend height for the chart's real width.
6. Vegetation classes Excellent / Good / Fair / Poor / Very Poor (`vegClass`, `vci` palette, mock); the backend's names
   are mapped in one place (`src/lib/vegClasses.ts`, #12).
7. "Top Provinces by Vegetation Health": "Ranked by VCI", and a wider card so the VCI column shows.
8. Header period from `/meta/coverage` ("2000 – present"); "(1960 – Present)" titles show the record's first year.
9. Climate "Mean Annual Runoff" KPI (an anomaly) is shown as "Runoff anomaly (vs 2000–2025)" (#9).
10. Tables: row `unit` / `decimals` / `trendDecimals`, wrapping headers, tighter cells, and a "scroll sideways" hint
    only when columns really overflow; Rainfall Statistics shows all five columns.
11. KPIs show the index value with its class and a two-line sub-label (Drought Class: "8 % of area in D1–D4 · worst
    class on ≥ 20 % of the area …"); the averaged SPI KPIs carry the backend's "(area-weighted mean)".
12. Cascade: the 7 spec stages in backend order from the contract keys (old adapter removed); unavailable stages are
    greyed with their reason, and a stage without a class says why.
13. Seasons as sent (rainfall JFM / AMJ / JAS / OND, climate DJF … SON; no seasons in titles), return periods 2–100
    years, drought frequency as stacked D2–D4 area with district-months on its own axis.

### Verification (category charts)

- `npm run verify` ✔ (81 unit tests, 13 of them for category charts and the audit presets).
- `npm run contract:check`: 323 requests (every catalogue and chart group), **0 schema failures, 0 errors**, 247 ok,
  68 unavailable (501), 8 structural differences (unchanged, documented). Withheld-only groups send `asOf: null` (#10).
- `npm run fixtures:record`: 1 012 fixtures. The hybrid project (32 tests) reads the recorded catalogues, so new tables
  and columns are covered automatically.
- `npm run test:e2e`: 139 passed (mock smoke and axe unchanged, hybrid, backend-down). Run `npm run build` first:
  `npm run verify` ends with `build:live`, which also writes `dist/`, and the mock project previews `dist/`.
- `npm run test:live`: 20 / 20. 15 KPI values and 5 category-chart values (newest value in the chart's data table vs
  `/category/…`) equal the API (`docs/backend/UI_VERIFICATION.md`). It found a bug in every chart's data table: the
  en-ZA decimal comma was printed as a space (9.43 → "9 43"); fixed (`tableNumber`).
- Screenshots `tests/screenshots/live/{page}-1440.png` and `-390.png`, taken after every database chart has loaded,
  with no horizontal overflow and no error panel; checked by eye: chips readable (they scroll sideways on phones), a
  unit on every axis, nothing clipped.
- Not matching the spec yet (data, not frontend): 49 of 95 chart groups have no live column (withheld after the
  backend's plausibility checks, e.g. all of §4.4, §4.5, §4.6 and §5.1, dam storage, river discharge); no chart type
  recommendations from the backend (#8).
