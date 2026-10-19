/**
 * Database category charts (docs/backend/FRONTEND_INTEGRATION.md §8): category = database table, variable = column.
 * Labels, units, groups and order come from the backend catalogue and are shown as sent; this module only decides how
 * each column is drawn, which axis it goes on, and what the user has switched on.
 */
import type { CategoryGroup, CategoryTable, CategoryVariable, Series, SeriesSet } from '@/types/api';
import { DROUGHT_CLASSES } from '@/config/thresholds';
import { getScale } from '@/config/palettes';

/**
 * The frontend's inference, used when the backend recommends no chart type: totals as bars, anomalies as bars around 0,
 * SPI / SPEI over the D0–D4 bands (always, whatever the chart type), min / max pairs as a band.
 */
export type VariableKind = 'total' | 'anomaly' | 'spi' | 'range' | 'state';

/** Amounts accumulated over a period (a bar's length is the amount). */
const AMOUNT_UNITS = new Set([
  'mm',
  'mm/season',
  'mm/month',
  'mm/dekad',
  'days',
  'days/month',
  'Mm³',
  'Mm³/month',
  'm³/day',
  'm³/year',
  '°C·days',
]);
/** Amount units, but the column is a level, rate or mean rather than a total. */
const NOT_A_TOTAL = /\b(mean|average|intensity|map|sdii|storage|evapo|et₀|et0|pet|aet|actual et|deficit|cwr)\b/i;

export function variableKind(v: Pick<CategoryVariable, 'label' | 'name' | 'unit' | 'column'>): VariableKind {
  const name = v.name ?? v.label;
  if (/anomal/i.test(name)) return 'anomaly';
  if (/^(SPI|SPEI)\b/i.test(name)) return 'spi';
  const unit = v.unit ?? '';
  if (AMOUNT_UNITS.has(unit) && !NOT_A_TOTAL.test(name)) return 'total';
  if (unit === 'mm/day' && /rain|precip/i.test(name)) return 'total';
  return 'state';
}

/** The backend's chart types (FRONTEND_INTEGRATION §8 "Recommended chart type"). */
export type ChartType = 'bar' | 'diverging-bar' | 'line';
const CHART_TYPES: readonly string[] = ['bar', 'diverging-bar', 'line'];

/**
 * How a column is drawn: the backend's recommendation (the catalogue variable's `chart`, else its series'), and only
 * when there is none the frontend's inference from the column's name and unit (variableKind).
 */
export function chartTypeOf(
  v: Pick<CategoryVariable, 'label' | 'name' | 'unit' | 'column' | 'chart'>,
  s?: Pick<Series, 'chart'>,
): ChartType {
  const rec = v.chart ?? s?.chart;
  if (rec && CHART_TYPES.includes(rec)) return rec as ChartType;
  const kind = variableKind(v);
  return kind === 'total' ? 'bar' : kind === 'anomaly' ? 'diverging-bar' : 'line';
}

/** The group's columns in catalogue order, with their catalogue entries. */
export function groupVariables(table: CategoryTable, group: CategoryGroup): CategoryVariable[] {
  return group.columns
    .map((c) => table.variables.find((v) => v.column === c))
    .filter((v): v is CategoryVariable => !!v);
}

export const isAvailable = (v: CategoryVariable) => v.status === 'live';

/** Unit of a column for axis purposes ('' = no unit). */
export function unitOf(v: CategoryVariable, group?: CategoryGroup): string {
  const u = v.unit ?? group?.unit ?? '';
  return u === '—' || u === '-' ? '' : u;
}

/** "Daily Rainfall (mm/day)" stays; "SPEI 1" + index → "SPEI 1 (index)" (CSV headers always carry the unit). */
export function labelWithUnit(v: CategoryVariable, group?: CategoryGroup): string {
  const u = unitOf(v, group);
  return !u || v.label.endsWith(`(${u})`) ? v.label : `${v.label} (${u})`;
}

