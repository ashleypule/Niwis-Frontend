/**
 * Vegetation health classes: the spec (§5.3) names them Excellent / Good / Fair / Poor / Very Poor; the backend still
 * sends Very Healthy / Healthy / Moderate / Stressed / Very Stressed. Every response passes through here (API client),
 * so legends, pills, KPIs, tables and the cascade all show the spec names. Only values that are vegetation classes are
 * touched: KPIs and rows on the `vci` scale, `vci` class columns, and text columns / category lists made up entirely of
 * the legacy names (so a lone "Moderate" risk class elsewhere is left alone).
 */
import { LEGACY_VEG_CLASS } from '@/config/thresholds';

type Obj = Record<string, unknown>;

const map = (v: unknown) => (typeof v === 'string' && LEGACY_VEG_CLASS[v]) || v;
const isLegacy = (v: unknown) => typeof v === 'string' && v in LEGACY_VEG_CLASS;
/**
 * Every non-empty value is a legacy class name and, unless the context is known to be vegetation (a table with a `vci`
 * column), at least one is a name only vegetation uses.
 */
const allLegacy = (vs: unknown[], veg = false) => {
  const xs = vs.filter((v) => v != null && v !== '');
  return xs.length > 0 && xs.every(isLegacy) && (veg || xs.some((v) => /Healthy|Stressed/.test(String(v))));
};

export function normalizeVegClasses<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const d = data as Obj;
  // KPI sets
  if (Array.isArray(d.kpis)) {
    for (const k of d.kpis as Obj[]) {
      const st = k.status as Obj | undefined;
      if (st?.scale === 'vci') {
        st.id = map(st.id);
        st.label = map(st.label);
        k.text = map(k.text);
      }
    }
  }
  // tables (incl. the drought cascade)
  if (Array.isArray(d.columns) && Array.isArray(d.rows)) {
    const rows = d.rows as Obj[];
    const veg = (d.columns as Obj[]).some((c) => c.scale === 'vci');
    const cols = (d.columns as Obj[]).filter(
      (c) =>
        (c.type === 'class' && c.scale === 'vci') ||
        ((c.type === 'text' || c.type === 'class') &&
          allLegacy(
            rows.map((r) => r[c.key as string]),
            veg,
          )),
    );
    for (const r of rows) {
      for (const c of cols) r[c.key as string] = map(r[c.key as string]);
      if (r.scale === 'vci') {
        r.cls = map(r.cls);
        r.class = map(r.class);
      }
    }
  }
  // category sets (classification donut, by-province stacks)
  if (Array.isArray(d.categories) && Array.isArray(d.series)) {
    if (allLegacy(d.categories as unknown[])) d.categories = (d.categories as unknown[]).map(map);
    const series = d.series as Obj[];
    if (allLegacy(series.map((s) => s.name))) for (const s of series) s.name = map(s.name);
  }
  return data;
}
