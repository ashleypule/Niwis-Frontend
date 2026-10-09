/** Helpers for building API responses in mock handlers. */
import { APP } from '@/config/app';
import { metric } from '@/config/metrics';
import { round } from '@/lib/stats';
import { miToIso } from '@/lib/time';
import type { CategorySet, Column, Kpi, MapLayer, Series, SeriesSet, TableSet } from '@/types/api';
import type { ResolvedScope } from '../generators/scope';
import { END_MI } from '../generators/climate';

export interface Ctx {
  params: URLSearchParams;
  scope: ResolvedScope;
  /** last complete month */
  last: number;
  /** requested window (month indices, inclusive) */
  from: number;
  to: number;
  q: (k: string) => string | undefined;
}

export type Handler<T> = (ctx: Ctx) => T;

export interface ModuleHandlers {
  summary?: Handler<Kpi[]>;
  timeseries?: Record<string, Handler<SeriesSet>>;
  forecast?: Record<string, Handler<SeriesSet>>;
  breakdown?: Record<string, Handler<CategorySet>>;
  table?: Record<string, Handler<TableSet>>;
  matrix?: Record<string, Handler<import('@/types/api').MatrixSet>>;
  map?: Record<string, Handler<MapLayer>>;
  entities?: Handler<import('@/types/api').EntityList>;
  entity?: (ctx: Ctx, id: string) => import('@/types/api').EntityDetail;
}

const PERIOD_MONTHS: Record<string, number> = { latest: 12, '1M': 1, '3M': 3, '6M': 6, '12M': 12, '24M': 24, '5Y': 60, '10Y': 120, historical: 0 };

/** Window in months requested by a period preset (0 = whole record). */
export function periodMonths(params: URLSearchParams, fallback = 12): number {
  const p = params.get('period');
  if (!p || !(p in PERIOD_MONTHS)) return fallback;
  return PERIOD_MONTHS[p];
}

export const asOfIso = () => APP.asOf.toISOString();
export const LAST_MONTH = END_MI - 1;

// ------------------------------------------------------------------ KPIs
export interface KpiOpts {
  label?: string;
  sublabel?: string;
  unit?: string;
  decimals?: number;
  delta?: number | null;
  deltaUnit?: string;
  deltaLabel?: string;
  spark?: number[];
  status?: { scale: string; id: string; label: string };
  text?: string;
  goodDirection?: 'up' | 'down' | 'neutral';
}

export function kpi(id: string, metricId: string, value: number | null, o: KpiOpts = {}): Kpi {
  const md = metric(metricId);
  const decimals = o.decimals ?? md.decimals;
  return {
    id,
    metric: metricId,
    label: o.label ?? md.label,
    sublabel: o.sublabel,
    value: value == null ? null : round(value, decimals),
    unit: o.unit ?? md.unit,
    decimals,
    delta: o.delta == null ? o.delta : round(o.delta, Math.max(1, decimals)),
    deltaUnit: o.deltaUnit,
    deltaLabel: o.deltaLabel,
    spark: o.spark?.map((v) => round(v, 3)),
    status: o.status,
    text: o.text,
    goodDirection: o.goodDirection,
  };
}

// ------------------------------------------------------------------ series
export type Point = [string | number, number | null];

export function line(key: string, name: string, data: Point[], o: Partial<Series> = {}): Series {
  return { key, name, kind: 'line', data: data.map(([x, y]) => [x, y == null || Number.isNaN(y) ? null : round(y, 3)]), ...o };
}
export function bar(key: string, name: string, data: Point[], o: Partial<Series> = {}): Series {
  return line(key, name, data, { kind: 'bar', ...o });
}
export function area(key: string, name: string, data: Point[], o: Partial<Series> = {}): Series {
  return line(key, name, data, { kind: 'area', ...o });
}
export function band(key: string, name: string, data: [string | number, number | null, number | null][], o: Partial<Series> = {}): Series {
  return {
    key,
    name,
    kind: 'band',
    data: data.map(([x, a, b]) => [x, a == null ? null : round(a, 3), b == null ? null : round(b, 3)]),
    ...o,
  };
}

/** Build monthly points for month indices [from, to]. */
export function monthly(from: number, to: number, fn: (mi: number) => number | null): Point[] {
  const out: Point[] = [];
  for (let mi = from; mi <= to; mi++) out.push([miToIso(mi), fn(mi)]);
  return out;
}

export function seriesSet(id: string, axes: SeriesSet['axes'], series: Series[], extra: Partial<SeriesSet> = {}): SeriesSet {
  return { id, xType: 'time', axes, series, ...extra };
}

// ------------------------------------------------------------------ categories & tables
export function categories(id: string, unit: string, cats: string[], series: CategorySet['series'], extra: Partial<CategorySet> = {}): CategorySet {
  return { id, unit, categories: cats, series: series.map((s) => ({ ...s, values: s.values.map((v) => (v == null ? null : round(v, 3))) })), ...extra };
}

export function table(id: string, columns: Column[], rows: Record<string, string | number | null>[], extra: Partial<TableSet> = {}): TableSet {
  return { id, columns, rows, ...extra };
}

export const col = {
  rank: (): Column => ({ key: 'rank', label: '#', type: 'rank', align: 'center' }),
  text: (key: string, label: string): Column => ({ key, label, type: 'text' }),
  num: (key: string, label: string, unit?: string, decimals = 0, extra: Partial<Column> = {}): Column => ({ key, label, type: 'number', unit, decimals, align: 'right', ...extra }),
  cls: (key: string, label: string, scale: string): Column => ({ key, label, type: 'class', scale, align: 'center' }),
  trend: (key: string, label = 'Trend', goodDirection: 'up' | 'down' | 'neutral' = 'up', unit?: string, decimals = 1): Column => ({ key, label, type: 'trend', goodDirection, unit, decimals, align: 'right' }),
  delta: (key: string, label: string, goodDirection: 'up' | 'down' | 'neutral' = 'up', unit?: string, decimals = 1): Column => ({ key, label, type: 'delta', goodDirection, unit, decimals, align: 'right' }),
  bar: (key: string, label: string, unit?: string, scale?: string): Column => ({ key, label, type: 'bar', unit, scale }),
  date: (key: string, label = 'Date'): Column => ({ key, label, type: 'date' }),
};

export const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