/** Duplicate columns, each placed under the chart holding the column it duplicates (else under the table). */
export function duplicatesFor(table: CategoryTable, group?: CategoryGroup): CategoryVariable[] {
  const dups = table.variables.filter((v) => v.status === 'duplicate');
  const inGroup = (v: CategoryVariable, g: CategoryGroup) => {
    const target = v.duplicateOf ?? '';
    return target.startsWith(`${table.table}.`) && g.columns.includes(target.slice(table.table.length + 1));
  };
  if (group) return dups.filter((v) => inGroup(v, group));
  return dups.filter((v) => !table.groups.some((g) => inGroup(v, g)));
}

// ------------------------------------------------------------------ axes
export interface AxisPlan {
  /** units of the drawn axes, in order (at most two) */
  units: string[];
  /** columns that cannot be switched on: column → reason */
  blocked: Map<string, string>;
}

/**
 * One axis per unit, never two units on one axis, never a third axis. A column whose unit would need a third axis is
 * blocked with "Different unit — hide X to compare". (The backend's groups have one unit each, so this guards the rule
 * rather than being a common case.)
 */
export function axisPlan(vars: CategoryVariable[], visible: string[], group?: CategoryGroup): AxisPlan {
  const units: string[] = [];
  for (const v of vars) {
    if (!visible.includes(v.column) || !isAvailable(v)) continue;
    const u = unitOf(v, group);
    if (!units.includes(u) && units.length < 2) units.push(u);
  }
  const blocked = new Map<string, string>();
  // selected or not: a column on a third unit is not drawn (a hand-edited link can select one)
  for (const v of vars) {
    if (!isAvailable(v)) continue;
    const u = unitOf(v, group);
    if (units.length >= 2 && !units.includes(u)) {
      const onLast = vars
        .filter((o) => visible.includes(o.column) && unitOf(o, group) === units[1])
        .map((o) => o.label);
      blocked.set(v.column, `Different unit — hide ${onLast.join(', ')} to compare`);
    }
  }
  return { units, blocked };
}

// ------------------------------------------------------------------ selection (shared through the URL)
/** URL parameter of a chart's selection, e.g. `drought.rainfall-derived-drought-indices.spi-rai-index`. */
export const selectionParam = (module: string, tableId: string, groupId: string) => `${module}.${tableId}.${groupId}`;

/** Selected columns: the URL's list (unknown and unavailable columns dropped), else the group's defaults. */
export function parseSelection(raw: string | null, group: CategoryGroup, vars: CategoryVariable[]): string[] {
  const ok = (c: string) => vars.some((v) => v.column === c && isAvailable(v));
  if (raw == null) return group.defaultVisible.filter(ok);
  return raw.split(',').filter((c, i, a) => c && ok(c) && a.indexOf(c) === i);
}

/** URL value for a selection; null when it equals the defaults (the parameter is then removed). */
export function serializeSelection(cols: string[], group: CategoryGroup, vars: CategoryVariable[]): string | null {
  const defaults = parseSelection(null, group, vars);
  const same = cols.length === defaults.length && cols.every((c) => defaults.includes(c));
  if (same) return null;
  // keep catalogue order so equal selections give equal links
  return group.columns.filter((c) => cols.includes(c)).join(',');
}

// ------------------------------------------------------------------ series
export interface CategoryChartData {
  set: SeriesSet;
  /** anomaly series: drawn as bars coloured by sign */
  diverging: { key: string; warmIsPositive: boolean }[];
  /** label format of the x axis and the tooltip */
  xFormat: 'year' | 'month';
  tooltipFormat: 'year' | 'month' | 'day';
}

/** D0–D4 background bands for SPI / SPEI (thresholds.ts, colours of the drought scale). */
export function spiBands(): NonNullable<SeriesSet['bands']> {
  const scale = getScale('drought');
  // contiguous bands: each class runs from the next class's upper bound up to its own (D4 down to −3.5)
  return DROUGHT_CLASSES.map((c, i) => ({
    from: DROUGHT_CLASSES[i + 1]?.spiMax ?? -3.5,
    to: c.spiMax,
    color: scale.bins[i + 1]?.color ?? '#ccc',
    label: c.id,
  }));
}

/**
 * Min / max pairs drawn as a band: the backend's `band` (group or response), else, when the backend recommends nothing
 * for the group, pairs inferred from the names (Tmin / Tmax). Both columns must be switched on.
 */
