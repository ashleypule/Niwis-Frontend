/**
 * API response schemas (zod) and their TypeScript types. Every response from /api/v1 is validated against
 * these, in mock mode and in api mode, so the mock layer and the backend contract can never drift apart.
 * docs/API_CONTRACT.md documents them.
 */
import { z } from 'zod';

export const Num = z.number().nullable();

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
});
export type Kpi = z.infer<typeof KpiSchema>;

export const KpiSetSchema = z.object({
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
  id: z.string(),
  title: z.string().optional(),
  xType: z.enum(['time', 'category', 'value']),
  xUnit: z.string().optional(),
  xLog: z.boolean().optional(),
  axes: z.array(AxisSchema).min(1).max(2),
  series: z.array(SeriesSchema),
  /** horizontal background bands, e.g. drought classes behind an SPI chart */
  bands: z.array(z.object({ from: z.number(), to: z.number(), color: z.string(), label: z.string() })).optional(),
  refLines: z.array(z.object({ y: z.number(), label: z.string(), axis: z.number().optional(), color: z.string().optional() })).optional(),
  /** "Historical | Forecast" divider */
  asOf: z.string().optional(),
  note: z.string().optional(),
});
export type SeriesSet = z.infer<typeof SeriesSetSchema>;

// ------------------------------------------------------------------ Categories (bars, donuts, stacks, waterfalls)
export const CategorySetSchema = z.object({
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

export const EntityListSchema = z.object({ type: z.string(), total: z.number(), items: z.array(EntitySchema) });
export type EntityList = z.infer<typeof EntityListSchema>;

export const EntityDetailSchema = EntitySchema.extend({
  title: z.string(),
  status: z.object({ scale: z.string(), id: z.string(), label: z.string() }).optional(),
  fields: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.null()]), unit: z.string().optional(), scale: z.string().optional() })),
  image: z.enum(['dam', 'river', 'borehole', 'wwtw', 'wtp', 'settlement', 'station', 'aquifer', 'municipality']).optional(),
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

export const RefItemSchema = z.object({ id: z.string(), name: z.string(), parent: z.string().optional(), province: z.string().optional(), wma: z.string().optional() });
export type RefItem = z.infer<typeof RefItemSchema>;
export const RefListSchema = z.object({ type: z.string(), items: z.array(RefItemSchema) });
export type RefList = z.infer<typeof RefListSchema>;

// ------------------------------------------------------------------ Filters (query params)
export interface FilterParams {
  province?: string;
  wma?: string;
  catchment?: string;
  municipality?: string;
  entityId?: string;
  from?: string;
  to?: string;
  period?: string;
  compare?: string;
}
