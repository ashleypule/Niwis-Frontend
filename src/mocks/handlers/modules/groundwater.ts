/** Groundwater Level Monitoring (spec §10) and Groundwater Reserve Assessment (spec §11). */
import { SCALES } from '@/config/palettes';
import { exploitationClass } from '@/config/thresholds';
import { MONTH_NAMES } from '@/lib/format';
import { Rng } from '@/lib/prng';
import { clamp, mean, round, sensSlope } from '@/lib/stats';
import { miMonth, miToIso, miYear, monthIndex } from '@/lib/time';
import { provinceName, wmaName, municipalityById } from '../../reference/regions';
import { CELLS } from '../../generators/climate';
import { LAST, regionSeries, tOf } from '../../generators/hydromet';
import { AQUIFERS, AQUIFER_UNITS, BOREHOLES, GW_START, boreholeById, boreholeLevels, boreholeNow, boreholeSgi, gwT, type AquiferUnit, type Borehole } from '../../generators/groundwater';
import { WQ_STATIONS, wqSamples, wqT } from '../../generators/quality';
import { dampedForecast, forecastSeries } from '../../generators/forecast';
import type { ResolvedScope } from '../../generators/scope';
import { band, bar, categories, col, kpi, line, monthly, seriesSet, table, type Ctx, type ModuleHandlers } from '../build';
import { choropleth, pointsLayer, spark } from '../common';
import { DROUGHT_BANDS } from './drought';

const bhIn = (scope: ResolvedScope) => BOREHOLES.filter((b) => scope.includes(b));
const win = (ctx: Ctx, min = 24) => Math.max(GW_START, Math.min(ctx.from, ctx.to - min + 1));

function pickBorehole(ctx: Ctx): Borehole {
  const id = ctx.q('entityId');
  if (id && boreholeById.has(id)) return boreholeById.get(id)!;
  const list = bhIn(ctx.scope);
  // default: the monitoring borehole with the deepest current level in scope (most at risk)
  return [...(list.length ? list : BOREHOLES)].sort((a, b) => boreholeNow(b.id).level - boreholeNow(a.id).level)[0];
}

function annualRechargeVsAbstraction(units: AquiferUnit[], year: number) {
  // annual recharge scales with that year's rainfall relative to normal; abstraction grows ~2%/yr
  const sc = units.length ? units : AQUIFER_UNITS;
  const prov = Array.from(new Set(sc.map((u) => u.province)));
  let ratio = 0;
  prov.forEach((p) => {
    const rain = regionSeries({ key: `p:${p}`, cells: CELLS.map((_, i) => i).filter((i) => CELLS[i].province === p) } as ResolvedScope, 'rain');
    const tot = Array.from({ length: 12 }, (_, m) => rain[tOf(monthIndex(year, m))] ?? 0).reduce((a, b) => a + b, 0);
    const norm = mean(Array.from({ length: 30 }, (_, k) => Array.from({ length: 12 }, (__, m) => rain[tOf(monthIndex(1981 + k, m))]).reduce((a, b) => a + b, 0)));
    ratio += tot / norm / prov.length;
  });
  const recharge = sc.reduce((a, u) => a + u.recharge, 0) * Math.pow(clamp(ratio, 0.2, 2.5), 1.5);
  const abstraction = sc.reduce((a, u) => a + u.abstraction, 0) * Math.pow(1.02, year - miYear(LAST));
  return { recharge, abstraction };
}

