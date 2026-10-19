/**
 * API response schemas (zod) and their TypeScript types. Every response from /api/v1 is validated against
 * these, in mock mode and in api mode, so the mock layer and the backend contract can never drift apart.
 * docs/API_CONTRACT.md documents them.
 */
import { z } from 'zod';

export const Num = z.number().nullable();

// ------------------------------------------------------------------ Provenance (backend additions, all optional)
// docs/backend/CONTRACT_CHANGES.md §3–4. Mock responses omit them, so mock mode keeps validating unchanged.
export const ComponentSchema = z.object({
  key: z.string(),
  asOf: z.string().nullable().optional(),
  source: z.array(z.string()).optional(),
  isStale: z.boolean().optional(),
});
export type Component = z.infer<typeof ComponentSchema>;

export const UnavailableSchema = z.object({ field: z.string(), reason: z.string() });
export type Unavailable = z.infer<typeof UnavailableSchema>;

export const ProvenanceFields = {
  /** date of the newest record used (monthly data are stamped YYYY-MM-01) */
  asOf: z.string().optional(),
  /** database tables the values came from */
  source: z.array(z.string()).optional(),
  /** asOf is more than STALE_AFTER_DAYS older than the newest date in the database */
  isStale: z.boolean().optional(),
  /** per-source dates for panels that combine sources */
  components: z.array(ComponentSchema).optional(),
  /** reference period of anomalies / normals, e.g. "2000–2026 monthly mean" */
  baseline: z.string().optional(),
  baselineNote: z.string().optional(),
  /** "district" | "district-area-weighted" | "district-overlap"; a string so a new value never breaks a panel */
  aggregation: z.string().optional(),
  /** fields that are null in this response, with the reason */
  unavailable: z.array(UnavailableSchema).optional(),
  /** last day of the asOf period (monthly / annual values) */
  periodEnd: z.string().optional(),
};

export const ScopeSchema = z.object({
  level: z.enum(['national', 'province', 'wma', 'catchment', 'municipality', 'entity']),
  id: z.string(),
  name: z.string(),
});
export type Scope = z.infer<typeof ScopeSchema>;

// ------------------------------------------------------------------ KPIs
export const KpiSchema = z.object({
  id: z.string(),
  /** metric registry id (config/metrics.ts) — drives units, decimals and delta colouring */
  metric: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  value: Num,
  unit: z.string().optional(),
  decimals: z.number().optional(),
  /** categorical KPI: class id rendered as a status pill on `scale` */
  status: z.object({ scale: z.string(), id: z.string(), label: z.string() }).optional(),
  /** pre-formatted text shown instead of the number (e.g. "D2", "Moderate") */
  text: z.string().optional(),
  delta: Num.optional(),
  deltaUnit: z.string().optional(),
  deltaLabel: z.string().optional(),
  /** overrides the metric registry's goodDirection */
  goodDirection: z.enum(['up', 'down', 'neutral']).optional(),
  spark: z.array(z.number()).optional(),
  /** why `value` is null */
  unavailableReason: z.string().optional(),
  asOf: z.string().optional(),
  source: z.array(z.string()).optional(),
  isStale: z.boolean().optional(),
  periodEnd: z.string().optional(),
});
export type Kpi = z.infer<typeof KpiSchema>;

export const KpiSetSchema = z.object({
  ...ProvenanceFields,
  module: z.string(),
  asOf: z.string(),
  scope: ScopeSchema,
  kpis: z.array(KpiSchema),
});
export type KpiSet = z.infer<typeof KpiSetSchema>;

// ------------------------------------------------------------------ Time series / XY
const XVal = z.union([z.string(), z.number()]);
export const SeriesSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(['line', 'bar', 'area', 'band', 'scatter', 'step']),
  axis: z.number().int().min(0).max(1).optional(),
  color: z.string().optional(),
  dash: z.boolean().optional(),
  stack: z.string().optional(),
  smooth: z.boolean().optional(),
  symbol: z.boolean().optional(),
  /** [x, y] or, for kind 'band', [x, low, high] */
  data: z.array(z.array(z.union([XVal, z.null()]))),
  // category series (docs/backend/CONTRACT_CHANGES.md §11): the column's own unit and provenance
  unit: z.string().optional(),
  asOf: z.string().optional(),
  isStale: z.boolean().optional(),
  periodEnd: z.string().optional(),
  source: z.array(z.string()).optional(),
  resolution: z.string().optional(),
  status: z.string().optional(),
  /** the column's recommended chart type (category series) */
  chart: z.string().optional(),
});
export type Series = z.infer<typeof SeriesSchema>;

