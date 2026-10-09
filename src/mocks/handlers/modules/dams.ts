/** Dam & Reservoir Status (spec §8). Every number comes from damNow()/simulateDam() — one source per fact. */
import { STORAGE_ALERTS, storageBand } from '@/config/thresholds';
import { SCALES } from '@/config/palettes';
import { MONTH_NAMES, formatNumber } from '@/lib/format';
import { Rng } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { DAY_MS, dayToIso, miMonth, miToIso, miYear, monthIndex } from '@/lib/time';
import { APP } from '@/config/app';
import { PROVINCE_ORDER, WMAS, provinceName, wmaName } from '../../reference/regions';
import { DAMS, DAM_START, aggregateFlows, aggregatePctAt, aggregateStorage, damById, damNow, damStorageOnDay, damT, simulateDam, type Dam } from '../../generators/dams';
import { END_MI } from '../../generators/climate';
import { dampedForecast, forecastSeries } from '../../generators/forecast';
import type { ResolvedScope } from '../../generators/scope';
import { area, band, bar, categories, col, kpi, line, monthly, seriesSet, table, type Ctx, type ModuleHandlers } from '../build';
import { pointsLayer, spark } from '../common';

export function damsIn(scope: ResolvedScope): Dam[] {
  return DAMS.filter((d) => (scope.level === 'national' ? true : scope.includes(d)));
}
const provLabel = (d: Dam) => (d.province === 'LS' ? 'Lesotho (LHWP)' : provinceName(d.province));

function pickDam(ctx: Ctx): Dam {
  const id = ctx.q('entityId');
  if (id && damById.has(id)) return damById.get(id)!;
  const list = damsIn(ctx.scope);
  return [...(list.length ? list : DAMS)].sort((a, b) => b.capacity - a.capacity)[0];
}

/** Long-term (1991–2020) mean % FSC per calendar month for a set of dams. */
function ltPct(dams: Dam[], month0: number): number {
  return mean(Array.from({ length: 30 }, (_, k) => aggregatePctAt(dams, monthIndex(1991 + k, month0))));
}
function envPct(dams: Dam[], month0: number): [number, number] {
  const v = Array.from({ length: 30 }, (_, k) => aggregatePctAt(dams, monthIndex(1991 + k, month0)));
  return [Math.min(...v), Math.max(...v)];
}

const fmtInt = (n: number) => formatNumber(n, 0);

function damForecast(d: Dam, horizon: number) {
  const now = damNow(d.id);
  const lt = (mi: number) => mean(Array.from({ length: 30 }, (_, k) => simulateDam(d.id).storage[damT(monthIndex(1991 + k, miMonth(mi)))] / d.capacity)) * 100;
  return dampedForecast(`dam-${d.id}`, now.pct, { mu: lt(END_MI), phi: 0.9, sigma: 14, horizon, startMi: END_MI - 1, min: 0, max: 100, seasonal: (mi) => (lt(mi) - lt(END_MI)) * 0.6 });
}

