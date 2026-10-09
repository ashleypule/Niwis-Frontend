# NIWIS Frontend — Build Plan

Source of truth: the NIWIS Data Requirements Specification (DRS v1.0, May 2026, supplied with the brief; § references throughout the code) + the 61 mockups in `docs/reference/screens/`.
Read this file and `PROGRESS.md` first after any context reset.

## 1. Screenshot → module map

Screens are numbered `1.jpg … 61.jpg` (the order they were supplied). Variants per module are merged into one page.

| Module                                         | Status screens                                               | Forecast screen                                  |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| National Overview                              | 1                                                            | —                                                |
| Drought Status Monitoring                      | 2, 3, 4, 5, 6                                                | 53                                               |
| Climate Change Indicators                      | 7, 8, 9, 10                                                  | 11                                               |
| Vegetation Condition                           | 12, 13, 14                                                   | 15                                               |
| Rainfall Status Monitoring                     | 16, 17                                                       | 54                                               |
| Runoff Status Monitoring                       | 18, 19, 55                                                   | 56                                               |
| Dam & Reservoir Status                         | 20, 21, 22, 23                                               | 24                                               |
| Surface Water Monitoring                       | 25, 26, 27                                                   | 57                                               |
| Groundwater Level Monitoring                   | 28, 29, 30, 58                                               | —                                                |
| Groundwater Reserve Assessment                 | 31                                                           | —                                                |
| Water Quality Monitoring                       | 32, 33, 59                                                   | 34                                               |
| Wastewater Compliance (Green Drop)             | 35                                                           | —                                                |
| Drinking Water Compliance (Blue Drop)          | 36                                                           | —                                                |
| Resource Water Quality Objectives (RWQO)       | 37                                                           | —                                                |
| Water Resource Management (IWRM)               | 38                                                           | —                                                |
| Water Quantity Assessment                      | 39                                                           | —                                                |
| Water Services & Infrastructure                | 40, 41                                                       | 42                                               |
| Water Tariffs & Pricing                        | 43, 44                                                       | 45                                               |
| Drought-Affected Settlements                   | 46, 47                                                       | 48                                               |
| AI & Predictive Analytics                      | 49                                                           | —                                                |
| Data Integration                               | 50, 51 (architecture)                                        | — · report view: 60 (`/data-integration/report`) |
| Implementation Roadmap                         | 52                                                           | —                                                |
| Data Governance & Quality                      | 61                                                           | —                                                |
| Alerts, Reports, Print view, `/dev/components` | (no screens — built from spec §20–22 and the shell patterns) | —                                                |

## 2. Routes

| Route                  | Page                                                      | Forecast route            |
| ---------------------- | --------------------------------------------------------- | ------------------------- |
| `/`                    | National Overview                                         |                           |
| `/drought`             | Drought Status Monitoring                                 | `/drought/forecast`       |
| `/climate`             | Climate Change Indicators                                 | `/climate/forecast`       |
| `/vegetation`          | Vegetation Condition                                      | `/vegetation/forecast`    |
| `/rainfall`            | Rainfall Status Monitoring                                | `/rainfall/forecast`      |
| `/runoff`              | Runoff Status Monitoring                                  | `/runoff/forecast`        |
| `/dams`                | Dam & Reservoir Status                                    | `/dams/forecast`          |
| `/surface-water`       | Surface Water Monitoring                                  | `/surface-water/forecast` |
| `/groundwater`         | Groundwater Level Monitoring                              |                           |
| `/groundwater-reserve` | Groundwater Reserve Assessment                            |                           |
| `/water-quality`       | Water Quality Monitoring                                  | `/water-quality/forecast` |
| `/green-drop`          | Wastewater Compliance (Green Drop)                        |                           |
| `/blue-drop`           | Drinking Water Compliance (Blue Drop)                     |                           |
| `/rwqo`                | Resource Water Quality Objectives                         |                           |
| `/iwrm`                | Water Resource Management                                 |                           |
| `/water-quantity`      | Water Quantity Assessment                                 |                           |
| `/services`            | Water Services & Infrastructure                           | `/services/forecast`      |
| `/tariffs`             | Water Tariffs & Raw Water Pricing                         | `/tariffs/forecast`       |
| `/settlements`         | Drought-Affected Settlements                              | `/settlements/forecast`   |
| `/ai`                  | AI & Predictive Analytics                                 |                           |
| `/data-integration`    | Data Integration (+ `/data-integration/report` printable) |                           |
| `/governance`          | Data Governance & QA                                      |                           |
| `/roadmap`             | Implementation Roadmap                                    |                           |
| `/alerts`              | Alerts & Early Warnings                                   |                           |
| `/reports`             | Reports & Downloads (+ `/reports/print` print view)       |                           |
| `/dev/components`      | Component gallery (dev)                                   |                           |

