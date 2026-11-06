# NIWIS — system overview

_The same file is kept in both repositories (`Niwis-Backend/docs` and `Niwis-Frontend/docs`)._

## What NIWIS is

The National Integrated Water Information System is a web dashboard for the Department of Water and Sanitation. It
shows South Africa's water situation — rainfall and drought, rivers and dams, groundwater, water quality, water
services — for the whole country, a province, a district municipality or a Water Management Area (WMA), over a period
the user chooses. Every number comes from the national water database (Supabase) maintained by the NIWIS data team;
the dashboard never invents data.

## How it fits together

```
  Data team ──loads──▶  National water database (Supabase, ~70 tables, per district municipality)
                                   │  read-only, through the session pooler
                                   ▼
                        NIWIS API  (Python; Niwis-Backend)
                        · a register of every table and column, with the reason any column is withheld
                        · computes area-weighted values for provinces and WMAs, anomalies, indices, forecasts
                        · checks every answer before sending it; keeps the data warm in memory
                                   │  JSON over HTTPS (/api/v1/…)
                                   ▼
                        Web dashboard  (Niwis-Frontend; served by nginx)
                        · 24 pages, maps, charts, tables; light and dark themes; phones and desktops
                                   │
                                   ▼
                              DWS staff (browser)
```

## How to read a panel

| Marker on a panel     | Meaning                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Live**              | from the database, with its date ("as of …") and source table in the panel's information button          |
| **Derived**           | computed by NIWIS from live data with a documented method (the information button shows the method note) |
| **Forecast**          | a statistical forecast from the database's own history (the model and its skill are shown)               |
| **Not yet available** | the database does not hold this, or the data fail a plausibility check; the panel says why               |
| **Loading data…**     | the API is still loading after a restart; the panel fills in by itself                                   |

A province, WMA or national value is the **area-weighted** average of its districts (a WMA uses the part of each district
inside it). Volumes are **added up**; a river flow is **never added up** — a scope shows its largest district's flow
(decision D51).

## The pages

"Live / derived / forecast / not available" summarises each page; every panel that is not available says why on the
page, and the full list of data requests is `Niwis-Backend/docs/DATA_TEAM_REQUESTS.md`.

| Page                                     | Live                                                                                            | Derived by NIWIS                                                                                          | Forecast tab                                                             | Not available (and why)                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Overview**                             | its cards and maps come from the module pages (same numbers)                                    | —                                                                                                         | drought and reservoir outlook                                            | sample panels for modules without data                                                                                       |
| **Drought**                              | SPI / SPEI, rainfall anomaly, VCI, soil-moisture anomaly, municipality ranking, drought cascade | SSI-3 streamflow stage, drought classes and area in drought                                               | SPI-3 / SPI-6, SPEI, area in drought, class probabilities, early warning | SGI headline and the cascade's groundwater stage (no reliable current SGI, D50); dam storage (placeholder data); settlements |
| **Rainfall**                             | 12-month totals, anomalies, SPI / SPEI, extremes, daily and monthly charts, provinces table     | —                                                                                                         | monthly rainfall, SPI-1 / SPI-3                                          | —                                                                                                                            |
| **Climate**                              | temperature, heat and cold days, wet and dry spells, ET₀, trends                                | trend slopes, signal chain                                                                                | temperature anomaly, hot days, indicator outlook                         | climate-model projections (RCP / SSP not in the database)                                                                    |
| **Vegetation**                           | NDVI, VCI, VHI, TCI, LST, soil moisture, hotspots                                               | land-cover shares from the catchment table (D49)                                                          | NDVI, VCI, recovery probability                                          | EVI / SAVI / MSAVI2 (`5.1` fails a plausibility check); cropland share                                                       |
| **Runoff**                               | modelled runoff depth, anomaly, baseflow index, coefficient, events                             | flow from runoff × district area; peak flow (highest single district, D51); flow status of districts; SSI | runoff, runoff anomaly, flow, flood probability                          | gauging stations (none in the database)                                                                                      |
| **Dams**                                 | catchment rainfall and soil moisture at the reservoirs                                          | —                                                                                                         | —                                                                        | storage, inflow, outflow, levels (`8_1` storage is a placeholder)                                                            |
| **Surface water**                        | river discharge, stage, velocity, sediment, flow status                                         | river water-quality index (CCME, D49)                                                                     | discharge, runoff, flood probability                                     | stations, e-flow compliance, flood alerts                                                                                    |
| **Groundwater**                          | depth to water from telemetry, level change, recharge, abstraction                              | SGI chart and map (method note states its limits, D50)                                                    | depth to water                                                           | SGI headline (D50); borehole points                                                                                          |
| **Groundwater reserve**                  | aquifer properties, static and dynamic reserve, recharge, exploitation index                    | —                                                                                                         | —                                                                        | —                                                                                                                            |
| **Water quality**                        | WQI (CCME), compliance, parameters against guidelines, hotspots, rankings                       | WQI per district                                                                                          | WQI, nitrate / phosphate, E. coli                                        | sampling points                                                                                                              |
| **Green Drop / Blue Drop / RWQO / IWRM** | their database variables, compliance indicators                                                 | —                                                                                                         | —                                                                        | Blue Drop drinking-water results (`14.1` copies effluent values)                                                             |
| **Water quantity**                       | transfers (to Dec 2024), mean annual runoff, water balance (2 of 12 columns)                    | —                                                                                                         | —                                                                        | the national balance (implausible values)                                                                                    |
| **Water services / Tariffs**             | access, operations, tariffs per municipality (aggregated to districts)                          | —                                                                                                         | yes                                                                      | columns with impossible values                                                                                               |
| **Forecasting Studio (AI)**              | —                                                                                               | runs any forecast on request; model skill                                                                 | all page forecasts                                                       | —                                                                                                                            |
| **Alerts**                               | rule-based alerts from drought, vegetation, water quality, groundwater reserve                  | —                                                                                                         | —                                                                        | —                                                                                                                            |
| **Data integration / Governance**        | every table's coverage, freshness, completeness; every variable's source                        | —                                                                                                         | —                                                                        | ingestion log (not recorded)                                                                                                 |
| **Settlements / Roadmap**                | —                                                                                               | —                                                                                                         | —                                                                        | not in the database                                                                                                          |

## Where the methods are written down

| What                                                                      | Where                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A panel's method, source table and date                                   | the panel's information button (the API's `methodNote`, `source`, `asOf`)           |
| Why a choice was made (WQI method, SGI, flows, baselines…)                | `Niwis-Backend/docs/DECISIONS.md` (D1–D51)                                          |
| Every variable's source table and column, duplicates and withheld columns | Governance page; `Niwis-Backend/app/registry/datasets.yaml`; `docs/DATA_MAPPING.md` |
| Forecast models and their tested skill                                    | `Niwis-Backend/docs/FORECAST_VALIDATION.md`                                         |
| Each check of an API value against the database                           | `Niwis-Backend/docs/VERIFICATION.md`                                                |
| The same value on every page                                              | `Niwis-Backend/docs/AUDIT_STEP4_CONSISTENCY.md`                                     |
| What was audited and what remains                                         | `Niwis-Backend/docs/AUDIT_SUMMARY.md`                                               |
| Data problems for the data team                                           | `Niwis-Backend/docs/DATA_TEAM_REQUESTS.md`                                          |
| Running the system                                                        | `Niwis-Backend/docs/OPERATIONS.md`, `DEPLOYMENT.md`                                 |
