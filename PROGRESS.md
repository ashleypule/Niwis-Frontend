# NIWIS Frontend — Progress

## Done
- **Phase 1 – Foundation:** Vite/React/TS strict, Tailwind v4 tokens (light/dark), app shell (grouped sidebar with rail + drawer, hero header, sticky filter bar with cascading scope + presets + compare + download + report, Ctrl/⌘K search, notifications drawer, quick-access bar, sample-data badge), URL ⇄ filter sync, MSW mock API with zod validation, config (thresholds, palettes, metrics, modules), real boundary GeoJSON (geoBoundaries / DWS / Natural Earth, see `public/geo/SOURCES.md`), seeded generators (climate field, SPI/SPEI, dams water balance, groundwater, settlements, water quality, services, platform).
- **Phase 2 – Components:** KpiCard/Strip (semantic deltas), MapPanel (grid/choropleth/points, legend, scale, north arrow, zoom/home/locate, layer overlay, bottom sheet on mobile), ChartCard + ECharts builders (bands, forecast divider, dual axis, stacked, anomaly, heatmap, waterfall, donut, gauge, range/log, scatter), DataTable (sort, sticky, pills, trends, virtualised), EntityInfoCard, AlertsList, CascadeFlow, RingGauge, HBarList, PageTabs.
- **Phase 3 (in progress):** National Overview, Drought, Dams status pages built and screenshot-checked at 1440 px.

## Next
- Forecast tabs for drought & dams; remaining modules (Phases 4–8); component gallery; tests; docs.

## Known issues
- Screens 37–61 not yet re-reviewed in detail.
- Programme risk count on roadmap summary is static (to be derived from a risk register).
