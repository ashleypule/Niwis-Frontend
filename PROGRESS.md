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

- All data is generated sample data (badge shown) until `VITE_DATA_SOURCE=api` is set against a backend that implements `docs/API_CONTRACT.md`.
- Alert acknowledge / assign actions and the downloads history are stored in the browser (localStorage) until the alert-workflow API exists.
- The Excel export is tab-separated values with an `.xls` extension, which avoids a heavy xlsx dependency. Swap in a server-side export if true `.xlsx` is required.
- The programme risk count on the Roadmap summary is static, pending a risk-register endpoint.
- The ECharts vendor chunk (about 240 kB gzipped) is split out and loaded after the app shell with the first page. The mock engine (about 210 kB gzipped) loads only in mock mode.