export const AxisSchema = z.object({
  unit: z.string(),
  label: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  inverse: z.boolean().optional(),
  log: z.boolean().optional(),
});
export type Axis = z.infer<typeof AxisSchema>;

export const SeriesSetSchema = z.object({
  ...ProvenanceFields,
  id: z.string(),
  title: z.string().optional(),
  xType: z.enum(['time', 'category', 'value']),
  xUnit: z.string().optional(),
  xLog: z.boolean().optional(),
  axes: z.array(AxisSchema).min(1).max(2),
  series: z.array(SeriesSchema),
  /** horizontal background bands, e.g. drought classes behind an SPI chart */
  bands: z.array(z.object({ from: z.number(), to: z.number(), color: z.string(), label: z.string() })).optional(),
  refLines: z
    .array(z.object({ y: z.number(), label: z.string(), axis: z.number().optional(), color: z.string().optional() }))
    .optional(),
  /** "Historical | Forecast" divider when forecast values follow it */
  asOf: z.string().optional(),
  note: z.string().optional(),
  /** category groups: the group's recommended chart type and, for "band", [min column, max column] */
  chart: z.string().optional(),
  band: z.array(z.string()).optional(),
});
export type SeriesSet = z.infer<typeof SeriesSetSchema>;

// ------------------------------------------------------------------ Database categories (table → groups → columns)
// GET /{module}/categories (docs/backend/CONTRACT_CHANGES.md §11). Labels and units come from the column names; the
// frontend shows them as sent.
export const CategoryVariableSchema = z.object({
  /** exact database column name */
  column: z.string(),
  /** label with unit, e.g. "Daily Rainfall (mm/day)" */
  label: z.string(),
  /** label without unit */
  name: z.string().optional(),
  unit: z.string().optional(),
  /** numeric | categorical */
  kind: z.string().optional(),
  resolution: z.string().optional(),
  /** live | withheld | duplicate */
  status: z.string(),
  reason: z.string().optional(),
  duplicateOf: z.string().optional(),
  group: z.string().optional(),
  defaultVisible: z.boolean().optional(),
  asOf: z.string().optional(),
  isStale: z.boolean().optional(),
  periodEnd: z.string().optional(),
  /** "table.column" */
  source: z.string().optional(),
  note: z.string().optional(),
  unitOverride: z.string().optional(),
  /** recommended chart type: bar (totals, counts) | diverging-bar (anomalies) | line (states, indices) */
  chart: z.string().optional(),
});
export type CategoryVariable = z.infer<typeof CategoryVariableSchema>;

export const CategoryGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string().optional(),
  resolution: z.string().optional(),
  columns: z.array(z.string()),
  defaultVisible: z.array(z.string()),
  path: z.string().optional(),
  /** recommended chart type: the members' common type (bar | diverging-bar | line), band (min / max pair) or mixed */
  chart: z.string().optional(),
  /** for chart "band": [min column, max column] */
  band: z.array(z.string()).optional(),
});
export type CategoryGroup = z.infer<typeof CategoryGroupSchema>;

export const CategoryTableSchema = z.object({
  id: z.string(),
  /** exact database table name */
  table: z.string(),
  label: z.string(),
  spec: z.string().optional(),
  specTag: z.string().optional(),
  modules: z.array(z.string()).optional(),
  resolution: z.string().optional(),
  asOf: z.string().nullable().optional(),
  isStale: z.boolean().optional(),
  counts: z.object({ live: z.number(), withheld: z.number(), duplicate: z.number() }).optional(),
  groups: z.array(CategoryGroupSchema),
  variables: z.array(CategoryVariableSchema),
});
export type CategoryTable = z.infer<typeof CategoryTableSchema>;

export const CategoryListSchema = z.object({
  ...ProvenanceFields,
  module: z.string(),
  tables: z.array(CategoryTableSchema),
});
export type CategoryList = z.infer<typeof CategoryListSchema>;

// ------------------------------------------------------------------ Categories (bars, donuts, stacks, waterfalls)
export const CategorySetSchema = z.object({
  ...ProvenanceFields,
  id: z.string(),
  title: z.string().optional(),
  unit: z.string(),
  categories: z.array(z.string()),
  /** optional per-category colour (donuts, class bars) */
  colors: z.array(z.string()).optional(),
  series: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      values: z.array(Num),
      color: z.string().optional(),
      stack: z.string().optional(),
      kind: z.enum(['bar', 'line']).optional(),
      axis: z.number().optional(),
    }),
  ),
  /** one unit per category when `unit` is "mixed" (vegetation drivers) */
  units: z.array(z.string()).optional(),
  /** headline shown inside donuts */
  center: z.object({ value: z.string(), label: z.string() }).optional(),
  axis2Unit: z.string().optional(),
});
export type CategorySet = z.infer<typeof CategorySetSchema>;