function boreholeEntity(b: Borehole) {
  const n = boreholeNow(b.id);
  return {
    id: b.id,
    name: b.id,
    title: `${b.id} – ${b.aquifer.name}`,
    type: 'borehole',
    province: b.province,
    wma: b.wma,
    lat: b.lat,
    lon: b.lon,
    image: 'borehole' as const,
    status: { scale: 'status', id: n.status, label: n.status },
    fields: [
      { label: 'Borehole ID', value: b.id },
      { label: 'Aquifer', value: b.aquifer.name },
      { label: 'Province', value: provinceName(b.province) },
      { label: 'Local municipality', value: municipalityById.get(b.municipality)?.name ?? '—' },
      { label: 'Water Management Area', value: wmaName(b.wma) },
      { label: 'Coordinates', value: `${Math.abs(b.lat).toFixed(2)}° S, ${b.lon.toFixed(2)}° E` },
      { label: 'Depth drilled', value: b.depthDrilled, unit: 'm' },
      { label: 'Screened interval', value: `${b.screen} m` },
      { label: 'Current water level', value: round(n.level, 1), unit: 'm bgl' },
      { label: 'Long-term mean (this month)', value: n.longTerm, unit: 'm bgl' },
      { label: 'Anomaly', value: `${n.anomaly > 0 ? '+' : ''}${n.anomaly} m (${n.anomaly >= 0 ? 'shallower' : 'deeper'})` },
      { label: 'SGI', value: n.sgi },
      { label: 'Trend (36 months)', value: `${n.trendPerYear > 0 ? '+' : ''}${n.trendPerYear} m/yr (${n.trendClass.toLowerCase()})` },
      { label: 'Use', value: b.use },
      { label: 'Abstraction', value: b.abstraction, unit: 'm³/day' },
      { label: 'Data availability', value: 'Monthly (NGA) / real-time where telemetered' },
      { label: 'Source', value: 'DWS NGA / Hydstra' },
    ],
  };
}

const levelAt = (list: Borehole[], mi: number) => mean(list.map((b) => boreholeLevels(b.id)[gwT(mi)]));