function bandPairs(
  group: CategoryGroup,
  set: SeriesSet,
  shown: CategoryVariable[],
): [CategoryVariable, CategoryVariable][] {
  const band = group.band ?? set.band;
  if (band?.length === 2) {
    const lo = shown.find((v) => v.column === band[0]);
    const hi = shown.find((v) => v.column === band[1]);
    return lo && hi ? [[lo, hi]] : [];
  }
  return (group.chart ?? set.chart) ? [] : minMaxPairs(shown);
}

function minMaxPairs(vars: CategoryVariable[]): [CategoryVariable, CategoryVariable][] {
  const pairs: [CategoryVariable, CategoryVariable][] = [];
  for (const lo of vars) {
    const name = lo.name ?? lo.label;
    if (!/min/i.test(name)) continue;
    const want = name.replace(/min/i, (m) => (m === 'MIN' ? 'MAX' : m === 'Min' ? 'Max' : 'max'));
    const hi = vars.find((v) => (v.name ?? v.label) === want && unitOf(v) === unitOf(lo));
    if (hi) pairs.push([lo, hi]);
  }
  return pairs;
}

const isMonthStart = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-01/.test(x);

/**
 * The visible columns of a category response as a SeriesSet for seriesOption: one axis per unit, chart type per
 * column (chartTypeOf: the backend's recommendation, else the inference), a band for the min / max pair, D0–D4 bands
 * behind SPI / SPEI.
 */
export function categoryChartData(
  set: SeriesSet,
  table: CategoryTable,
  group: CategoryGroup,
  visible: string[],
): CategoryChartData {
  const vars = groupVariables(table, group);
  const plan = axisPlan(vars, visible, group);
  const shown = vars.filter((v) => visible.includes(v.column) && isAvailable(v) && !plan.blocked.has(v.column));
  const byKey = new Map(set.series.map((s) => [s.key, s]));
  const pairs = bandPairs(group, set, shown);
  const inPair = new Set(pairs.flatMap(([a, b]) => [a.column, b.column]));
  const series: Series[] = [];
  const diverging: CategoryChartData['diverging'] = [];
  const axisOf = (v: CategoryVariable) => Math.max(0, plan.units.indexOf(unitOf(v, group)));

  for (const [lo, hi] of pairs) {
    const a = byKey.get(lo.column);
    const b = byKey.get(hi.column);
    if (!a || !b) continue;
    const highs = new Map(b.data.map((p) => [String(p[0]), p[1]]));
    series.push({
      key: `${lo.column}__${hi.column}`,
      name: `${lo.label} – ${hi.label}`,
      kind: 'band',
      axis: axisOf(lo),
      color: a.color,
      data: a.data.map((p) => [p[0], p[1], highs.get(String(p[0])) ?? null]),
    });
  }
  for (const v of shown) {
    if (inPair.has(v.column)) continue;
    const s = byKey.get(v.column);
    if (!s) continue;
    const type = chartTypeOf(v, s);
    if (type === 'diverging-bar')
      diverging.push({ key: s.key, warmIsPositive: /temp|°C/i.test(`${v.label} ${v.unit ?? ''}`) });
    series.push({ ...s, kind: type === 'line' ? 'line' : 'bar', axis: axisOf(v), stack: undefined });
  }
  const spi = shown.some((v) => variableKind(v) === 'spi');
  // every axis names its unit; a column without one says so
  const axes = (plan.units.length ? plan.units : [unitOf(vars[0] ?? ({} as CategoryVariable), group)]).map((u) => ({
    unit: u || (group.unit && group.unit !== '—' && group.unit !== '-' ? group.unit : 'no unit'),
  }));
  const res = group.resolution ?? table.resolution;
  const xs = series.flatMap((s) => s.data.map((p) => p[0]));
  // daily groups longer than 2 000 points come back as monthly means
  const monthly = res === 'monthly' || (res === 'daily' && xs.length > 0 && xs.every(isMonthStart));
  return {
    set: {
      ...set,
      axes,
      series,
      bands:
        spi &&
        plan.units[0] ===
          unitOf(
            shown.find((v) => variableKind(v) === 'spi')!,
            group,
          )
          ? spiBands()
          : undefined,
      refLines: undefined,
    },
    diverging,
    xFormat: res === 'annual' ? 'year' : 'month',
    tooltipFormat: res === 'annual' ? 'year' : monthly ? 'month' : 'day',
  };
}