// ------------------------------------------------------------------ Tables
export const ColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'class', 'trend', 'delta', 'bar', 'date', 'rank']),
  unit: z.string().optional(),
  decimals: z.number().optional(),
  /** palette id for 'class' columns (and optional colouring of 'number' columns) */
  scale: z.string().optional(),
  goodDirection: z.enum(['up', 'down', 'neutral']).optional(),
  align: z.enum(['left', 'right', 'center']).optional(),
});
export type Column = z.infer<typeof ColumnSchema>;

export const TableSetSchema = z.object({
  ...ProvenanceFields,
  id: z.string(),
  title: z.string().optional(),
  columns: z.array(ColumnSchema),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
  /** row key used for selection / links */
  rowKey: z.string().optional(),
  linkTo: z.string().optional(),
  total: z.number().optional(),
});
export type TableSet = z.infer<typeof TableSetSchema>;

// ------------------------------------------------------------------ Matrix (heatmap)
export const MatrixSetSchema = z.object({
  ...ProvenanceFields,
  id: z.string(),
  title: z.string().optional(),
  rows: z.array(z.string()),
  cols: z.array(z.string()),
  values: z.array(z.array(z.union([z.number(), z.string(), z.null()]))),
  unit: z.string(),
  scale: z.string(),
});
export type MatrixSet = z.infer<typeof MatrixSetSchema>;

// ------------------------------------------------------------------ Map layers
export const MapPointSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  value: z.union([z.number(), z.string(), z.null()]),
  /** marker radius hint 0–1 (e.g. dam capacity) */
  size: z.number().optional(),
  kind: z.string().optional(),
  sub: z.string().optional(),
});
export type MapPoint = z.infer<typeof MapPointSchema>;

export const MapLayerSchema = z.object({
  ...ProvenanceFields,
  /** boundary set a choropleth is keyed to ("districts" → public/geo/districts.json, MDB codes) */
  geometry: z.string().optional(),
  id: z.string(),
  title: z.string(),
  kind: z.enum(['choropleth', 'grid', 'points']),
  level: z.enum(['province', 'wma', 'catchment', 'municipality', 'grid', 'point']),
  scale: z.string(),
  unit: z.string(),
  date: z.string(),
  values: z.record(z.union([z.number(), z.string(), z.null()])).optional(),
  cellSize: z.number().optional(),
  cells: z.array(z.tuple([z.number(), z.number(), z.union([z.number(), z.null()])])).optional(),
  points: z.array(MapPointSchema).optional(),
  /** data-derived classes that replace the palette's (ndvi-trend) */
  legend: z
    .array(
      z.object({
        from: z.number().nullable(),
        to: z.number().nullable(),
        color: z.string(),
        label: z.string(),
      }),
    )
    .optional(),
});
export type MapLayer = z.infer<typeof MapLayerSchema>;

// ------------------------------------------------------------------ Entities
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  province: z.string().optional(),
  wma: z.string().optional(),
  municipality: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  sub: z.string().optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const EntityListSchema = z.object({
  ...ProvenanceFields,
  type: z.string(),
  total: z.number(),
  items: z.array(EntitySchema),
});
export type EntityList = z.infer<typeof EntityListSchema>;

export const EntityDetailSchema = EntitySchema.extend({
  ...ProvenanceFields,
  title: z.string(),
  status: z.object({ scale: z.string(), id: z.string(), label: z.string() }).optional(),
  fields: z.array(
    z.object({
      label: z.string(),
      value: z.union([z.string(), z.number(), z.null()]),
      unit: z.string().optional(),
      scale: z.string().optional(),
      asOf: z.string().nullable().optional(),
      isStale: z.boolean().optional(),
    }),
  ),
  image: z
    .enum(['dam', 'river', 'borehole', 'wwtw', 'wtp', 'settlement', 'station', 'aquifer', 'municipality'])
    .optional(),
});
export type EntityDetail = z.infer<typeof EntityDetailSchema>;

// ------------------------------------------------------------------ Alerts, search, reference
export const SeveritySchema = z.enum(['critical', 'high', 'moderate', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  date: z.string(),
  module: z.string(),
  severity: SeveritySchema,
  title: z.string(),
  message: z.string(),
  location: z.string(),
  province: z.string().optional(),
  entityId: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  status: z.enum(['open', 'acknowledged', 'assigned', 'resolved']),
});
export type Alert = z.infer<typeof AlertSchema>;
export const AlertListSchema = z.object({ total: z.number(), unread: z.number(), items: z.array(AlertSchema) });
export type AlertList = z.infer<typeof AlertListSchema>;