## 3. Panels per page (main ones; source screens in brackets)

- **Overview** [1]: 8 KPIs · multi-layer national map (tabs per module + point layers) · national drought trend stacked D0–D4 · top-10 dams · key indicators chart (tabs) · services access by province (stacked) · AI forecasts (tabs) · top-10 drought-affected settlements · alerts · programme progress · data-quality rings · resource & budget.
- **Drought** [2–6]: 10 KPIs (class, SPI-3, SPI-6, SPEI-12, VCI, soil-moisture anomaly, SSI, dam storage, SGI, settlements at risk) · map with full layer list [3] · cascade [2,3] · most-affected provinces/catchments with confidence [2] · SPI 1/3/6/12/24 with class bands [2] · rainfall & SPEI [2,3] · dam storage inflow/outflow [2,3] · groundwater & SGI [2,3] · vegetation heatmap province×month [2] · soil moisture surface/root [3,4] · storage vs SPI scatter [4] · 3-month outlook mini-maps [2] · early-warning table [4] · data source status [3] · severity distribution donut [6] · population at risk / restrictions [6]. Forecast tab: current vs forecast maps, area-under-drought forecast, class probability [3], settlements & population forecasts, key indicators table (now/3/6/12/24 m), province×horizon risk heatmap, recovery probability [6].
- **Climate** [7–11]: KPIs · trend map (°C/decade, layer tabs) · Tmax/Tavg/Tmin + anomaly since 1960 [8] · seasonal changes [7] · RCP 4.5/8.5 projections to 2100 [7] · ETCCDI extremes [8] · MAP & seasonality + statistics panel (CV, Sen, MK, ENSO) [8] · evaporation & atmospheric demand [8] · irrigation demand [8] · streamflow–climate linkage [8] · vulnerability index map [7] · climate signal chain [8] · trend insights + data source status [8] · indicators by province table [9]. Forecast [11]: projected temp/rain/SPI/availability maps with year tabs, trends & forecasts chart, heat days / drought frequency / extreme rain bars, forecast summary table, risk outlook.
- **Vegetation** [12–15]: index tabs (NDVI…soil moisture) [13] · VCI + VHI small multiples [12] · indices trends with normal range [12,13] · anomaly bars [12,13] · land cover breakdown [12,14] · top provinces [12] · key drivers [12] · classification donut [13] · Sen's slope map [13] · seasonal condition [13] · rangeland gauge [14] · hotspots table [14]. Forecast [15].
- **Rainfall** [16,17]: KPIs · map layers · monthly vs prior years vs 1981–2010 · anomaly · SPI & SPEI · intensity & extremes · seasonal DJF/MAM/JJA/SON · CDD/CWD · by province · wettest/driest · data source cards · statistics table · 3-month outlook.
- **Runoff** [18,19]: KPIs · map · discharge · anomaly · SSI · rainfall–runoff · water balance · flood frequency LP3 · drivers · statistics · top/lowest stations · FDC log · runoff by province · national volume.
- **Dams** [20–24]: KPIs · dam map (size = capacity, colour = %FSC) · top-10 · storage by WMA · distribution donut · trend with min–max band + prior year · inflow/outflow · key dam card + selector · operational status donut · selected dam trend / monthly comparison / rule curve / anomaly / satellite extent · lowest/highest · national storage by WMA. Forecast [24].
- **Surface water** [25–27]: KPIs · station map coloured by flow class · discharge, level with bankfull, sediment conc. & load, FDC, baseflow separation · e-flow compliance donut · real-time station card · WQ at gauge · top/lowest flows · flood & drought risk donut · abstraction by river.
- **Groundwater** [28–30]: KPIs · borehole map · level trend (inverted depth axis) · anomaly · SGI · seasonal by year · recharge vs abstraction · level by aquifer · lowest boreholes · status donut · quality trends · abstraction by sector · borehole card · aquifer status table.
- **GW reserve** [31]: KPIs incl. EI gauge · EI map · level trend with Sen's slope · recharge vs abstraction · reserve components to 2050 · sustainable yield vs EI · aquifer card · SVG cross-section · lowest levels · alerts.
- **Water quality** [32–34]: WQI map with parameter layers · trends vs SANS limit · parameter range (log) · compliance donut · by province 100% stacked · hotspots · station counts · latest results · top/lowest stations · WQI distribution. Forecast [34].
- **Green Drop** [35] / **Blue Drop** [36]: KPIs · compliance map · performance trend · capacity vs utilisation · effluent / key parameters · microbiological · receiving water / nutrients / metals · breakdown donut · plant card · latest results vs limits · top/bottom 5 · alerts.
- Remaining pages per the build prompt §6 items 14–25.