/** CSV / data-table rows: the visible columns only, units in the headers. */
export function categoryRows(
  set: SeriesSet,
  table: CategoryTable,
  group: CategoryGroup,
  visible: string[],
): Record<string, string | number | null>[] {
  const vars = groupVariables(table, group).filter((v) => visible.includes(v.column) && isAvailable(v));
  const rows = new Map<string, Record<string, string | number | null>>();
  for (const v of vars) {
    const s = set.series.find((x) => x.key === v.column);
    if (!s) continue;
    const head = labelWithUnit(v, group);
    for (const p of s.data) {
      const x = String(p[0]);
      const r = rows.get(x) ?? { date: x };
      r[head] = p[1] as number | null;
      rows.set(x, r);
    }
  }
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Tooltip of a chip: source column, period, note, unit override, and the reason when it is withheld. */
export function chipTooltip(v: CategoryVariable, extra?: string): string {
  const monthYear = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return d.toLocaleString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const lines = [
    extra,
    v.status === 'withheld' ? `${v.label}: ${v.reason ?? 'withheld'} — withheld` : undefined,
    v.source ? `Source: ${v.source}` : undefined,
    v.asOf
      ? `Data to ${monthYear(v.periodEnd ?? v.asOf)}${v.isStale ? ' (not updated for more than 90 days)' : ''}`
      : undefined,
    v.note,
    v.unitOverride ? `Unit: ${v.unitOverride}` : undefined,
  ];
  return lines.filter(Boolean).join('\n');
}

/** "Drought: 4 tables · 50 columns · 24 live · 14 withheld · 16 duplicates" */
export function coverageCounts(tables: CategoryTable[]) {
  const vars = tables.flatMap((t) => t.variables);
  const count = (s: string) => vars.filter((v) => v.status === s).length;
  return {
    tables: tables.length,
    columns: vars.length,
    live: count('live'),
    withheld: count('withheld'),
    duplicate: count('duplicate'),
  };
}

/**
 * Summary-panel series that plot one stored column (they carry `source: ["table.column"]`, CONTRACT_CHANGES §13.4):
 * legend = the column's catalogue label, provided the column's unit is the unit on the series' axis (a derived total
 * of a daily rate keeps the backend's name). An axis is relabelled only when every series on it is such a column with
 * the same unit. Derived series (no `source`) keep their names.
 */
export function applyColumnLabels(set: SeriesSet, lookup: Map<string, CategoryVariable>): SeriesSet {
  if (!lookup.size || !set.series.some((s) => s.source?.length === 1)) return set;
  const noUnit = (u?: string) => !u || u === '—' || u === '-' || u === 'index';
  const varOf = (s: Series) => {
    const v = s.source?.length === 1 ? lookup.get(s.source[0]) : undefined;
    const axisUnit = set.axes[s.axis ?? 0]?.unit;
    return v && (v.unit === axisUnit || (noUnit(v.unit) && noUnit(axisUnit))) ? v : undefined;
  };
  const series = set.series.map((s) => {
    const v = varOf(s);
    return v ? { ...s, name: v.label } : s;
  });
  const axes = set.axes.map((a, i) => {
    const on = set.series.filter((s) => (s.axis ?? 0) === i && s.kind !== 'band');
    const vs = on.map(varOf);
    if (!on.length || vs.some((v) => !v)) return a;
    const units = new Set(vs.map((v) => v!.unit ?? ''));
    if (units.size !== 1) return a;
    const u = [...units][0];
    return { ...a, label: undefined, unit: u || 'index' };
  });
  return { ...set, series, axes };
}

/** Catalogue variables by source (`table.column`). */
export function variablesBySource(tables: CategoryTable[] | undefined): Map<string, CategoryVariable> {
  const m = new Map<string, CategoryVariable>();
  for (const t of tables ?? []) for (const v of t.variables) m.set(v.source ?? `${t.table}.${v.column}`, v);
  return m;
}