export const SearchHitSchema = z.object({
  type: z.string(),
  id: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  path: z.string(),
  params: z.record(z.string()).optional(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;
export const SearchResultSchema = z.object({ q: z.string(), hits: z.array(SearchHitSchema) });
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const RefItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  parent: z.string().optional(),
  province: z.string().optional(),
  wma: z.string().optional(),
});
export type RefItem = z.infer<typeof RefItemSchema>;
export const RefListSchema = z.object({ type: z.string(), items: z.array(RefItemSchema) });
export type RefList = z.infer<typeof RefListSchema>;

// ------------------------------------------------------------------ Errors
/** Error body: `{error, issues?}` from the contract, plus the backend's optional `code` and 501 / 500 fields. */
export const ApiErrorBodySchema = z.object({
  error: z.string(),
  /** BAD_REQUEST | NOT_FOUND | RATE_LIMITED | DATA_UNAVAILABLE */
  code: z.string().optional(),
  issues: z.array(z.unknown()).optional(),
  /** 501 DATA_UNAVAILABLE */
  detail: z.string().optional(),
  missing: z.array(z.string()).optional(),
  /** 500 */
  requestId: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

// ------------------------------------------------------------------ Meta (backend /health, /meta/*)
export const HealthSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  time: z.string().optional(),
  database: z.object({ reachable: z.boolean(), latencyMs: z.number().nullable().optional() }).passthrough().optional(),
  staleAfterDays: z.number().optional(),
  modules: z.array(
    z.object({
      module: z.string(),
      status: z.string(),
      reason: z.string().nullable().optional(),
      tables: z.array(z.string()).optional(),
    }),
  ),
});
export type Health = z.infer<typeof HealthSchema>;

export const MetaSourceSchema = z.object({
  table: z.string(),
  module: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  exists: z.boolean().optional(),
  rows: z.number().nullable().optional(),
  districts: z.number().nullable().optional(),
  firstDate: z.string().nullable().optional(),
  asOf: z.string().nullable().optional(),
  coveredTo: z.string().nullable().optional(),
  isStale: z.boolean().nullable().optional(),
  completenessPct: z.number().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
  statsUpdatedAt: z.string().nullable().optional(),
  variables: z
    .object({
      canonical: z.array(z.string()).optional(),
      duplicate: z.array(z.string()).optional(),
      withheld: z.array(z.object({ column: z.string(), reason: z.string() })).optional(),
      unused: z.array(z.string()).optional(),
    })
    .optional(),
  knownIssues: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});
export type MetaSource = z.infer<typeof MetaSourceSchema>;
export const MetaSourcesSchema = z.object({
  newestDataDate: z.string().optional(),
  staleAfterDays: z.number().optional(),
  note: z.string().optional(),
  items: z.array(MetaSourceSchema),
});
export type MetaSources = z.infer<typeof MetaSourcesSchema>;

export const MetaCoverageSchema = z.object({
  newestDataDate: z.string().optional(),
  staleAfterDays: z.number().optional(),
  modules: z.array(
    z.object({
      module: z.string(),
      tables: z.array(z.string()),
      rows: z.number().nullable().optional(),
      firstDate: z.string().nullable().optional(),
      asOf: z.string().nullable().optional(),
      oldestCoveredTo: z.string().nullable().optional(),
      isStale: z.boolean().nullable().optional(),
      completenessPct: z.number().nullable().optional(),
      variables: z.object({ live: z.number(), withheld: z.number() }).optional(),
    }),
  ),
});
export type MetaCoverage = z.infer<typeof MetaCoverageSchema>;

export const MetaVariablesSchema = z.object({
  items: z.array(
    z
      .object({
        id: z.string(),
        label: z.string(),
        unit: z.string().nullable().optional(),
        metric: z.string().nullable().optional(),
        status: z.string(),
        source: z.string().nullable().optional(),
        duplicates: z.array(z.string()).optional(),
        reason: z.string().nullable().optional(),
      })
      .passthrough(),
  ),
});
export type MetaVariables = z.infer<typeof MetaVariablesSchema>;

// ------------------------------------------------------------------ Filters (query params)
export interface FilterParams {
  province?: string;
  wma?: string;
  catchment?: string;
  municipality?: string;
  /** district / metro MDB code (mock modules; live requests send it as `municipality`) */
  district?: string;
  entityId?: string;
  from?: string;
  to?: string;
  period?: string;
  compare?: string;
}