export const dams: ModuleHandlers = {
  summary: (ctx) => {
    const list = damsIn(ctx.scope);
    const agg = aggregateStorage(list);
    const L = ctx.last;
    const flows = aggregateFlows(list, END_MI);
    const prevFlows = aggregateFlows(list, END_MI - 1);
    const below = list.filter((d) => damNow(d.id).pct < 25).length;
    const above = list.filter((d) => damNow(d.id).pct >= 90).length;
    const alerts = list.filter((d) => ['Warning', 'Critical'].includes(damNow(d.id).status)).length;
    const lastMonthPct = aggregatePctAt(list, L);
    const ly = list.reduce((s, d) => s + damNow(d.id).lastYearPct * d.capacity, 0) / agg.capacity;
    return [
      kpi('storage', 'storagePct', agg.pct, { label: 'Total Storage', sublabel: `${list.length} major dams, % FSC`, delta: agg.pct - lastMonthPct, deltaLabel: 'vs last month', spark: spark((mi) => aggregatePctAt(list, mi), L, 18) }),
      kpi('volume', 'storageVolume', agg.volume, { label: 'Current Volume', sublabel: `of ${fmtInt(agg.capacity)} Mm³ capacity`, delta: agg.pct - ly, deltaUnit: ' pp', deltaLabel: 'vs last year', spark: spark((mi) => (aggregatePctAt(list, mi) * agg.capacity) / 100, L, 18) }),
      kpi('inflow', 'inflow', flows.inflow, { label: 'Total Inflow', sublabel: 'Current month', delta: ((flows.inflow - prevFlows.inflow) / Math.max(1, prevFlows.inflow)) * 100, deltaUnit: '%', deltaLabel: 'vs previous month', spark: spark((mi) => aggregateFlows(list, mi).inflow, END_MI, 18) }),
      kpi('outflow', 'outflow', flows.outflow, { label: 'Total Outflow', sublabel: 'Releases + spills, month', delta: ((flows.outflow - prevFlows.outflow) / Math.max(1, prevFlows.outflow)) * 100, deltaUnit: '%', deltaLabel: 'vs previous month', spark: spark((mi) => aggregateFlows(list, mi).outflow, END_MI, 18) }),
      kpi('evap', 'evaporationLoss', flows.evap, { label: 'Evaporation Loss', sublabel: 'Current month', delta: ((flows.evap - prevFlows.evap) / Math.max(1, prevFlows.evap)) * 100, deltaUnit: '%', deltaLabel: 'vs previous month', spark: spark((mi) => aggregateFlows(list, mi).evap, END_MI, 18) }),
      kpi('below', 'damsBelow', below, { label: 'Dams Below 25%', sublabel: `of ${list.length} major dams`, delta: below - list.filter((d) => (simulateDam(d.id).storage[damT(L - 1)] / d.capacity) * 100 < 25).length, deltaUnit: '', deltaLabel: 'vs last month' }),
      kpi('above', 'damsAbove', above, { label: 'Dams Above 90%', sublabel: `of ${list.length} major dams`, delta: above - list.filter((d) => (simulateDam(d.id).storage[damT(L - 1)] / d.capacity) * 100 >= 90).length, deltaUnit: '', deltaLabel: 'vs last month' }),
      kpi('alerts', 'damAlerts', alerts, { label: 'Operational Alerts', sublabel: 'Warning or critical', deltaLabel: `L1 < ${STORAGE_ALERTS.L1}% · L2 < ${STORAGE_ALERTS.L2}% · L3 < ${STORAGE_ALERTS.L3}%` }),
    ];
  },

  timeseries: {
    'storage-trend': (ctx) => {
      const list = damsIn(ctx.scope);
      const from = Math.min(ctx.from, ctx.to - 17);
      const env = Array.from({ length: 12 }, (_, m) => envPct(list, m));
      return seriesSet(
        'storage-trend',
        [{ unit: '%', label: 'Storage (% FSC)', min: 0, max: 100 }],
        [
          band('range', 'Min–max range (1991–2020)', monthly(from, ctx.to, () => 0).map(([x], j) => [x, env[miMonth(from + j)][0], env[miMonth(from + j)][1]]), { color: '#90CAF9' }),
          area('current', 'Current', monthly(from, ctx.to, (mi) => aggregatePctAt(list, mi)), { color: '#1565C0', symbol: true }),
          line('prev', 'Previous year', monthly(from, ctx.to, (mi) => aggregatePctAt(list, mi - 12)), { color: '#E53935' }),
          line('lt', 'Long-term mean', monthly(from, ctx.to, (mi) => ltPct(list, miMonth(mi))), { color: '#13233A', dash: true }),
        ],
        { note: `${list.length} dams · Σ volume / Σ capacity` },
      );
    },
    flows: (ctx) => {
      const list = damsIn(ctx.scope);
      const from = Math.min(ctx.from, ctx.to - 11);
      return seriesSet('flows', [{ unit: 'Mm³', label: 'Monthly volume' }], [
        bar('in', 'Inflow', monthly(from, ctx.to, (mi) => aggregateFlows(list, mi).inflow), { color: '#1E88E5' }),
        bar('out', 'Outflow', monthly(from, ctx.to, (mi) => aggregateFlows(list, mi).outflow), { color: '#FB8C00' }),
        line('evap', 'Evaporation', monthly(from, ctx.to, (mi) => aggregateFlows(list, mi).evap), { color: '#8E24AA', dash: true }),
      ]);
    },
    'cumulative-inflow': (ctx) => {
      const list = damsIn(ctx.scope);
      const y = miYear(ctx.last);
      const cum = (year: number) => {
        let acc = 0;
        return Array.from({ length: 12 }, (_, m) => {
          const mi = monthIndex(year, m);
          if (mi > ctx.last) return [MONTH_NAMES[m], null] as [string, number | null];
          acc += aggregateFlows(list, mi).inflow;
          return [MONTH_NAMES[m], acc] as [string, number | null];
        });
      };
      const lt = Array.from({ length: 12 }, (_, m) => mean(Array.from({ length: 30 }, (__, k) => Array.from({ length: m + 1 }, (___, j) => aggregateFlows(list, monthIndex(1991 + k, j)).inflow).reduce((a, b) => a + b, 0))));
      return {
        id: 'cumulative-inflow',
        xType: 'category',
        axes: [{ unit: 'Mm³', label: 'Cumulative inflow' }],
        series: [
          line('cur', String(y), cum(y), { color: '#1565C0', symbol: true }),
          line('prev', String(y - 1), cum(y - 1), { color: '#E53935', symbol: true }),
          line('lt', 'Long-term average', lt.map((v, m) => [MONTH_NAMES[m], v]), { color: '#13233A', dash: true }),
        ],
      };
    },
    'dam-storage': (ctx) => {
      const d = pickDam(ctx);
      const days = Math.max(365, Math.min(5 * 365, (ctx.to - ctx.from + 1) * 30.4));
      const end = APP.asOf.getTime();
      const pts: [string, number][] = [];
      const vol: [string, number][] = [];
      const step = days > 800 ? 3 : 1;
      for (let t = end - days * DAY_MS; t <= end; t += step * DAY_MS) {
        const v = damStorageOnDay(d.id, t);
        const iso = dayToIso(Math.floor(t / DAY_MS));
        pts.push([iso, round((v / d.capacity) * 100, 1)]);
        vol.push([iso, round(v, 1)]);
      }
      const lt = pts.map(([x]) => [x, mean(Array.from({ length: 30 }, (_, k) => simulateDam(d.id).storage[damT(monthIndex(1991 + k, Number(x.slice(5, 7)) - 1))] / d.capacity)) * 100] as [string, number]);
      return seriesSet(
        'dam-storage',
        [{ unit: '%', label: 'Storage (% FSC)', min: 0, max: 100 }, { unit: 'Mm³', label: 'Volume', min: 0 }],
        [area('pct', '% FSC', pts, { color: '#1565C0' }), line('vol', 'Volume', vol, { axis: 1, color: '#E53935' }), line('lt', 'Long-term mean', lt, { color: '#2E9E5B', dash: true })],
        { note: `${d.name} Dam · ${d.river} River` },
      );
    },
    'dam-flows': (ctx) => {
      const d = pickDam(ctx);
      const s = simulateDam(d.id);
      const from = Math.max(DAM_START, Math.min(ctx.from, ctx.to - 23));
      const cumecs = (mm3: number, mi: number) => (mm3 * 1e6) / (new Date(Date.UTC(miYear(mi), miMonth(mi) + 1, 0)).getUTCDate() * 86400);
      return seriesSet('dam-flows', [{ unit: 'm³/s', label: 'Flow' }], [
        bar('in', 'Inflow', monthly(from, ctx.to, (mi) => cumecs(s.inflow[damT(mi)], mi)), { color: '#1E88E5' }),
        bar('out', 'Outflow', monthly(from, ctx.to, (mi) => cumecs(s.release[damT(mi)] + s.spill[damT(mi)], mi)), { color: '#FB8C00' }),
        line('net', 'Net flow', monthly(from, ctx.to, (mi) => cumecs(s.inflow[damT(mi)] - s.release[damT(mi)] - s.spill[damT(mi)] - s.evap[damT(mi)], mi)), { color: '#13233A' }),
      ], { note: `${d.name} Dam` });
    },
    'dam-monthly': (ctx) => {
      const d = pickDam(ctx);
      const s = simulateDam(d.id);
      const y = miYear(ctx.last);
      const yr = (year: number) => MONTH_NAMES.map((name, m) => {
        const mi = monthIndex(year, m);
        return [name, mi > END_MI ? null : round((s.storage[damT(mi)] / d.capacity) * 100, 1)] as [string, number | null];
      });
      return {
        id: 'dam-monthly',
        xType: 'category',
        axes: [{ unit: '%', label: 'Storage (% FSC)', min: 0, max: 100 }],
        series: [
          bar('y0', String(y), yr(y), { color: '#1565C0' }),
          bar('y1', String(y - 1), yr(y - 1), { color: '#FB8C00' }),
          bar('y2', String(y - 2), yr(y - 2), { color: '#2E9E5B' }),
          line('lt', 'Long-term mean', MONTH_NAMES.map((n, m) => [n, mean(Array.from({ length: 30 }, (_, k) => s.storage[damT(monthIndex(1991 + k, m))] / d.capacity)) * 100]), { color: '#13233A', dash: true }),
        ],
        note: `${d.name} Dam`,
      };
    },
    'rule-curve': (ctx) => {
      const d = pickDam(ctx);
      const s = simulateDam(d.id);
      const y = miYear(ctx.last);
      const r = new Rng(`rule-${d.id}`);
      const lo = r.range(25, 40);
      const hi = r.range(80, 95);
      const curve = (base: number, amp: number) => MONTH_NAMES.map((n, m) => [n, round(base + amp * Math.cos(((m - 3) / 12) * 2 * Math.PI), 1)] as [string, number]);
      const yr = (year: number) => MONTH_NAMES.map((n, m) => [n, monthIndex(year, m) > END_MI ? null : round((s.storage[damT(monthIndex(year, m))] / d.capacity) * 100, 1)] as [string, number | null]);
      return {
        id: 'rule-curve',
        xType: 'category',
        axes: [{ unit: '%', label: 'Storage (% FSC)', min: 0, max: 100 }],
        series: [
          line('min', 'Rule curve (minimum)', curve(lo, 6), { color: '#E53935', dash: true }),
          line('max', 'Rule curve (maximum)', curve(hi, 4), { color: '#2E9E5B', dash: true }),
          line('cur', 'Current year', yr(y), { color: '#1565C0', symbol: true }),
          line('prev', 'Previous year', yr(y - 1), { color: '#FB8C00' }),
        ],
        note: `${d.name} Dam · operating rule`,
      };
    },
    'dam-anomaly': (ctx) => {
      const d = pickDam(ctx);
      const s = simulateDam(d.id);
      const from = Math.max(DAM_START + 12, Math.min(ctx.from, ctx.to - 23));
      const pts = monthly(from, ctx.to, (mi) => {
        const lt = mean(Array.from({ length: 30 }, (_, k) => s.storage[damT(monthIndex(1991 + k, miMonth(mi)))]));
        return ((s.storage[damT(mi)] - lt) / lt) * 100;
      });
      return seriesSet('dam-anomaly', [{ unit: '%', label: 'Anomaly' }], [bar('pos', 'Above long-term mean', pts.map(([x, y]) => [x, y != null && y >= 0 ? y : null]), { color: '#2E9E5B', stack: 'a' }), bar('neg', 'Below long-term mean', pts.map(([x, y]) => [x, y != null && y < 0 ? y : null]), { color: '#E4572E', stack: 'a' })], { note: `${d.name} Dam` });
    },
    'low-storage-prob': (ctx) => {
      const list = damsIn(ctx.scope).filter((d) => d.capacity >= 50);
      const pts: [string, number][] = [];
      for (let h = 1; h <= 12; h++) {
        const p = mean(list.map((d) => {
          const f = damForecast(d, 12)[h - 1];
          const sd = (f.p90 - f.p10) / 2.5632 || 1;
          const z = (30 - f.median) / sd;
          return 1 / (1 + Math.exp(-1.7 * z));
        })) * 100;
        pts.push([miToIso(ctx.last + h), round(p, 1)]);
      }
      return seriesSet('low-storage-prob', [{ unit: '%', label: 'Probability', min: 0, max: 100 }], [area('p', 'Probability storage < 30% (mean of major dams)', pts, { color: '#E4572E' })]);
    },
  },

  breakdown: {
    'by-wma': (ctx) => {
      const rows = WMAS.map((w) => ({ name: w.name, pct: aggregateStorage(DAMS.filter((d) => d.wma === w.id && (ctx.scope.level === 'national' || ctx.scope.includes(d)))).pct })).filter((r) => r.pct > 0).sort((a, b) => b.pct - a.pct);
      return categories('by-wma', '%', rows.map((r) => r.name), [{ key: 'pct', name: 'Storage (% FSC)', values: rows.map((r) => r.pct) }], { colors: rows.map((r) => SCALES.storage.bins.find((b) => b.id === storageBand(r.pct))!.color) });
    },
    distribution: (ctx) => {
      const list = damsIn(ctx.scope);
      const bands = SCALES.storage.bins.slice().reverse();
      const counts = bands.map((b) => list.filter((d) => storageBand(damNow(d.id).pct) === b.id).length);
      return categories('distribution', 'dams', bands.map((b) => b.label), [{ key: 'n', name: 'Dams', values: counts }], { colors: bands.map((b) => b.color), center: { value: String(list.length), label: 'Dams' } });
    },
    operational: (ctx) => {
      const list = damsIn(ctx.scope);
      const st = ['Normal', 'Watch', 'Warning', 'Critical'] as const;
      return categories('operational', 'dams', [...st], [{ key: 'n', name: 'Dams', values: st.map((s) => list.filter((d) => damNow(d.id).status === s).length) }], { colors: ['#4CAF50', '#F6CF3E', '#F28C28', '#D7301F'], center: { value: String(list.length), label: 'Dams' } });
    },
    'wma-volume': () => {
      const rows = WMAS.map((w) => ({ code: w.code, agg: aggregateStorage(DAMS.filter((d) => d.wma === w.id)) })).filter((r) => r.agg.capacity > 0);
      return categories('wma-volume', '%', rows.map((r) => r.code), [{ key: 'pct', name: '% FSC', values: rows.map((r) => r.agg.pct), color: '#1565C0' }, { key: 'vol', name: 'Volume (Mm³)', values: rows.map((r) => r.agg.volume), kind: 'line', axis: 1, color: '#FB8C00' }], { axis2Unit: 'Mm³' });
    },
    'by-province': () => {
      const rows = PROVINCE_ORDER.map((p) => {
        const list = DAMS.filter((d) => d.province === p);
        const agg = aggregateStorage(list);
        const ly = list.reduce((s, d) => s + damNow(d.id).lastYearPct * d.capacity, 0) / (agg.capacity || 1);
        return { p, cur: agg.pct, ly, lt: ltPct(list, miMonth(END_MI)) };
      });
      return categories('by-province', '%', rows.map((r) => r.p), [
        { key: 'cur', name: 'Current', values: rows.map((r) => r.cur), color: '#1565C0' },
        { key: 'ly', name: 'Last year', values: rows.map((r) => r.ly), color: '#E53935' },
        { key: 'lt', name: 'Long-term mean', values: rows.map((r) => r.lt), color: '#94A3B8' },
      ]);
    },
    'risk-categories': (ctx) => {
      const list = damsIn(ctx.scope).filter((d) => d.capacity >= 10);
      const horizons = [0, 3, 6, 12, 24];
      const cats = [
        { name: 'Critical (< 20%)', test: (p: number) => p < 20, color: '#D7301F' },
        { name: 'Low (20–40%)', test: (p: number) => p >= 20 && p < 40, color: '#F28C28' },
        { name: 'Moderate (40–60%)', test: (p: number) => p >= 40 && p < 60, color: '#F6CF3E' },
        { name: 'High (60–80%)', test: (p: number) => p >= 60 && p < 80, color: '#4CAF50' },
        { name: 'Very high (≥ 80%)', test: (p: number) => p >= 80, color: '#1F6FD1' },
      ];
      const pctAt = (d: Dam, h: number) => (h === 0 ? damNow(d.id).pct : damForecast(d, 24)[h - 1].median);
      return categories('risk-categories', 'dams', horizons.map((h) => (h ? `${h} months` : 'Current')), cats.map((c) => ({ key: c.name, name: c.name, values: horizons.map((h) => list.filter((d) => c.test(pctAt(d, h))).length), color: c.color, stack: 'r' })));
    },
  },

  table: {
    top10: (ctx) => {
      const list = [...damsIn(ctx.scope)].sort((a, b) => b.capacity - a.capacity).slice(0, Number(ctx.q('limit') ?? 10));
      return table(
        'top10',
        [col.rank(), col.text('name', 'Dam'), col.text('province', 'Province'), col.num('capacity', 'Capacity', 'Mm³'), col.num('volume', 'Current volume', 'Mm³'), col.num('pct', 'Storage', '%', 1, { scale: 'storage' }), col.num('ly', 'Last year', '%', 1), col.trend('trend', 'Trend (30 d)', 'up', 'pp')],
        list.map((d) => {
          const n = damNow(d.id);
          return { id: d.id, name: d.name, province: d.province === 'LS' ? 'LES' : d.province, capacity: d.capacity, volume: n.volume, pct: n.pct, ly: n.lastYearPct, trend: n.trend30 };
        }),
        { rowKey: 'id' },
      );
    },
    lowest: (ctx) => {
      const asc = ctx.q('order') !== 'highest';
      const list = [...damsIn(ctx.scope)].filter((d) => d.capacity >= 10).sort((a, b) => (asc ? damNow(a.id).pct - damNow(b.id).pct : damNow(b.id).pct - damNow(a.id).pct)).slice(0, 10);
      return table('lowest', [col.rank(), col.text('name', 'Dam'), col.text('province', 'Province'), col.num('pct', '% FSC', '%', 1, { scale: 'storage' }), col.num('volume', 'Volume', 'Mm³'), col.cls('status', 'Status', 'status')], list.map((d) => ({ id: d.id, name: d.name, province: d.province, pct: damNow(d.id).pct, volume: damNow(d.id).volume, status: damNow(d.id).status })), { rowKey: 'id' });
    },
    'key-dams-forecast': (ctx) => {
      const list = [...damsIn(ctx.scope)].sort((a, b) => b.capacity - a.capacity).slice(0, 12);
      return table(
        'key-dams-forecast',
        [col.text('name', 'Dam / reservoir'), col.text('province', 'Province'), col.num('cur', 'Current', '%', 0, { scale: 'storage' }), col.num('storage', 'Storage', 'Mm³'), col.num('f3', '3 months', '%', 0, { scale: 'storage' }), col.num('f6', '6 months', '%', 0, { scale: 'storage' }), col.num('f12', '12 months', '%', 0, { scale: 'storage' }), col.cls('risk', 'Risk level', 'risk')],
        list.map((d) => {
          const f = damForecast(d, 12);
          const min = Math.min(...f.map((p) => p.p10));
          return { id: d.id, name: d.name, province: provLabel(d), cur: damNow(d.id).pct, storage: damNow(d.id).volume, f3: round(f[2].median, 0), f6: round(f[5].median, 0), f12: round(f[11].median, 0), risk: min < 15 ? 'High' : min < 35 ? 'Moderate' : 'Low' };
        }),
        { rowKey: 'id' },
      );
    },
    'risk-outlook': (ctx) => {
      const list = damsIn(ctx.scope).filter((d) => d.capacity >= 50);
      const horizons = [3, 6, 12, 24];
      const lvl = (x: number) => (x > 0.5 ? 'High' : x > 0.25 ? 'Moderate' : 'Low');
      const rows = [
        { risk: 'Extreme drought risk', f: (h: number) => mean(list.map((d) => (damForecast(d, 24)[h - 1].median < 30 ? 1 : 0))) },
        { risk: 'Low inflow risk', f: (h: number) => mean(list.map((d) => (damForecast(d, 24)[h - 1].median < damNow(d.id).pct ? 0.7 : 0.2))) },
        { risk: 'High evaporation risk', f: (h: number) => (([10, 11, 0, 1].includes(miMonth(END_MI + h)) ? 0.55 : 0.2)) },
        { risk: 'Spill risk (high inflow)', f: (h: number) => mean(list.map((d) => (damForecast(d, 24)[h - 1].p90 >= 99 ? 1 : 0))) },
        { risk: 'Operational risk', f: (h: number) => mean(list.map((d) => (damForecast(d, 24)[h - 1].p10 < 20 ? 1 : 0))) },
      ];
      return table('risk-outlook', [col.text('risk', 'Risk'), ...horizons.map((h) => col.cls(`h${h}`, `${h} months`, 'risk'))], rows.map((r) => ({ risk: r.risk, ...Object.fromEntries(horizons.map((h) => [`h${h}`, lvl(r.f(h))])) })));
    },
  },

  map: {
    storage: () => pointsLayer('storage', 'Storage level (% FSC)', 'storage', '%', DAMS.map((d) => ({ id: d.id, name: `${d.name} Dam`, lat: d.lat, lon: d.lon, value: damNow(d.id).pct, size: Math.min(1, Math.log10(d.capacity + 1) / 3.75), kind: 'dam', sub: `${provLabel(d)} · ${fmtInt(damNow(d.id).volume)} of ${fmtInt(d.capacity)} Mm³` }))),
    anomaly: () => pointsLayer('anomaly', 'Storage anomaly vs long-term mean (pp)', 'anomalyPct', 'pp', DAMS.map((d) => ({ id: d.id, name: `${d.name} Dam`, lat: d.lat, lon: d.lon, value: round(damNow(d.id).pct - damNow(d.id).longTermPct, 1), size: Math.min(1, Math.log10(d.capacity + 1) / 3.75), kind: 'dam' }))),
    inflow: () => pointsLayer('inflow', 'Inflow (m³/s)', 'flow', 'm³/s', DAMS.map((d) => ({ id: d.id, name: `${d.name} Dam`, lat: d.lat, lon: d.lon, value: damNow(d.id).inflowCumecs, size: Math.min(1, Math.log10(d.capacity + 1) / 3.75), kind: 'dam' }))),
    status: () => pointsLayer('status', 'Operational status', 'status', '', DAMS.map((d) => ({ id: d.id, name: `${d.name} Dam`, lat: d.lat, lon: d.lon, value: damNow(d.id).status, size: Math.min(1, Math.log10(d.capacity + 1) / 3.75), kind: 'dam' }))),
    'forecast-12': () => pointsLayer('forecast-12', 'Forecast storage in 12 months (% FSC)', 'storage', '%', DAMS.map((d) => ({ id: d.id, name: `${d.name} Dam`, lat: d.lat, lon: d.lon, value: round(damForecast(d, 12)[11].median, 0), size: Math.min(1, Math.log10(d.capacity + 1) / 3.75), kind: 'dam' }))),
  },

  entities: (ctx) => {
    const list = [...damsIn(ctx.scope)].sort((a, b) => b.capacity - a.capacity);
    return { type: 'dam', total: list.length, items: list.map((d) => ({ id: d.id, name: `${d.name} Dam`, type: 'dam', province: d.province, wma: d.wma, lat: d.lat, lon: d.lon, sub: d.province === 'LS' ? 'Lesotho' : d.province })) };
  },

  entity: (_ctx, id) => {
    const d = damById.get(id);
    if (!d) throw new Error(`Unknown dam ${id}`);
    const n = damNow(d.id);
    return {
      id: d.id,
      name: `${d.name} Dam`,
      title: `${d.name} Dam (${provLabel(d)})`,
      type: 'dam',
      province: d.province,
      wma: d.wma,
      lat: d.lat,
      lon: d.lon,
      image: 'dam',
      status: { scale: 'status', id: n.status, label: n.status },
      fields: [
        { label: 'River system', value: `${d.river} River` },
        { label: 'Province', value: provLabel(d) },
        { label: 'Water Management Area', value: wmaName(d.wma) },
        { label: 'Dam category', value: d.category },
        { label: 'Full supply capacity', value: d.capacity, unit: 'Mm³' },
        { label: 'Current volume', value: n.volume, unit: 'Mm³' },
        { label: 'Storage level', value: n.pct, unit: '%', scale: 'storage' },
        { label: 'Same date last year', value: n.lastYearPct, unit: '%' },
        { label: 'Long-term mean (this month)', value: n.longTermPct, unit: '%' },
        { label: 'Inflow (latest)', value: n.inflowCumecs, unit: 'm³/s' },
        { label: 'Outflow (latest)', value: n.outflowCumecs, unit: 'm³/s' },
        { label: 'Evaporation (month)', value: n.evapMonth, unit: 'Mm³' },
        { label: 'Trend (30 days)', value: `${n.trend30 > 0 ? '+' : ''}${n.trend30} pp` },
        { label: 'Days to empty (current draw-down)', value: n.daysToEmpty == null ? 'Filling' : n.daysToEmpty },
        { label: 'Alert level (spec §8.2)', value: n.alert === 'None' ? 'None' : `Level ${n.alert.slice(1)}` },
        { label: 'Wall height', value: d.wallHeight, unit: 'm' },
        { label: 'Year completed', value: String(d.yearCompleted) },
        { label: 'Coordinates', value: `${Math.abs(d.lat).toFixed(2)}° S, ${d.lon.toFixed(2)}° E` },
        { label: 'Data source', value: 'DWS Hydstra / telemetry' },
        ...(d.verify ? [{ label: 'Note', value: 'Capacity approximate — verify with DWS register' }] : []),
      ],
    };
  },

  forecast: {
    storage: (ctx) => {
      const id = ctx.q('entityId');
      const single = id && damById.has(id) ? damById.get(id)! : null;
      const list = single ? [single] : damsIn(ctx.scope);
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 17; mi <= ctx.last; mi++) hist.push([mi, aggregatePctAt(list, mi)]);
      let fc;
      if (single) fc = damForecast(single, 12);
      else {
        // aggregate forecast = capacity-weighted mean of dam forecasts (consistent with Σvol/Σcap)
        const cap = list.reduce((s, d) => s + d.capacity, 0);
        const per = list.map((d) => ({ d, f: damForecast(d, 12) }));
        fc = per[0].f.map((_, h) => ({
          mi: per[0].f[h].mi,
          median: per.reduce((s, x) => s + x.f[h].median * x.d.capacity, 0) / cap,
          p10: per.reduce((s, x) => s + x.f[h].p10 * x.d.capacity, 0) / cap * 0.97,
          p90: Math.min(100, per.reduce((s, x) => s + x.f[h].p90 * x.d.capacity, 0) / cap * 1.03),
        }));
      }
      const f = forecastSeries(hist, fc);
      return seriesSet('storage-forecast', [{ unit: '%', label: 'Storage (% FSC)', min: 0, max: 100 }], [band('band', f.names.band, f.band, { color: '#90CAF9' }), line('obs', 'Historical', f.observed, { color: '#13233A', symbol: true }), line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true })], { asOf: miToIso(ctx.last), note: single ? `${single.name} Dam` : `${list.length} dams` });
    },
    flows: (ctx) => {
      const list = damsIn(ctx.scope);
      const hist = Array.from({ length: 12 }, (_, k) => ctx.last - 11 + k);
      const climIn = (m: number) => mean(Array.from({ length: 30 }, (_, k) => aggregateFlows(list, monthIndex(1991 + k, m)).inflow));
      const climOut = (m: number) => mean(Array.from({ length: 30 }, (_, k) => aggregateFlows(list, monthIndex(1991 + k, m)).outflow));
      const r = new Rng(`flowfc-${ctx.scope.key}`);
      const fut = Array.from({ length: 12 }, (_, k) => ctx.last + 1 + k);
      const ratio = clamp(mean(hist.slice(-3).map((mi) => aggregateFlows(list, mi).inflow / Math.max(1, climIn(miMonth(mi))))), 0.3, 1.6);
      return seriesSet('flows-forecast', [{ unit: 'Mm³', label: 'Monthly volume' }], [
        bar('inH', 'Inflow (historical)', hist.map((mi) => [miToIso(mi), aggregateFlows(list, mi).inflow]), { color: '#1565C0' }),
        bar('inF', 'Inflow (forecast)', fut.map((mi, h) => [miToIso(mi), climIn(miMonth(mi)) * (1 + (ratio - 1) * Math.pow(0.8, h + 1)) * r.range(0.95, 1.05)]), { color: '#90CAF9' }),
        bar('outH', 'Outflow (historical)', hist.map((mi) => [miToIso(mi), aggregateFlows(list, mi).outflow]), { color: '#FB8C00' }),
        bar('outF', 'Outflow (forecast)', fut.map((mi) => [miToIso(mi), climOut(miMonth(mi)) * r.range(0.95, 1.05)]), { color: '#FFCC80' }),
      ], { asOf: miToIso(ctx.last) });
    },
  },
};

export { ltPct, damForecast };