## 4. Data architecture

`components → api/queries (TanStack Query) → api/client.ts (fetch + zod) → /api/v1/* → MSW (mock) | backend (api)`.

Generic endpoint family, per module (`{m}` = module id):

| Endpoint                                                           | Returns (zod schema)                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /api/v1/{m}/summary`                                          | `KpiSet` — KPI cards                                                   |
| `GET /api/v1/{m}/timeseries?metric=&entityId=&from=&to=&interval=` | `SeriesSet` — series + axes (units), bands, as-of marker               |
| `GET /api/v1/{m}/breakdown?metric=`                                | `CategorySet` — categories × series (bars, donuts, stacked, waterfall) |
| `GET /api/v1/{m}/table?metric=`                                    | `TableSet` — typed columns + rows                                      |
| `GET /api/v1/{m}/matrix?metric=`                                   | `MatrixSet` — heatmaps                                                 |
| `GET /api/v1/{m}/map?layer=&level=&date=`                          | `MapLayer` — choropleth / grid / points                                |
| `GET /api/v1/{m}/entities` · `/entities/{id}`                      | `EntityList` · `EntityDetail`                                          |
| `GET /api/v1/{m}/forecast?metric=&horizon=&entityId=`              | `SeriesSet` with p10/p90 band + as-of                                  |
| `GET /api/v1/alerts` · `/reference/{type}` · `/search?q=`          | alerts, reference lists, search hits                                   |

All accept global filter params: `province, wma, catchment, municipality, entityId, from, to, period, compare`.
Classification is never sent as colour: rows/points carry the value (and optionally a class id); the client colours it via `config/palettes.ts`.

## 5. Mock data plan (seeded, consistent)

- PRNG mulberry32 seeded by hash(`entityId|metric`). Everything lazy + memoised.
- **Climate field**: MAP(lon, lat) = west→east gradient + escarpment/Cape Fold/coast bumps, calibrated to a national mean ≈ 460 mm; rainfall regime (winter WC, all-year southern coast, summer elsewhere). Monthly rainfall 1960→today per location = MAP × seasonal share × exp(anomaly), anomaly = national + regional AR(1) latent signals + local noise + a deterministic recent dry spell in the west/centre (so the dashboards show realistic D1–D3 conditions). Daily rain = zero-inflated gamma disaggregation.
- **SPI/SPEI** computed from that rainfall (gamma fit per calendar month, 1981–2010 calibration; SPEI = log-logistic on P − PET). Classes D0–D4 from `thresholds.ts` (spec §3.4).
- **Temperature**: lat/elevation proxy climatology + seasonal cycle + 0.18 °C/decade trend + noise; PET by Hargreaves.
- **Dams**: ~148 real dams (spec §8.3 capacities exact; others approximate, flagged). Monthly water balance simulation 1980→today (inflow from catchment rainfall, demand releases, evaporation, spill) → %FSC clamped 0–105. National % = Σvolume / Σcapacity.
- **Groundwater**: boreholes at municipality centroids + jitter; level = base + lagged seasonal + SPI-12 response + abstraction trend; SGI from levels; EI = abstraction / recharge.
- **Quality**: stations, monthly samples; E. coli lognormal; pass/fail vs SANS 241 (spec §14.1); WQI bands; Green/Blue Drop scores with screenshot bands.
- **IWRM / services / tariffs** anchored on spec §17.2 (MAR 49 000, municipal 4 200, agricultural 11 000, industrial 1 800, reserve 2 800 Mm³/a).
- Forecasts: median + p10/p90 widening with horizon.
- Grid layers: 0.25° cells pre-clipped to SA (`src/mocks/reference/generated.ts`, 1 810 cells).

## 6. Entities

Province (9) · WMA (9, 2012 delineation) · Catchment (80 secondary drainage regions) · Municipality (213) · Dam (~148) · Gauging station · Borehole · Aquifer (8 types) · WQ station · WWTW (~900) · Water supply system (~1 100) / WTP · Settlement · SWSA (5) · Inter-basin transfer · Alert.
