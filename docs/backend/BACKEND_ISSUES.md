# Backend issues found while integrating the frontend

For the backend team. Found while connecting the NIWIS frontend to the backend (October 2026). Each item has the
request, what the frontend expected and what came back, and what the frontend does meanwhile. Reproduce the structural
ones with `npm run contract:check` in the frontend repo (report: `docs/backend/CONTRACT_CHECK.md`).

| #   | Endpoint                                                                                     | Severity                        | Frontend workaround               |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| 1   | `vegetation/timeseries?metric=indices&set=…` ignores `set`                                   | Wrong data on a tab             | Tab shows "Not yet available"     |
| 2   | `drought/table?metric=cascade`: row keys differ from the contract                            | Panel would be blank            | Adapter in `CascadeFlow`          |
| 3   | `climate/table?metric=signal-chain`: row keys differ from the contract                       | Panel would be blank            | Adapter in `CascadeFlow`          |
| 4   | Per-IP rate limit (120 / min) vs. requests per page                                          | 429s for offices behind one NAT | Client backs off on `Retry-After` |
| 5   | `climate/timeseries?metric=indicator-trends`: all-null series without an `unavailable` entry | Minor                           | Hidden, listed as "no values"     |
| 6   | `climate/breakdown?metric=seasonal-change`: values for 1981–2000                              | Misleading values               | Series listed in `unavailable` hidden |
| 7   | `isStale` on annual data                                                                       | Misleading marker               | Shown as sent                     |
| 8   | Category series: `kind` is always `line` (no recommended chart type)                           | Minor                           | Chart type inferred per column    |
| 9   | `climate/summary` → `runoff`: labelled "Mean Annual Runoff", value is a % anomaly             | Misleading label                | Renamed in `KpiCard` (`kpiLabel`) |
| 10  | Category groups with only withheld columns: `asOf: null`                                      | Schema (contract says omitted)  | Schema accepts null; UI does not request these groups |
| 11  | Summary series do not name their source column                                                 | Labels cannot follow the catalogue | Map in `src/config/seriesColumns.ts` |
| 12  | Vegetation classes still Very Healthy … Very Stressed (spec §5.3: Excellent … Very Poor)      | Wrong wording                   | Mapped in the client (`src/lib/vegClasses.ts`) |
| 13  | Daily category groups take 2–4 s each                                                          | Slow pages                      | One request per group (`vars=all`), toggles client-side |

**Status 2026-10-16:** #1–#7 are fixed in the backend (`../Niwis Backend/docs/ISSUE_FIXES.md`) and confirmed by
`npm run contract:check` and the recorded fixtures: `set` is honoured, the cascade and signal chain carry the contract
keys (the frontend adapter is removed), the rate limit is 600 / min, null series come with a reason, `p0` is null, and
annual values carry `periodEnd` and are no longer stale. #8–#13 are new (database category charts and the spec audit).

## 1. `set` is ignored on the vegetation indices series

- **Request:** `GET /api/v1/vegetation/timeseries?metric=indices&set=vci,vhi,tci` (and `set=ndwi,ndii`)
- **Expected:** the requested indices (the mock and the contract return VCI / VHI / TCI, or NDWI / NDII).
- **Actual:** always NDVI, EVI, SAVI, MSAVI2 (with EVI / SAVI / MSAVI2 null), whatever `set` is.
- **Frontend:** the "Condition" and "Water content" tabs on `/vegetation` check that the returned series match the
  requested set and otherwise show "Not yet available" instead of plotting NDVI under a VCI label.
- **Fix:** honour `set` (VCI, VHI, TCI, NDWI are all in `satellite_remote_sensing`; NDII is withheld, so it should be a
  null series with an `unavailable` entry).

## 2. Drought cascade: row keys differ from the contract

- **Request:** `GET /api/v1/drought/table?metric=cascade`
- **Expected (contract / mock):** rows `{stage, metric, value (text), cls, scale, bar}`; `CascadeFlow` reads these keys.
- **Actual:** columns `stage, value (number), class, severity, asOf`; no `metric`, `scale`, `cls` or `bar`.
- **Frontend:** `CascadeFlow` accepts both shapes (`class` → `cls`, `severity` → `bar`, scale per stage from the row id).
- **Fix (optional):** either keep this shape and document it in `CONTRACT_CHANGES.md`, or add the contract's keys.

