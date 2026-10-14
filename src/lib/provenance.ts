/**
 * Helpers for the backend's "value is null, here is why" convention (docs/backend/CONTRACT_CHANGES.md §3).
 */
import type { CategorySet, SeriesSet, TableSet, Unavailable } from '@/types/api';

export interface MissingItem {
  name: string;
  reason: string;
}

/** Reason for a null field: the `unavailable` entry whose field ends with the key (e.g. "series.borehole", "rows.stations"). */
export function reasonFor(list: Unavailable[] | undefined, ...keys: (string | undefined)[]): string | undefined {
  if (!list?.length) return undefined;
  const ks = keys.filter(Boolean).map((k) => k!.toLowerCase());
  const hit = list.find((u) => {
    const f = u.field.toLowerCase();
    return ks.some((k) => f === k || f.endsWith(`.${k}`) || f.endsWith(`[${k}]`));
  });
  return hit?.reason;
}

const allNull = (rows: unknown[][], from: number) => rows.every((p) => p.slice(from).every((v) => v == null));

/**
 * Series that are entirely null are hidden from the chart and listed under it instead
 * ("Not available: Pan evaporation (withheld …)").
 */
export function splitNullSeries(set: SeriesSet): { set: SeriesSet; missing: MissingItem[] } {
  const missing: MissingItem[] = [];
  const hasData = (s: SeriesSet['series'][number]) => s.data.length > 0 && !allNull(s.data, 1);
  const series = set.series.filter((s) => {
    const reason = reasonFor(set.unavailable, s.key, s.name);
    // the backend says this series is unavailable: never plot it, even if values came back (BACKEND_ISSUES #6)
    if (reason) {
      missing.push({ name: s.name, reason });
      return false;
    }
    if (s.data.length === 0 || !allNull(s.data, 1)) return true;
    // the empty half of a split bar (e.g. "Negative anomaly" when every month was positive) is not missing data
    if (!reason && s.stack && set.series.some((o) => o !== s && o.stack === s.stack && hasData(o))) return true;
    missing.push({ name: s.name, reason: reason ?? fallback(set.unavailable) });
    return false;
  });
  return missing.length ? { set: { ...set, series }, missing } : { set, missing };
}

export function splitNullCategories(set: CategorySet): { set: CategorySet; missing: MissingItem[] } {
  const missing: MissingItem[] = [];
  const series = set.series.filter((s) => {
    const reason = reasonFor(set.unavailable, s.key, s.name);
    const empty = s.values.length > 0 && s.values.every((v) => v == null);
    if (reason || empty) missing.push({ name: s.name, reason: reason ?? fallback(set.unavailable) });
    return !reason && !empty;
  });
  return missing.length ? { set: { ...set, series }, missing } : { set, missing };
}

/** Table fields listed in `unavailable`, named by their column (or row) label. */
export function tableMissing(t: TableSet): MissingItem[] {
  return (t.unavailable ?? []).map((u) => {
    const key = u.field.replace(/^rows?\./, '').replace(/^columns?\./, '');
    const col = t.columns.find((c) => c.key === key);
    const row = t.rowKey ? t.rows.find((r) => String(r[t.rowKey!]) === key) : undefined;
    const rowName = row ? String(row.stage ?? row.name ?? row.label ?? key) : undefined;
    return { name: col?.label ?? rowName ?? key, reason: u.reason };
  });
}

function fallback(list: Unavailable[] | undefined): string {
  return list?.length === 1 ? list[0].reason : 'no values in the database for this selection';
}