export const groundwater: ModuleHandlers = {
  summary: (ctx) => {
    const list = bhIn(ctx.scope);
    const s = list.slice(0, 600);
    const L = ctx.last;
    const now = s.map((b) => boreholeNow(b.id));
    const rising = now.filter((n) => n.trendClass === 'Rising').length;
    const declining = now.filter((n) => n.trendClass === 'Declining').length;
    const units = AQUIFER_UNITS.filter((u) => ctx.scope.level === 'national' || ctx.scope.includes({ province: u.province }));
    const recharge = units.reduce((a, u) => a + u.recharge, 0);
    const area = units.reduce((a, u) => a + u.areaKm2, 0);
    const risk = list.filter((b) => ['Critical', 'Low'].includes(boreholeNow(b.id).status)).length;
    return [
      kpi('n', 'boreholes', list.length, { label: 'Monitoring Boreholes', sublabel: 'National Groundwater Archive', unit: '' }),
      kpi('level', 'gwLevel', mean(now.map((n) => n.level)), { label: 'Mean Groundwater Level', sublabel: 'm below ground level', delta: levelAt(s, L) - levelAt(s, L - 1), deltaUnit: ' m', deltaLabel: 'vs last month', spark: spark((mi) => levelAt(s, mi), L, 24) }),
      kpi('anom', 'gwLevelAnomaly', mean(now.map((n) => n.anomaly)), { label: 'Level Anomaly', sublabel: 'vs long-term mean (+ = shallower)' }),
      kpi('sgi', 'sgi', mean(now.map((n) => n.sgi)), { label: 'SGI', sublabel: 'Mean of boreholes', spark: spark((mi) => mean(s.slice(0, 200).map((b) => boreholeSgi(b.id)[gwT(mi)] ?? 0)), L, 18) }),
      kpi('recharge', 'recharge', area ? (recharge * 1000) / area : 0, { label: 'Estimated Recharge', sublabel: `${units.length} aquifer units` }),
      kpi('abstraction', 'abstraction', units.reduce((a, u) => a + u.abstraction, 0), { label: 'Annual Abstraction', sublabel: 'Licensed + estimated', delta: 2, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('rising', 'stationsHighFlow', (rising / Math.max(1, now.length)) * 100, { label: 'Boreholes with Rising Levels', sublabel: `${(declining / Math.max(1, now.length) * 100).toFixed(0)}% declining`, goodDirection: 'up' }),
      kpi('risk', 'boreholesAtRisk', risk, { label: 'Boreholes at Risk', sublabel: 'SGI ≤ −1.0 (low / critical)' }),
    ];
  },
  timeseries: {
    level: (ctx) => {
      const b = pickBorehole(ctx);
      const L = boreholeLevels(b.id);
      const from = win(ctx, 24);
      const lt = (mi: number) => mean(Array.from({ length: 20 }, (_, k) => L[gwT(monthIndex(2000 + k, miMonth(mi)))]));
      return seriesSet('gw-level', [{ unit: 'm bgl', label: 'Depth to water', inverse: true }], [
        line('cur', 'Water level', monthly(from, ctx.to, (mi) => L[gwT(mi)]), { color: '#1565C0', symbol: true }),
        line('prev', 'Previous year', monthly(from, ctx.to, (mi) => L[gwT(mi - 12)]), { color: '#E53935', dash: true }),
        line('lt', 'Long-term mean (2000–2019)', monthly(from, ctx.to, lt), { color: '#13233A', dash: true }),
      ], { note: `${b.id} (${b.aquifer.name})` });
    },
    'level-long': (ctx) => {
      const b = pickBorehole(ctx);
      const L = boreholeLevels(b.id);
      const from = monthIndex(2010, 0);
      const ys = Array.from({ length: ctx.last - from + 1 }, (_, k) => L[gwT(from + k)]);
      const xs = ys.map((_, k) => k);
      const sl = sensSlope(ys.filter((_, k) => k % 3 === 0), xs.filter((_, k) => k % 3 === 0));
      const med = ys.map((v, k) => v - sl * k).sort((a, b2) => a - b2)[Math.floor(ys.length / 2)];
      return seriesSet('gw-level-long', [{ unit: 'm bgl', label: 'Depth to water', inverse: true }], [
        line('obs', 'Observed level', ys.map((v, k) => [miToIso(from + k), v]), { color: '#1565C0' }),
        line('lt', 'Long-term mean', ys.map((_, k) => [miToIso(from + k), boreholeNow(b.id).longTerm]), { color: '#E53935', dash: true }),
        line('trend', "Trend (Sen's slope)", ys.map((_, k) => [miToIso(from + k), med + sl * k]), { color: '#2E9E5B', dash: true }),
      ], { note: `${b.id} · ${round(sl * 12, 2)} m/yr` });
    },
    anomaly: (ctx) => {
      const s = bhIn(ctx.scope).slice(0, 300);
      const from = win(ctx, 12);
      const pts = monthly(from, ctx.to, (mi) => mean(s.map((b) => {
        const L = boreholeLevels(b.id);
        return mean(Array.from({ length: 20 }, (_, k) => L[gwT(monthIndex(2000 + k, miMonth(mi)))])) - L[gwT(mi)];
      })));
      return seriesSet('gw-anomaly', [{ unit: 'm', label: 'Anomaly (+ = shallower)' }], [bar('pos', 'Positive anomaly (higher level)', pts.map(([x, y]) => [x, y != null && y >= 0 ? y : null]), { color: '#2E9E5B', stack: 'a' }), bar('neg', 'Negative anomaly (lower level)', pts.map(([x, y]) => [x, y != null && y < 0 ? y : null]), { color: '#E4572E', stack: 'a' })]);
    },
    sgi: (ctx) => {
      const b = pickBorehole(ctx);
      const sg = boreholeSgi(b.id);
      const from = win(ctx, 30);
      return seriesSet('sgi', [{ unit: '', label: 'SGI', min: -3, max: 3 }], [bar('sgi', 'SGI', monthly(from, ctx.to, (mi) => sg[gwT(mi)]), { color: '#1565C0' })], { bands: DROUGHT_BANDS, note: b.id });
    },
    seasonal: (ctx) => {
      const b = pickBorehole(ctx);
      const L = boreholeLevels(b.id);
      const y = miYear(ctx.last);
      const cols = ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD', '#E53935'];
      return {
        id: 'gw-seasonal',
        xType: 'category',
        axes: [{ unit: 'm bgl', label: 'Depth to water', inverse: true }],
        series: Array.from({ length: 5 }, (_, k) => line(`y${k}`, String(y - k), MONTH_NAMES.map((n, m) => [n, monthIndex(y - k, m) > ctx.last ? null : L[gwT(monthIndex(y - k, m))]]), { color: cols[k], symbol: true, dash: k > 0 })),
        note: b.id,
      };
    },
    'recharge-abstraction': (ctx) => {
      const units = AQUIFER_UNITS.filter((u) => (ctx.q('aquifer') ? u.id === ctx.q('aquifer') : ctx.scope.level === 'national' || ctx.scope.includes({ province: u.province })));
      const y1 = miYear(ctx.last) - 1;
      const ys = Array.from({ length: 11 }, (_, k) => y1 - 10 + k);
      const v = ys.map((y) => annualRechargeVsAbstraction(units, y));
      return {
        id: 'recharge-abstraction',
        xType: 'category',
        axes: [{ unit: 'Mm³/yr', label: 'Volume' }],
        series: [bar('r', 'Recharge', ys.map((y, k) => [String(y), v[k].recharge]), { color: '#1565C0' }), bar('a', 'Abstraction', ys.map((y, k) => [String(y), v[k].abstraction]), { color: '#F2A900' }), line('net', 'Net balance', ys.map((y, k) => [String(y), v[k].recharge - v[k].abstraction]), { color: '#2E9E5B', symbol: true })],
      };
    },
    quality: (ctx) => {
      const p = ctx.q('param') ?? 'ec';
      const b = pickBorehole(ctx);
      const gw = [...WQ_STATIONS].filter((w) => w.type === 'Groundwater').sort((a, c) => (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2 - ((c.lat - b.lat) ** 2 + (c.lon - b.lon) ** 2))[0];
      const s = wqSamples(gw.id)[p];
      const from = Math.max(win(ctx, 24), monthIndex(2018, 0));
      const lim: Record<string, [number, string]> = { ec: [170, 'mS/m'], ph: [9, 'pH units'], nitrate: [11, 'mg/L'], fluoride: [1.5, 'mg/L'], tds: [1200, 'mg/L'] };
      return { ...seriesSet(`gw-q-${p}`, [{ unit: lim[p]?.[1] ?? '', label: p.toUpperCase() }], [line('v', p === 'ec' ? 'EC' : p === 'tds' ? 'TDS' : p === 'ph' ? 'pH' : p[0].toUpperCase() + p.slice(1), monthly(from, ctx.to, (mi) => s[wqT(mi)]), { color: '#1565C0', symbol: true })]), refLines: lim[p] ? [{ y: lim[p][0], label: 'SANS 241 limit' }] : [], note: `${b.id} (nearest GW quality site)` };
    },
  },
  breakdown: {
    status: (ctx) => {
      const list = bhIn(ctx.scope);
      const st = ['Normal', 'Watch', 'Low', 'Critical'] as const;
      return categories('status', 'boreholes', [...st], [{ key: 'n', name: 'Boreholes', values: st.map((x) => list.filter((b) => boreholeNow(b.id).status === x).length) }], { colors: ['#4CAF50', '#F6CF3E', '#F28C28', '#D7301F'], center: { value: list.length.toLocaleString('en-ZA').replace(/,/g, ' '), label: 'Boreholes' } });
    },
    'by-aquifer': (ctx) => {
      const list = bhIn(ctx.scope);
      const rows = AQUIFERS.map((a) => ({ name: a.name, v: mean(list.filter((b) => b.aquifer.id === a.id).map((b) => boreholeNow(b.id).level)) })).filter((r) => !Number.isNaN(r.v)).sort((a, b) => b.v - a.v);
      return categories('by-aquifer', 'm bgl', rows.map((r) => r.name), [{ key: 'v', name: 'Mean level (m bgl)', values: rows.map((r) => r.v) }], { colors: rows.map((r) => SCALES.gwDepth.bins.find((bn) => (bn.min ?? -1e9) <= r.v && r.v < (bn.max ?? 1e9))?.color ?? '#94A3B8') });
    },
    sector: (ctx) => {
      const list = bhIn(ctx.scope);
      const uses = ['Agriculture', 'Municipal', 'Industrial', 'Mining'] as const;
      const v = uses.map((u) => (list.filter((b) => b.use === u).reduce((a, b) => a + b.abstraction, 0) * 365) / 1e6);
      const scale = AQUIFER_UNITS.filter((u) => ctx.scope.level === 'national' || ctx.scope.includes({ province: u.province })).reduce((a, u) => a + u.abstraction, 0) / Math.max(1, v.reduce((a, b) => a + b, 0));
      return categories('sector', 'Mm³/yr', [...uses], [{ key: 'v', name: 'Abstraction', values: v.map((x) => x * scale) }], { colors: ['#2E9E5B', '#1565C0', '#F2A900', '#E4572E'] });
    },
    distribution: (ctx) => {
      const list = bhIn(ctx.scope);
      const bins = SCALES.gwDepth.bins;
      return categories('distribution', 'boreholes', bins.map((b) => b.label), [{ key: 'n', name: 'Boreholes', values: bins.map((bn) => list.filter((b) => { const l = boreholeNow(b.id).level; return (bn.min ?? -1e9) <= l && l < (bn.max ?? 1e9); }).length) }], { colors: bins.map((b) => b.color) });
    },
  },
  table: {
    lowest: (ctx) => {
      const deepest = ctx.q('order') !== 'shallowest';
      const rows = bhIn(ctx.scope)
        .map((b) => ({ b, n: boreholeNow(b.id) }))
        .sort((a, c) => (deepest ? c.n.level - a.n.level : a.n.level - c.n.level))
        .slice(0, 8)
        .map(({ b, n }) => ({ id: b.id, municipality: municipalityById.get(b.municipality)?.name ?? '', province: b.province, level: n.level, status: n.status }));
      return table('lowest', [col.rank(), col.text('id', 'Borehole ID'), col.text('municipality', 'Municipality'), col.num('level', 'Level', 'm bgl', 1), col.cls('status', 'Status', 'status')], rows, { rowKey: 'id' });
    },
    declining: (ctx) => {
      const rows = bhIn(ctx.scope)
        .map((b) => ({ b, n: boreholeNow(b.id) }))
        .sort((a, c) => c.n.trendPerYear - a.n.trendPerYear)
        .slice(0, 8)
        .map(({ b, n }) => ({ id: b.id, province: b.province, change: -(n.level - n.lastYear), trend: -n.trendPerYear }));
      return table('declining', [col.rank(), col.text('id', 'Borehole ID'), col.text('province', 'Prov.'), col.delta('change', '12-month change', 'up', 'm', 1), col.trend('trend', 'Trend', 'up', 'm/yr', 2)], rows, { rowKey: 'id' });
    },
    aquifers: (ctx) => {
      const list = bhIn(ctx.scope);
      const rows = AQUIFERS.map((a) => {
        const bh = list.filter((b) => b.aquifer.id === a.id);
        if (!bh.length) return null;
        const n = bh.map((b) => boreholeNow(b.id));
        const sgi = mean(n.map((x) => x.sgi));
        return { aquifer: a.name, n: bh.length, level: mean(n.map((x) => x.level)), trend: -mean(n.map((x) => x.trendPerYear)), sgi, status: sgi <= -1.3 ? 'Critical' : sgi <= -0.8 ? 'Low' : sgi <= -0.4 ? 'Watch' : 'Normal' };
      }).filter((r): r is NonNullable<typeof r> => !!r);
      return table('aquifers', [col.text('aquifer', 'Aquifer'), col.num('n', 'Boreholes'), col.num('level', 'Mean level', 'm bgl', 1), col.trend('trend', 'Trend', 'up', 'm/yr', 2), col.num('sgi', 'SGI', '', 2), col.cls('status', 'Status', 'status')], rows);
    },
    nitrate: (ctx) => {
      const rows = WQ_STATIONS.filter((w) => w.type === 'Groundwater' && ctx.scope.includes(w))
        .map((w) => ({ w, v: wqSamples(w.id).nitrate[wqT(ctx.last)] }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 6)
        .map(({ w, v }) => ({ site: w.name.replace('GW monitoring ', ''), province: w.province, v, status: v > 11 ? 'Poor' : v > 6 ? 'Fair' : 'Good' }));
      return table('nitrate', [col.rank(), col.text('site', 'Site'), col.text('province', 'Prov.'), col.num('v', 'Nitrate', 'mg/L', 1), col.cls('status', 'Status', 'wq')], rows);
    },
  },
  map: {
    'gw-level': () => pointsLayer('gw-level', 'Groundwater level (m bgl)', 'gwDepth', 'm bgl', BOREHOLES.map((b) => ({ id: b.id, name: b.id, lat: b.lat, lon: b.lon, value: round(boreholeNow(b.id).level, 1), size: 0.12, kind: 'borehole', sub: b.aquifer.name }))),
    sgi: () => pointsLayer('sgi', 'Standardised Groundwater Index', 'spi', '', BOREHOLES.map((b) => ({ id: b.id, name: b.id, lat: b.lat, lon: b.lon, value: boreholeNow(b.id).sgi, size: 0.12, kind: 'borehole', sub: b.aquifer.name }))),
    status: () => pointsLayer('status', 'Borehole status', 'status', '', BOREHOLES.map((b) => ({ id: b.id, name: b.id, lat: b.lat, lon: b.lon, value: boreholeNow(b.id).status, size: 0.12, kind: 'borehole', sub: b.aquifer.name }))),
    'level-change': () => pointsLayer('level-change', 'Level change vs long-term (m, + = higher)', 'tempAnomaly', 'm', BOREHOLES.map((b) => ({ id: b.id, name: b.id, lat: b.lat, lon: b.lon, value: -boreholeNow(b.id).anomaly, size: 0.12, kind: 'borehole' }))),
    ec: () => pointsLayer('ec', 'Groundwater EC (mS/m)', 'nrw', 'mS/m', WQ_STATIONS.filter((w) => w.type === 'Groundwater').map((w) => ({ id: w.id, name: w.name, lat: w.lat, lon: w.lon, value: round(wqSamples(w.id).ec[wqT(LAST)] / 4, 0), size: 0.3, kind: 'wq' }))),
  },
  entities: (ctx) => {
    const list = [...bhIn(ctx.scope)].sort((a, b) => a.id.localeCompare(b.id));
    return { type: 'borehole', total: list.length, items: list.map((b) => ({ id: b.id, name: b.id, type: 'borehole', province: b.province, lat: b.lat, lon: b.lon, sub: b.aquifer.name })) };
  },
  entity: (_ctx, id) => boreholeEntity(boreholeById.get(id) ?? BOREHOLES[0]),
  forecast: {
    level: (ctx) => {
      const b = pickBorehole(ctx);
      const L = boreholeLevels(b.id);
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 23; mi <= ctx.last; mi++) hist.push([mi, L[gwT(mi)]]);
      const n = boreholeNow(b.id);
      const fc = dampedForecast(`gwf-${b.id}`, n.level, { mu: n.longTerm + n.trendPerYear * 1.5, phi: 0.93, sigma: 3, horizon: 12, startMi: ctx.last });
      const f = forecastSeries(hist, fc);
      return seriesSet('gw-forecast', [{ unit: 'm bgl', label: 'Depth to water', inverse: true }], [band('band', f.names.band, f.band, { color: '#90CAF9' }), line('obs', 'Observed', f.observed, { color: '#13233A', symbol: true }), line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true })], { asOf: miToIso(ctx.last), note: b.id });
    },
  },
};

// =================================================================== Groundwater reserve (spec §11)
function unitsIn(ctx: Ctx) {
  return AQUIFER_UNITS.filter((u) => ctx.scope.level === 'national' || ctx.scope.includes({ province: u.province }));
}
function pickUnit(ctx: Ctx): AquiferUnit {
  const id = ctx.q('entityId');
  return AQUIFER_UNITS.find((u) => u.id === id) ?? [...unitsIn(ctx)].sort((a, b) => b.ei - a.ei)[0] ?? AQUIFER_UNITS[0];
}

/** Municipal-scale exploitation index: recharge from MAP, abstraction from boreholes (scaled to aquifer totals). */
function muniEi(id: string, cells: number[]): number | null {
  const m = municipalityById.get(id);
  if (!m) return null;
  const map = mean(cells.map((i) => CELLS[i].map));
  const rechargeMm = map * (0.012 + 0.05 * Math.min(1, map / 900));
  const rechargeM3 = (rechargeMm / 1000) * m.areaKm2 * 1e6;
  const bh = BOREHOLES.filter((b) => b.municipality === id);
  const r = new Rng(`muei-${id}`);
  const abstraction = (bh.reduce((a, b) => a + b.abstraction, 0) * 365 * 9 + r.range(0.02, 0.25) * rechargeM3 * (CELLS[cells[0]]?.aridity ?? 0.5));
  return clamp(abstraction / Math.max(1, rechargeM3), 0, 2.5);
}

export const groundwaterReserve: ModuleHandlers = {
  summary: (ctx) => {
    const u = unitsIn(ctx);
    const rec = u.reduce((a, x) => a + x.recharge, 0);
    const abs = u.reduce((a, x) => a + x.abstraction, 0);
    const ei = abs / Math.max(1, rec);
    const cls = exploitationClass(ei);
    return [
      kpi('units', 'boreholes', u.length, { label: 'Aquifer Units', sublabel: 'Aquifer type × province', unit: '' }),
      kpi('recharge', 'rechargeVolume', rec, { label: 'Total Recharge', delta: 6, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('abstraction', 'abstraction', abs, { label: 'Total Abstraction', delta: 2, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('dynamic', 'dynamicReserve', u.reduce((a, x) => a + x.dynamicReserve, 0), { label: 'Dynamic Reserve', sublabel: 'Renewable (recharge − ecological)' }),
      kpi('static', 'staticReserve', u.reduce((a, x) => a + x.staticReserve, 0), { label: 'Static Reserve', sublabel: 'Groundwater in storage' }),
      kpi('ei', 'exploitationIndex', ei, { label: 'Exploitation Index', sublabel: 'Abstraction / recharge', status: { scale: 'exploitation', id: cls, label: ei <= 0.5 ? 'Sustainable' : ei <= 1 ? 'Stressed' : 'Over-exploited' } }),
      kpi('risk', 'aquifersAtRisk', u.filter((x) => x.ei > 0.7).length, { label: 'Aquifers at Risk', sublabel: 'EI > 0.7' }),
    ];
  },
  timeseries: {
    'level-trend': groundwater.timeseries!['level-long'],
    'recharge-abstraction': (ctx) => {
      const u = pickUnit(ctx);
      const ys = Array.from({ length: 11 }, (_, k) => miYear(ctx.last) - 11 + k);
      const v = ys.map((y) => annualRechargeVsAbstraction([u], y));
      return { id: 'unit-ra', xType: 'category', axes: [{ unit: 'Mm³/yr', label: 'Volume' }], series: [bar('r', 'Recharge', ys.map((y, k) => [String(y), v[k].recharge]), { color: '#1565C0' }), bar('a', 'Abstraction', ys.map((y, k) => [String(y), v[k].abstraction]), { color: '#F2A900' })], note: u.name };
    },
    'yield-ei': (ctx) => {
      const u = pickUnit(ctx);
      const ys = Array.from({ length: 11 }, (_, k) => miYear(ctx.last) - 11 + k);
      const v = ys.map((y) => annualRechargeVsAbstraction([u], y));
      return { id: 'yield-ei', xType: 'category', axes: [{ unit: 'Mm³/yr', label: 'Sustainable yield' }, { unit: '', label: 'Exploitation index', min: 0 }], series: [bar('y', 'Sustainable yield', ys.map((y, k) => [String(y), v[k].recharge * 0.85 * 0.7]), { color: '#1565C0' }), line('ei', 'Exploitation index', ys.map((y, k) => [String(y), v[k].abstraction / Math.max(1, v[k].recharge)]), { axis: 1, color: '#E53935', symbol: true })], note: u.name };
    },
  },
  breakdown: {
    components: (ctx) => {
      const u = pickUnit(ctx);
      const yrs = ['Current', '2030 (forecast)', '2040 (forecast)', '2050 (forecast)'];
      const growth = [1, 1.18, 1.38, 1.6];
      const rech = [1, 0.97, 0.94, 0.9];
      return categories('components', 'Mm³/yr', yrs, [
        { key: 'dyn', name: 'Dynamic reserve', values: rech.map((r) => u.dynamicReserve * r), color: '#1565C0', stack: 'a' },
        { key: 'eco', name: 'Ecological reserve', values: rech.map((r) => u.ecologicalReserve * r), color: '#2E9E5B', stack: 'a' },
        { key: 'cur', name: 'Current abstraction', values: growth.map((g) => u.abstraction * g), color: '#F28C28', stack: 'b' },
        { key: 'add', name: 'Additional allowable abstraction', values: rech.map((r, k) => Math.max(0, u.dynamicReserve * r * 0.7 - u.abstraction * growth[k])), color: '#F6CF3E', stack: 'b' },
      ]);
    },
    'ei-classes': (ctx) => {
      const u = unitsIn(ctx);
      const cls = SCALES.exploitation.bins;
      return categories('ei-classes', 'aquifer units', cls.map((c) => c.label), [{ key: 'n', name: 'Aquifer units', values: cls.map((c) => u.filter((x) => x.eiClass === c.id).length) }], { colors: cls.map((c) => c.color) });
    },
  },
  table: {
    aquifers: (ctx) =>
      table('aquifers', [col.text('name', 'Aquifer unit'), col.num('recharge', 'Recharge', 'Mm³/yr'), col.num('abstraction', 'Abstraction', 'Mm³/yr'), col.num('ei', 'EI', '', 2, { scale: 'exploitation' }), col.num('static', 'Static reserve', 'Mm³'), col.cls('cls', 'Status', 'exploitation')], unitsIn(ctx).sort((a, b) => b.ei - a.ei).map((u) => ({ id: u.id, name: u.name, recharge: u.recharge, abstraction: u.abstraction, ei: u.ei, static: u.staticReserve, cls: u.eiClass })), { rowKey: 'id' }),
    lowest: groundwater.table!.lowest,
  },
  map: {
    ei: () => choropleth('ei', 'Exploitation index (abstraction / recharge)', 'municipality', 'exploitation', '', muniEi),
    recharge: () => choropleth('recharge', 'Recharge (mm/yr)', 'municipality', 'runoff', 'mm', (_id, cells) => {
      const map = mean(cells.map((i) => CELLS[i].map));
      return map * (0.012 + 0.05 * Math.min(1, map / 900));
    }, 1),
    'gw-level': groundwater.map!['gw-level'],
    sgi: groundwater.map!.sgi,
  },
  entities: (ctx) => {
    const u = unitsIn(ctx).sort((a, b) => b.ei - a.ei);
    return { type: 'aquifer', total: u.length, items: u.map((x) => ({ id: x.id, name: x.name, type: 'aquifer', province: x.province, sub: `EI ${x.ei}` })) };
  },
  entity: (_ctx, id) => {
    const u = AQUIFER_UNITS.find((x) => x.id === id) ?? AQUIFER_UNITS[0];
    return {
      id: u.id,
      name: u.name,
      title: u.name,
      type: 'aquifer',
      province: u.province,
      image: 'aquifer',
      status: { scale: 'exploitation', id: u.eiClass, label: u.eiClass },
      fields: [
        { label: 'Aquifer type', value: u.aquifer.type },
        { label: 'Province', value: provinceName(u.province) },
        { label: 'Surface area', value: u.areaKm2, unit: 'km²' },
        { label: 'Saturated thickness', value: `${u.aquifer.thickness[0]} – ${u.aquifer.thickness[1]} m` },
        { label: 'Transmissivity (T)', value: `${u.aquifer.transmissivity[0]} – ${u.aquifer.transmissivity[1]} m²/day` },
        { label: 'Storativity / specific yield', value: u.aquifer.storativity },
        { label: 'Mean annual recharge', value: u.recharge, unit: 'Mm³/yr' },
        { label: 'Recharge rate', value: u.rechargeMm, unit: 'mm/yr' },
        { label: 'Dynamic reserve', value: u.dynamicReserve, unit: 'Mm³/yr' },
        { label: 'Static reserve', value: u.staticReserve, unit: 'Mm³' },
        { label: 'Ecological reserve', value: u.ecologicalReserve, unit: 'Mm³/yr' },
        { label: 'Current abstraction', value: u.abstraction, unit: 'Mm³/yr' },
        { label: 'Exploitation index', value: u.ei, scale: 'exploitation' },
        { label: 'Sustainable yield', value: u.sustainableYield, unit: 'Mm³/yr' },
        { label: 'Monitoring boreholes', value: u.boreholes },
        { label: 'Data source', value: 'DWS NGA, SAWS, SANSA, CGS' },
      ],
    };
  },
};