## 3. Climate signal chain: row keys differ from the contract

- **Request:** `GET /api/v1/climate/table?metric=signal-chain`
- **Expected (contract / mock):** the cascade shape `{stage, metric, value, cls, scale, bar}`.
- **Actual:** `{signal, change, severity}` (severity null, with an `unavailable` entry, which is documented).
- **Frontend:** `CascadeFlow` maps `signal` → stage and `change` → value; the severity pill shows "—".
- **Fix (optional):** as #2.

## 4. Rate limit per IP vs. requests per page

- **Setting:** `RATE_LIMIT_PER_MINUTE=120` per client IP (`app/middleware.py`).
- **Observation:** one visit to `/drought` makes about 45 API requests (KPIs, 13 map layers are fetched on demand, ~25
  charts and tables, tab switches add more); `/rainfall` about 30. Two or three people in one DWS office (one public IP
  behind NAT) opening dashboards in the same minute exceed the limit.
- **Frontend:** on 429 the client waits for `Retry-After` and retries twice, so panels load late rather than fail.
- **Suggestion:** key the limit by user / token once authentication exists, raise it for the DWS network, or exempt
  cached responses.

## 5. All-null series without an `unavailable` entry

- **Request:** `GET /api/v1/climate/timeseries?metric=indicator-trends`
- **Actual:** the "Drought frequency" series is null for every year, and the response has no `unavailable` list.
- **Expected:** per `CONTRACT_CHANGES.md` §3, a null field comes with `unavailable: [{field: "series.drought", reason}]`.
- **Frontend:** hides the series and lists it under the chart as "no values in the database for this selection".

## 6. Seasonal change: values for a period the database does not cover

- **Request:** `GET /api/v1/climate/breakdown?metric=seasonal-change&var=temperature` (and `var=rainfall`)
- **Actual:** series `p0` "1981–2000" has values (`[21.58, 16.81, 12.66, 17.88]` °C), while the same response says
  `unavailable: [{"field": "series.p0", "reason": "No data before 2000 in the database"}]`. `FRONTEND_INTEGRATION.md`
  also lists this series as null.
- **Expected:** `values: [null, null, null, null]` for `p0` (the contract: a field listed in `unavailable` is null).
- **Risk:** the numbers cannot come from the database (it starts in 2000). Shown as-is they would be read as a measured
  1981–2000 climatology.
- **Frontend:** any series listed in `unavailable` is hidden and listed under the chart, whatever its values.

## 7. `isStale` on annual data

- **Requests:** e.g. `climate/timeseries?metric=extremes`, `climate/table?metric=statistics`, `rainfall/breakdown?metric=seasonal`
- **Actual:** annual values for 2025 are stamped `asOf: "2025-01-01"` and come with `isStale: true` (more than 90 days
  before the newest record, 2026-09-06), although 2025 is the last complete year and nothing newer can exist.
- **Expected:** staleness for annual series measured from the end of the period (`2025-12-31`), or annual series exempt.
- **Frontend:** shows what the backend says ("Data to Jan 2025" marker). Users may read it as a late feed.

## 8. Category series: no recommended chart type

- **Request:** `GET /api/v1/{module}/category/{table}/{group}` (every group, 71 of them)
- **Actual:** every series has `kind: "line"`, including totals (daily rainfall, seasonal totals, R20mm days) and
  anomalies; groups carry no `chart` field.
- **Expected (frontend prompt / FRONTEND_INTEGRATION §8):** the backend's recommended chart type per column or group,
  where it has one.
- **Frontend:** treats `line` as "no recommendation" and infers the type from the catalogue entry
  (`src/lib/categories.ts` `variableKind`): totals → bars, anomalies → bars around 0, SPI / SPEI → lines over the
  D0–D4 bands, min / max pairs → a band, everything else → lines. A non-`line` `kind` or a group `chart` from the
  backend would win.

## 9. Climate KPI "Mean Annual Runoff" holds an anomaly

- **Request:** `GET /api/v1/climate/summary`
- **Actual:** `{"id": "runoff", "metric": "runoffAnomaly", "label": "Mean Annual Runoff", "value": 29.7, "unit": "%",
  "sublabel": "2025 vs 2000–2025 mean (100 mm)"}`: the value is the 2025 runoff anomaly, not MAR.
- **Expected:** label "Runoff anomaly (vs 2000–2025)", or a MAR volume / depth if that is what the card should show.
- **Frontend:** `kpiLabel()` in `KpiCard` names it "Runoff anomaly (vs 2000–2025)" (period from the sub-label) when
  the metric is `runoffAnomaly`, the unit `%` and the label says Mean Annual Runoff; it drops out once the label is fixed.

## 10. Withheld-only category groups send `asOf: null`

- **Requests:** 49 groups whose columns are all withheld, e.g.
  `drought/category/hydrological-drought/dam-storage-mm3?vars=all`, `climate/category/irrigation-demand-daily/cwr-mm-day`.
- **Actual:** `"asOf": null` at the top of the SeriesSet.
- **Expected (CONTRACT_CHANGES.md header):** optional fields are omitted, never sent as `null`.
- **Frontend:** `SeriesSet.asOf` accepts null. The page never requests these groups: the catalogue already says every
  column is withheld, so the chart shows "Not yet available" with the reasons straight from `/categories`.

## 11. Summary series do not name their source column

- **Requests:** e.g. `drought/timeseries?metric=soil-moisture` (`surface`, `rootzone`), `rainfall/timeseries?metric=spi-spei`,
  `vegetation/timeseries?metric=indices`.
- **Actual:** series carry `key` and a hand-written `name` ("Surface soil moisture", "SPI-3") but no `source` column,
  so the frontend cannot tie a legend to the catalogue's label for the column it plots ("Surface Soil Moisture
  (m³/m³)", "SPI 3 – Short Term Agricultural Drought").
- **Expected:** `source: ["table.column"]` on series that plot one column as stored (as category series already have).
- **Frontend:** `src/config/seriesColumns.ts` maps those series to their columns; the label and unit are read from the
  live catalogue, so no wording is hard-coded. Derived series (sums, anomalies, area shares) keep the backend's names.

## 12. Vegetation classes: spec names

- **Requests:** `vegetation/summary` (VCI / VHI / TCI `status`), `vegetation/breakdown?metric=classification`,
  `vegetation/table?metric=provinces|hotspots`, `drought/table?metric=cascade` (vegetation stage `cls`).
- **Actual:** Very Healthy / Healthy / Moderate / Stressed / Very Stressed.
- **Expected (spec §5.3):** Excellent / Good / Fair / Poor / Very Poor.
- **Frontend:** `normalizeVegClasses()` (`src/lib/vegClasses.ts`), applied by the API client to every response,
  maps the names in one place; `thresholds.ts` `vegClass()` and the `vci` palette use the spec names.

## 13. Daily category groups are slow

- **Requests:** daily groups, e.g. `rainfall/category/core-rainfall-variables/daily-rainfall-total-mm?vars=all&period=12M`
  (2.6 s), `climate/category/temperature-change/temperature-c?vars=all&period=12M&municipality=DC32` (4.2 s); monthly
  and annual groups answer in < 50 ms once warm.
- **Impact:** the Climate page holds 28 category charts and Rainfall 20; on a cold cache the last charts of a page fill
  10–30 s after the page opens.
- **Frontend:** one request per group (`vars=all`); switching chips never refetches. A per-module bulk endpoint, or
  caching of the daily aggregates, would help.

## Not backend bugs (fixed in the frontend)

- Log axes (flow-duration curve, flood frequency) ran 1–10 under values of 400–5 400 m³/s: the FDC ends at 0 flow, and
  0 cannot sit on a log axis. Non-positive values are now left out and the axis spans the data's decades.
- "Historical | Forecast" was drawn on every chart with an `asOf` (which is provenance): now only where values follow
  `asOf`.

- `rainfall/timeseries?metric=station` without `entityId` → 400. The frontend sent it before the district list had
  loaded; it now waits for the entity.
