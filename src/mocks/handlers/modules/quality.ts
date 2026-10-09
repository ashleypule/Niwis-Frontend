/** Water Quality (spec §12), Green Drop (§13), Blue Drop / SANS 241 (§14) and RWQO (§15). */
import { EFFLUENT_LIMITS, SANS_241, effluentPass, greenDropBand, blueDropBand, sans241LimitText, sans241Pass } from '@/config/thresholds';
import { SCALES } from '@/config/palettes';
import { Rng } from '@/lib/prng';
import { clamp, mean, quantile, round } from '@/lib/stats';
import { miMonth, miToIso, miYear, monthIndex } from '@/lib/time';
import { PROVINCE_ORDER, municipalityById, provinceName } from '../../reference/regions';
import { END_MI } from '../../generators/climate';
import { WQ_PARAMS, WQ_STATIONS, paramDef, passes, wqNow, wqSamples, wqStationById, wqT, wqiAt, wqComplianceRate, type WqStation } from '../../generators/quality';
import { C_START, DW_PARAMS, EFFLUENT_PARAMS, RWQO_SITES, WSSS, WWTWS, drinking, dwCompliance, effluent, effluentCompliance, plantById, rwqoById, type Plant, type RwqoSite } from '../../generators/compliance';
import { dampedForecast, forecastSeries } from '../../generators/forecast';
import { band, bar, categories, col, kpi, line, monthly, seriesSet, table, type Ctx, type ModuleHandlers } from '../build';
import { choropleth, pointsLayer } from '../common';
import { outlookShift } from './drought';

const LASTC = () => END_MI - 1;
const ct = (mi: number) => mi - C_START;

// =================================================================== Water quality monitoring
const wqIn = (ctx: Ctx) => WQ_STATIONS.filter((s) => ctx.scope.includes(s));
function pickWq(ctx: Ctx): WqStation {
  const id = ctx.q('entityId');
  if (id && wqStationById.has(id)) return wqStationById.get(id)!;
  const list = wqIn(ctx).filter((s) => s.type === 'River');
  return [...(list.length ? list : WQ_STATIONS)].sort((a, b) => b.pressure - a.pressure)[0];
}
const limitOf = (p: string) => paramDef(p).max ?? paramDef(p).min ?? 1;

function wqEntity(s: WqStation) {
  const n = wqNow(s.id);
  return {
    id: s.id,
    name: s.name,
    title: s.name,
    type: 'wq-station',
    province: s.province,
    lat: s.lat,
    lon: s.lon,
    image: (s.type === 'Groundwater' ? 'borehole' : s.type === 'Dam / reservoir' ? 'dam' : 'river') as 'borehole' | 'dam' | 'river',
    status: { scale: 'wqi', id: n.cls, label: `WQI ${n.wqi} – ${n.cls}` },
    fields: [
      { label: 'Water body type', value: s.type },
      { label: 'River / system', value: s.river },
      { label: 'Province', value: provinceName(s.province) },
      { label: 'Municipality', value: municipalityById.get(s.municipality)?.name ?? '—' },
      { label: 'Coordinates', value: `${Math.abs(s.lat).toFixed(2)}° S, ${s.lon.toFixed(2)}° E` },
      { label: 'Dominant pressure', value: s.source },
      { label: 'Water Quality Index', value: n.wqi, scale: 'wqi' },
      { label: 'Guideline compliance (core parameters)', value: `${n.compliance}%` },
      { label: 'Parameters exceeding guideline', value: n.exceedances.length ? n.exceedances.map((e) => paramDef(e).label).join(', ') : 'None' },
      { label: 'Last sample', value: miToIso(LASTC()).slice(0, 8) + '12' },
      { label: 'Sampling frequency', value: 'Monthly (NWQMS)' },
      { label: 'Data source', value: 'DWS NWQMS / accredited labs' },
    ],
  };
}

export const waterQuality: ModuleHandlers = {
  summary: (ctx) => {
    const list = wqIn(ctx);
    const now = list.map((s) => wqNow(s.id));
    const rivers = list.filter((s) => s.type === 'River');
    const dams = list.filter((s) => s.type === 'Dam / reservoir');
    const gw = list.filter((s) => s.type === 'Groundwater');
    const rate = wqComplianceRate(list);
    return [
      kpi('n', 'boreholes', list.length, { label: 'Monitoring Stations', sublabel: 'Surface, dam & groundwater', unit: '' }),
      kpi('comp', 'wqCompliance', rate, { label: 'Compliance Rate', sublabel: 'Stations within guideline' }),
      kpi('exceed', 'stationsExceeding', 100 - rate, { label: 'Stations Exceeding Limits', sublabel: `${list.length - Math.round((rate / 100) * list.length)} stations` }),
      kpi('wqi', 'wqi', mean(now.map((n) => n.wqi)), { label: 'Average WQI', delta: mean(now.map((n) => n.wqi - n.wqiPrev)), deltaUnit: '', deltaLabel: 'vs last year' }),
      kpi('rivers', 'stationsExceeding', rivers.length ? (rivers.filter((s) => wqNow(s.id).wqi < 50).length / rivers.length) * 100 : 0, { label: 'Rivers in Poor Quality', sublabel: `${rivers.filter((s) => wqNow(s.id).wqi < 50).length} river stations (WQI < 50)` }),
      kpi('dams', 'wqCompliance', dams.length ? (dams.filter((s) => wqNow(s.id).wqi >= 70).length / dams.length) * 100 : 0, { label: 'Dams with Good Quality', sublabel: 'WQI ≥ 70' }),
      kpi('gw', 'wqCompliance', wqComplianceRate(gw), { label: 'Groundwater Quality', sublabel: 'Boreholes within guideline' }),
      kpi('risk', 'boreholesAtRisk', now.filter((n) => n.wqi < 40).length, { label: 'High-Risk Stations', sublabel: 'WQI < 40' }),
    ];
  },
  timeseries: {
    'param-trend': (ctx) => {
      const p = ctx.q('param') ?? 'ec';
      const st = pickWq(ctx);
      const s = wqSamples(st.id)[p];
      const y = miYear(ctx.last);
      const d = paramDef(p);
      const yr = (yy: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((n, m) => [n, monthIndex(yy, m) > ctx.last ? null : s[wqT(monthIndex(yy, m))]] as [string, number | null]);
      return {
        id: `wq-${p}`,
        xType: 'category',
        axes: [{ unit: d.unit, label: d.label, log: d.log }],
        series: [line('y0', String(y), yr(y), { color: '#1565C0', symbol: true }), line('y1', String(y - 1), yr(y - 1), { color: '#E53935', dash: true, symbol: true })],
        refLines: [...(d.max != null ? [{ y: d.max, label: 'Guideline (max)' }] : []), ...(d.min != null ? [{ y: d.min, label: 'Guideline (min)', color: '#2E9E5B' }] : [])],
        note: st.name,
      };
    },
    'station-wqi': (ctx) => {
      const st = pickWq(ctx);
      const from = Math.max(monthIndex(2018, 1), Math.min(ctx.from, ctx.to - 23));
      return { ...seriesSet('station-wqi', [{ unit: '', label: 'WQI', min: 0, max: 100 }], [line('w', 'WQI', monthly(from, ctx.to, (mi) => wqiAt(st.id, wqT(mi))), { color: '#1565C0', symbol: true }), line('lt', 'Long-term average', monthly(from, ctx.to, () => mean(Array.from({ length: 24 }, (_, k) => wqiAt(st.id, k)))), { color: '#13233A', dash: true })]), bands: SCALES.wqi.bins.map((b) => ({ from: b.min ?? 0, to: b.max ?? 100, color: b.color, label: b.label })), note: st.name };
    },
    group: (ctx) => {
      const g = ctx.q('group') ?? 'nutrients';
      const params = g === 'metals' ? ['lead', 'arsenic', 'iron', 'manganese'] : g === 'micro' ? ['ecoli'] : ['nitrate', 'phosphate', 'ammonia'];
      const st = pickWq(ctx);
      const s = wqSamples(st.id);
      const from = Math.max(monthIndex(2018, 1), Math.min(ctx.from, ctx.to - 23));
      const cols = ['#1565C0', '#E53935', '#2E9E5B', '#F2A900'];
      const log = g === 'micro' || g === 'metals';
      return { ...seriesSet(`group-${g}`, [{ unit: g === 'micro' ? 'cfu/100 mL' : g === 'metals' ? 'mixed (µg/L, mg/L)' : 'mg/L', label: 'Concentration', log }], params.map((p, k) => line(p, `${paramDef(p).label} (${paramDef(p).unit})`, monthly(from, ctx.to, (mi) => Math.max(0.001, s[p][wqT(mi)])), { color: cols[k], symbol: true }))), refLines: g === 'micro' ? [{ y: 1000, label: 'Guideline 1 000' }] : [], note: st.name };
    },
  },
  breakdown: {
    'param-range': (ctx) => {
      const list = wqIn(ctx);
      const ps = ['ph', 'ec', 'turbidity', 'bod', 'cod', 'nitrate', 'phosphate'];
      const t = wqT(ctx.last);
      const vals = ps.map((p) => list.map((s) => wqSamples(s.id)[p][t]));
      return categories('param-range', 'log scale', ps.map((p) => `${paramDef(p).label} (${paramDef(p).unit})`), [
        { key: 'min', name: 'Minimum', values: vals.map((v) => Math.max(0.01, quantile(v, 0.02))) },
        { key: 'mean', name: 'Average', values: vals.map((v) => mean(v)) },
        { key: 'max', name: 'Maximum', values: vals.map((v) => quantile(v, 0.98)) },
        { key: 'limit', name: 'Guideline', values: ps.map((p) => paramDef(p).max ?? null) },
      ]);
    },
    compliance: (ctx) => {
      const list = wqIn(ctx);
      const c = list.filter((s) => wqNow(s.id).compliant).length;
      return categories('compliance', 'stations', ['Compliant', 'Non-compliant'], [{ key: 'n', name: 'Stations', values: [c, list.length - c] }], { colors: ['#2E9E5B', '#C62828'], center: { value: `${Math.round((c / Math.max(1, list.length)) * 100)}%`, label: 'Compliant' } });
    },
    'by-province': () => {
      const cls = ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'];
      const rows = PROVINCE_ORDER.map((p) => {
        const st = WQ_STATIONS.filter((s) => s.province === p);
        return cls.map((c) => st.filter((s) => wqNow(s.id).cls === c).length);
      });
      return categories('by-province', 'stations', PROVINCE_ORDER.map(provinceName), cls.map((c, k) => ({ key: c, name: c, values: rows.map((r) => r[k]), color: SCALES.wqi.bins.find((b) => b.id === c)!.color, stack: 's' })));
    },
    'by-type': (ctx) => {
      const types = ['River', 'Dam / reservoir', 'Wetland', 'Groundwater', 'Estuary'] as const;
      const list = wqIn(ctx);
      return categories('by-type', 'stations', [...types], [{ key: 'n', name: 'Stations', values: types.map((t) => list.filter((s) => s.type === t).length) }], { colors: ['#1565C0', '#2E9E5B', '#8E44AD', '#F2A900', '#0FA3B1'], center: { value: String(list.length), label: 'Stations' } });
    },
    'wqi-distribution': (ctx) => {
      const list = wqIn(ctx).map((s) => wqNow(s.id).wqi);
      const bins = SCALES.wqi.bins;
      return categories('wqi-distribution', 'stations', bins.map((b) => b.label), [{ key: 'n', name: 'Stations', values: bins.map((b) => list.filter((v) => v >= (b.min ?? 0) && v < (b.max ?? 101)).length) }], { colors: bins.map((b) => b.color) });
    },
    'param-compliance': (ctx) => {
      const list = wqIn(ctx);
      const t = wqT(ctx.last);
      const ps = ['ph', 'do', 'ec', 'turbidity', 'nitrate', 'phosphate', 'ecoli', 'cod'];
      const v = ps.map((p) => (list.filter((s) => passes(p, wqSamples(s.id)[p][t])).length / Math.max(1, list.length)) * 100);
      return categories('param-compliance', '%', ps.map((p) => paramDef(p).label), [{ key: 'v', name: 'Stations within guideline', values: v }], { colors: v.map((x) => (x >= 85 ? '#2E9E5B' : x >= 70 ? '#8BC34A' : x >= 55 ? '#F2A900' : '#E4572E')) });
    },
  },
  table: {
    hotspots: (ctx) => {
      const rows: Record<string, string | number | null>[] = [];
      wqIn(ctx).forEach((s) => {
        const n = wqNow(s.id);
        n.exceedances.forEach((p) => {
          const lim = limitOf(p);
          rows.push({ location: s.name.replace(/ \(.*\)$/, ''), body: s.type, parameter: paramDef(p).label, value: n.latest[p], limit: lim, ratio: n.latest[p] / lim, status: n.latest[p] / lim > 3 ? 'High' : 'Moderate' });
        });
      });
      rows.sort((a, b) => Number(b.ratio) - Number(a.ratio));
      return table('hotspots', [col.rank(), col.text('location', 'Location'), col.text('body', 'Water body'), col.text('parameter', 'Parameter'), col.num('value', 'Value', '', 2), col.num('limit', 'Limit', '', 3), col.cls('status', 'Status', 'risk')], rows.slice(0, 10));
    },
    latest: (ctx) => {
      const st = pickWq(ctx);
      const n = wqNow(st.id);
      return table('latest', [col.text('p', 'Parameter'), col.num('v', 'Value', '', 3), col.text('u', 'Unit'), col.text('g', 'Guideline'), col.cls('s', 'Status', 'pass')], WQ_PARAMS.map((p) => ({ p: p.label, v: n.latest[p.id], u: p.unit, g: p.min != null && p.max != null ? `${p.min}–${p.max}` : p.max != null ? `≤ ${p.max}` : `≥ ${p.min}`, s: passes(p.id, n.latest[p.id]) ? 'Compliant' : 'Non-compliant' })));
    },
    ranking: (ctx) => {
      const worst = ctx.q('order') === 'poorest';
      const rows = wqIn(ctx)
        .map((s) => ({ s, n: wqNow(s.id) }))
        .sort((a, b) => (worst ? a.n.wqi - b.n.wqi : b.n.wqi - a.n.wqi))
        .slice(0, 8)
        .map(({ s, n }) => ({ id: s.id, station: s.name.replace(/ \(.*\)$/, ''), river: s.river, wqi: n.wqi, cls: n.cls, trend: n.wqi - n.wqiPrev }));
      return table('ranking', [col.rank(), col.text('station', 'Station'), col.text('river', 'River'), col.num('wqi', 'WQI', '', 0, { scale: 'wqi' }), col.cls('cls', 'Status', 'wqi'), col.trend('trend', 'Trend', 'up', '', 0)], rows, { rowKey: 'id' });
    },
    counts: (ctx) => {
      const list = wqIn(ctx);
      const types = ['River', 'Dam / reservoir', 'Groundwater', 'Estuary', 'Wetland'] as const;
      return table('counts', [col.text('type', 'Type'), col.num('n', 'Count'), col.num('c', 'Compliant', '%')], types.map((t) => {
        const l = list.filter((s) => s.type === t);
        return { type: t === 'River' ? 'Rivers / streams' : t === 'Dam / reservoir' ? 'Dams / reservoirs' : t === 'Groundwater' ? 'Groundwater (boreholes)' : t === 'Estuary' ? 'Estuaries / coastal' : 'Wetlands', n: l.length, c: wqComplianceRate(l) };
      }));
    },
    'forecast-indicators': (ctx) => {
      const list = wqIn(ctx);
      const t = wqT(ctx.last);
      const m = (p: string) => mean(list.map((s) => wqSamples(s.id)[p][t]));
      const wqi = mean(list.map((s) => wqNow(s.id).wqi));
      const sh = outlookShift(ctx.scope.key);
      const rows = [
        { ind: 'Water Quality Index', cur: wqi, f: (h: number) => wqi + h * 0.35 + sh * 2, dec: 0 },
        { ind: 'Nitrate (mg/L)', cur: m('nitrate'), f: (h: number) => m('nitrate') * (1 - h * 0.015), dec: 2 },
        { ind: 'Phosphate (mg/L)', cur: m('phosphate'), f: (h: number) => m('phosphate') * (1 - h * 0.012), dec: 3 },
        { ind: 'Turbidity (NTU)', cur: m('turbidity'), f: (h: number) => m('turbidity') * (1 + 0.25 * Math.sin(((miMonth(ctx.last + h) - 1) / 12) * 2 * Math.PI)), dec: 1 },
        { ind: 'Dissolved oxygen (mg/L)', cur: m('do'), f: (h: number) => m('do') + h * 0.02, dec: 1 },
        { ind: 'EC (mS/m)', cur: m('ec'), f: (h: number) => m('ec') * (1 - h * 0.004), dec: 0 },
        { ind: 'E. coli (cfu/100 mL, median)', cur: quantile(list.map((s) => wqSamples(s.id).ecoli[t]), 0.5), f: (h: number) => quantile(list.map((s) => wqSamples(s.id).ecoli[t]), 0.5) * (1 - h * 0.02), dec: 0 },
      ];
      return table('forecast-indicators', [col.text('ind', 'Indicator'), col.num('cur', 'Current', '', 2), col.num('h3', '3 months', '', 2), col.num('h6', '6 months', '', 2), col.num('h12', '12 months', '', 2), col.num('h24', '24 months', '', 2)], rows.map((r) => ({ ind: r.ind, cur: round(r.cur, r.dec), h3: round(r.f(3), r.dec), h6: round(r.f(6), r.dec), h12: round(r.f(12), r.dec), h24: round(r.f(24), r.dec) })));
    },
  },
  map: {
    wqi: () => pointsLayer('wqi', 'Water Quality Index', 'wqi', '', WQ_STATIONS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, value: wqNow(s.id).wqi, size: 0.25, kind: 'wq', sub: s.type }))),
    ...Object.fromEntries(['ph', 'do', 'ec', 'turbidity', 'nitrate', 'phosphate', 'ammonia', 'bod', 'cod', 'ecoli', 'lead'].map((p) => [p, () => {
      const d = paramDef(p);
      const ratio = (v: number) => (p === 'ph' ? Math.abs(v - 7.5) / 1.5 : p === 'do' ? (d.min ?? 5) / Math.max(0.5, v) : v / (d.max ?? 1));
      return pointsLayer(p, `${d.label} relative to guideline`, 'ratio', '× guideline', WQ_STATIONS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, value: round(ratio(wqNow(s.id).latest[p]), 2), size: 0.25, kind: 'wq', sub: `${round(wqNow(s.id).latest[p], d.decimals)} ${d.unit}` })));
    }])),
    'forecast-wqi': () => pointsLayer('forecast-wqi', 'WQI forecast (12 months)', 'wqi', '', WQ_STATIONS.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, value: clamp(Math.round(wqNow(s.id).wqi + new Rng(`wqf-${s.id}`).normal(3, 6)), 0, 100), size: 0.25, kind: 'wq' }))),
  },
  entities: (ctx) => {
    const list = wqIn(ctx).sort((a, b) => a.name.localeCompare(b.name));
    return { type: 'wq-station', total: list.length, items: list.map((s) => ({ id: s.id, name: s.name, type: 'wq-station', province: s.province, lat: s.lat, lon: s.lon, sub: s.type })) };
  },
  entity: (_ctx, id) => wqEntity(wqStationById.get(id) ?? WQ_STATIONS[0]),
  forecast: {
    wqi: (ctx) => {
      const list = wqIn(ctx).slice(0, 400);
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 17; mi <= ctx.last; mi++) hist.push([mi, mean(list.map((s) => wqiAt(s.id, wqT(mi))))]);
      const fc = dampedForecast(`wqi-${ctx.scope.key}`, hist[hist.length - 1][1] ?? 60, { mu: (hist[hist.length - 1][1] ?? 60) + 4, phi: 0.92, sigma: 7, horizon: Number(ctx.q('horizon') ?? 12), startMi: ctx.last, min: 0, max: 100 });
      const f = forecastSeries(hist, fc);
      return seriesSet('wqi-forecast', [{ unit: '', label: 'WQI (0–100)', min: 0, max: 100 }], [band('band', f.names.band, f.band, { color: '#90CAF9' }), line('obs', 'Historical', f.observed, { color: '#13233A', symbol: true }), line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true })], { asOf: miToIso(ctx.last) });
    },
    params: (ctx) => {
      const list = wqIn(ctx).slice(0, 400);
      const ps = ['nitrate', 'phosphate', 'turbidity'];
      const series = ps.flatMap((p, k) => {
        const hist: [number, number | null][] = [];
        for (let mi = ctx.last - 11; mi <= ctx.last; mi++) hist.push([mi, mean(list.map((s) => wqSamples(s.id)[p][wqT(mi)]))]);
        const x0 = hist[hist.length - 1][1] ?? 1;
        const fc = dampedForecast(`wqp-${p}-${ctx.scope.key}`, x0, { mu: x0 * 0.9, phi: 0.9, sigma: x0 * 0.25, horizon: 12, startMi: ctx.last, min: 0 });
        const f = forecastSeries(hist, fc);
        const color = ['#1565C0', '#8E44AD', '#F2A900'][k];
        return [line(`${p}-o`, `${paramDef(p).label} (${paramDef(p).unit})`, f.observed, { color }), line(`${p}-f`, `${paramDef(p).label} forecast`, f.median, { color, dash: true })];
      });
      return seriesSet('params-forecast', [{ unit: 'mg/L or NTU', label: 'Concentration' }], series, { asOf: miToIso(ctx.last) });
    },
    'ecoli-catchment': (ctx) => {
      const st = pickWq(ctx);
      const s = wqSamples(st.id).ecoli;
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 11; mi <= ctx.last; mi++) hist.push([mi, s[wqT(mi)]]);
      const x0 = quantile(hist.map((h) => h[1] ?? 0), 0.5);
      const fc = dampedForecast(`ecf-${st.id}`, x0, { mu: x0 * 0.85, phi: 0.85, sigma: x0 * 0.6, horizon: 12, startMi: ctx.last, min: 0 });
      const f = forecastSeries(hist, fc);
      return seriesSet('ecoli-forecast', [{ unit: 'cfu/100 mL', label: 'E. coli' }], [band('band', f.names.band, f.band, { color: '#90CAF9' }), line('obs', 'Historical', f.observed, { color: '#13233A', symbol: true }), line('median', f.names.median, f.median, { color: '#E53935', dash: true })], { asOf: miToIso(ctx.last), note: st.name, refLines: [{ y: 1000, label: 'Guideline' }] });
    },
  },
};

waterQuality.breakdown!['risk-outlook'] = (ctx) => {
  const months = Array.from({ length: 12 }, (_, k) => ctx.last + 1 + k);
  const list = wqIn(ctx).slice(0, 400);
  const base = ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'].map((c) => list.filter((s) => wqNow(s.id).cls === c).length / Math.max(1, list.length));
  return categories('risk-outlook', '%', months.map((mi) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][miMonth(mi)]), ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'].map((c, k) => ({ key: c, name: c, stack: 's', color: SCALES.wqi.bins.find((b) => b.id === c)!.color, values: months.map((mi, h) => {
    const wet = [0, 1, 2, 10, 11].includes(miMonth(mi)) ? 1 : 0;
    const shift = (h * 0.004 - wet * 0.03) * (k <= 1 ? 1 : -1);
    return clamp((base[k] + shift) * 100, 0, 100);
  }) })));
};

// =================================================================== Green Drop
const wwIn = (ctx: Ctx) => WWTWS.filter((p) => ctx.scope.includes(p));
function pickPlant(ctx: Ctx, list: Plant[]): Plant {
  const id = ctx.q('entityId');
  if (id && plantById.has(id)) return plantById.get(id)!;
  return [...(list.length ? list : WWTWS)].sort((a, b) => b.capacityMld - a.capacityMld)[0];
}
const BANDS = ['Excellent', 'Good', 'Moderate', 'Poor', 'Critical'];
const bandColors = (scale: 'greenDrop' | 'blueDrop') => BANDS.map((b) => SCALES[scale].bins.find((x) => x.id === b)!.color);

function plantEntity(p: Plant) {
  const wwtw = p.kind === 'wwtw';
  const band = wwtw ? greenDropBand(p.score) : blueDropBand(p.score);
  return {
    id: p.id,
    name: p.name,
    title: `${p.name} (${p.municipalityName})`,
    type: p.kind,
    province: p.province,
    lat: p.lat,
    lon: p.lon,
    image: (wwtw ? 'wwtw' : 'wtp') as 'wwtw' | 'wtp',
    status: { scale: wwtw ? 'greenDrop' : 'blueDrop', id: band, label: `${p.score}% (${band})` },
    fields: [
      { label: wwtw ? 'WWTW name' : 'System name', value: p.name },
      { label: 'Municipality (WSA)', value: p.municipalityName },
      { label: 'Province', value: provinceName(p.province) },
      { label: 'Coordinates', value: `${Math.abs(p.lat).toFixed(2)}° S, ${p.lon.toFixed(2)}° E` },
      { label: 'Design capacity', value: p.capacityMld, unit: 'Ml/day' },
      { label: wwtw ? 'Current treated flow' : 'Current production', value: `${p.flowMld} Ml/day (${Math.round((p.flowMld / p.capacityMld) * 100)}%)` },
      { label: 'Treatment process', value: p.process },
      ...(wwtw ? [{ label: 'Receiving water body', value: p.receiving ?? '—' }, { label: 'Discharge permit', value: 'Yes (DWS General Authorisation)' }] : [{ label: 'Source', value: p.source ?? '—' }, { label: 'Population served', value: p.populationServed }]),
      { label: `${wwtw ? 'Green' : 'Blue'} Drop score`, value: `${p.score}% (${band})` },
      { label: 'Previous score', value: `${p.scorePrev}%` },
      { label: 'Monthly compliance (latest)', value: `${round(wwtw ? effluentCompliance(p.id) : dwCompliance(p.id), 0)}%` },
      { label: 'Samples per month', value: p.samplesPerMonth },
      { label: 'Data source', value: wwtw ? 'DWS Green Drop / WWTW returns' : 'DWS Blue Drop / Regulation 813' },
    ],
  };
}

function scoreTrend(list: Plant[], kind: 'wwtw' | 'wss', y0: number) {
  const years = Array.from({ length: 9 }, (_, k) => y0 - 8 + k);
  return years.map((y) => {
    const scores = list.map((p) => {
      const r = new Rng(`hist-${p.id}-${y}`);
      return clamp(p.score - (y0 - y) * (p.score - p.scorePrev) * 0.4 + r.normal(0, 4) - (y0 - y) * (kind === 'wwtw' ? 0.9 : 0.6), 0, 100);
    });
    const b = (fn: (s: number) => string) => BANDS.map((x) => scores.filter((s) => fn(s) === x).length);
    return { year: y, rate: mean(scores), bands: b(kind === 'wwtw' ? greenDropBand : blueDropBand) };
  });
}

export const greenDrop: ModuleHandlers = {
  summary: (ctx) => {
    const list = wwIn(ctx);
    const cnt = (b: string) => list.filter((p) => greenDropBand(p.score) === b).length;
    const cap = list.reduce((a, p) => a + p.capacityMld, 0);
    const flow = list.reduce((a, p) => a + p.flowMld, 0);
    return [
      kpi('n', 'boreholes', list.length, { label: 'Total WWTWs', sublabel: s(ctx), unit: '' }),
      kpi('rate', 'greenDropScore', mean(list.map((p) => p.score)), { label: 'Compliance Rate (Green Drop)', sublabel: 'Mean risk-adjusted score', delta: mean(list.map((p) => p.score - p.scorePrev)), deltaUnit: ' pp', deltaLabel: 'vs last assessment' }),
      kpi('good', 'complianceRate', cnt('Excellent') + cnt('Good'), { label: 'Excellent / Good', sublabel: `${Math.round(((cnt('Excellent') + cnt('Good')) / Math.max(1, list.length)) * 100)}% of plants`, unit: '' }),
      kpi('moderate', 'damsBelow', cnt('Moderate'), { label: 'At Risk (Moderate)', sublabel: `${Math.round((cnt('Moderate') / Math.max(1, list.length)) * 100)}% of plants` }),
      kpi('non', 'damsBelow', cnt('Poor') + cnt('Critical'), { label: 'Non-compliant (Poor / Critical)', sublabel: `${Math.round(((cnt('Poor') + cnt('Critical')) / Math.max(1, list.length)) * 100)}% of plants` }),
      kpi('cap', 'capacity', cap, { label: 'Total Design Capacity', unit: 'Ml/day' }),
      kpi('flow', 'inflow', flow, { label: 'Total Treated Flow', unit: 'Ml/day', sublabel: `${Math.round((flow / cap) * 100)}% utilisation` }),
      kpi('impact', 'wqi', null, { label: 'Receiving Water Impact', text: mean(list.map((p) => p.score)) >= 60 ? 'Low' : mean(list.map((p) => p.score)) >= 45 ? 'Moderate' : 'High', status: { scale: 'risk', id: mean(list.map((p) => p.score)) >= 60 ? 'Low' : mean(list.map((p) => p.score)) >= 45 ? 'Moderate' : 'High', label: 'Downstream risk' } }),
    ];
  },
  timeseries: {
    trend: (ctx) => {
      const tr = scoreTrend(wwIn(ctx), 'wwtw', miYear(ctx.last));
      return {
        id: 'gd-trend',
        xType: 'category',
        axes: [{ unit: 'WWTWs', label: 'Number of plants' }, { unit: '%', label: 'Compliance rate', min: 0, max: 100 }],
        series: [
          bar('eg', 'Excellent / Good', tr.map((x) => [String(x.year), x.bands[0] + x.bands[1]]), { color: '#1B7F3B', stack: 's' }),
          bar('m', 'Moderate', tr.map((x) => [String(x.year), x.bands[2]]), { color: '#F6CF3E', stack: 's' }),
          bar('pc', 'Poor / Critical', tr.map((x) => [String(x.year), x.bands[3] + x.bands[4]]), { color: '#D7301F', stack: 's' }),
          line('rate', 'Compliance rate (%)', tr.map((x) => [String(x.year), x.rate]), { axis: 1, color: '#1565C0', symbol: true }),
        ],
      };
    },
    capacity: (ctx) => {
      const p = pickPlant(ctx, wwIn(ctx));
      const r = new Rng(`cap-${p.id}`);
      const from = Math.max(C_START, ctx.last - 23);
      const flow = monthly(from, ctx.last, (mi) => p.flowMld * (1 + 0.12 * Math.cos(((miMonth(mi) - 0.5) / 12) * 2 * Math.PI)) * r.range(0.92, 1.08));
      return seriesSet('gd-capacity', [{ unit: 'Ml/day', label: 'Flow' }, { unit: '%', label: 'Utilisation', min: 0 }], [bar('cap', 'Design capacity', flow.map(([x]) => [x, p.capacityMld]), { color: '#B0BEC5' }), bar('flow', 'Treated flow', flow, { color: '#1565C0' }), line('u', 'Utilisation (%)', flow.map(([x, y]) => [x, ((y ?? 0) / p.capacityMld) * 100]), { axis: 1, color: '#E53935', symbol: true })], { note: p.name });
    },
    effluent: (ctx) => {
      const p = pickPlant(ctx, wwIn(ctx));
      const e = effluent(p.id);
      const from = Math.max(C_START, ctx.last - 23);
      return { ...seriesSet('gd-effluent', [{ unit: 'mg/L', label: 'Concentration' }], [bar('bod', 'BOD₅ (mg/L)', monthly(from, ctx.last, (mi) => e.bod[ct(mi)]), { color: '#1565C0' }), line('cod', 'COD (mg/L)', monthly(from, ctx.last, (mi) => e.cod[ct(mi)]), { color: '#F2A900' }), line('nh3', 'Ammonia (mg/L)', monthly(from, ctx.last, (mi) => e.ammonia[ct(mi)]), { color: '#2E9E5B' })]), refLines: [{ y: 75, label: 'COD limit 75' }, { y: 30, label: 'BOD limit 30', color: '#1565C0' }], note: p.name };
    },
    micro: (ctx) => {
      const p = pickPlant(ctx, wwIn(ctx));
      const e = effluent(p.id);
      const from = Math.max(C_START, ctx.last - 23);
      return { ...seriesSet('gd-micro', [{ unit: 'cfu/100 mL', label: 'Count', log: true }], [bar('ec', 'E. coli', monthly(from, ctx.last, (mi) => Math.max(1, e.ecoli[ct(mi)])), { color: '#E53935' }), line('fc', 'Faecal coliforms', monthly(from, ctx.last, (mi) => Math.max(1, e.faecal[ct(mi)])), { color: '#1565C0' })]), refLines: [{ y: 1000, label: 'Limit 1 000' }], note: p.name };
    },
    receiving: (ctx) => {
      const p = pickPlant(ctx, wwIn(ctx));
      const st = [...WQ_STATIONS].filter((s) => s.type === 'River').sort((a, b) => (a.lat - p.lat) ** 2 + (a.lon - p.lon) ** 2 - ((b.lat - p.lat) ** 2 + (b.lon - p.lon) ** 2))[0];
      const s = wqSamples(st.id);
      const from = Math.max(C_START, ctx.last - 23);
      return seriesSet('gd-receiving', [{ unit: 'mg/L', label: 'Concentration' }], [line('do', 'Dissolved oxygen', monthly(from, ctx.last, (mi) => s.do[wqT(mi)]), { color: '#1565C0', symbol: true }), line('nh3', 'Ammonia', monthly(from, ctx.last, (mi) => s.ammonia[wqT(mi)]), { color: '#F2A900' }), line('no3', 'Nitrate', monthly(from, ctx.last, (mi) => s.nitrate[wqT(mi)]), { color: '#2E9E5B' })], { note: `Downstream: ${st.name}` });
    },
  },
  breakdown: {
    breakdown: (ctx) => {
      const list = wwIn(ctx);
      return categories('gd-breakdown', 'plants', BANDS, [{ key: 'n', name: 'WWTWs', values: BANDS.map((b) => list.filter((p) => greenDropBand(p.score) === b).length) }], { colors: bandColors('greenDrop'), center: { value: String(list.length), label: 'WWTWs' } });
    },
    'by-province': () => categories('gd-prov', '%', PROVINCE_ORDER, [{ key: 'v', name: 'Mean Green Drop score', values: PROVINCE_ORDER.map((p) => mean(WWTWS.filter((w) => w.province === p).map((w) => w.score))) }], { colors: PROVINCE_ORDER.map((p) => SCALES.greenDrop.bins.find((b) => b.id === greenDropBand(mean(WWTWS.filter((w) => w.province === p).map((w) => w.score))))!.color) }),
  },
  table: {
    latest: (ctx) => {
      const p = pickPlant(ctx, wwIn(ctx));
      const e = effluent(p.id);
      const t = ct(ctx.last);
      return table('gd-latest', [col.text('p', 'Parameter'), col.num('v', 'Value', '', 1), col.text('u', 'Unit'), col.text('l', 'Limit / objective'), col.cls('s', 'Status', 'pass')], EFFLUENT_PARAMS.map((k) => {
        const l = EFFLUENT_LIMITS[k];
        return { p: l.label, v: e[k][t], u: l.unit, l: l.min != null ? `${l.min}–${l.max}` : `≤ ${l.max}`, s: effluentPass(k, e[k][t]) ? 'Compliant' : 'Non-compliant' };
      }));
    },
    ranking: (ctx) => {
      const worst = ctx.q('order') === 'bottom';
      const rows = [...wwIn(ctx)].sort((a, b) => (worst ? a.score - b.score : b.score - a.score)).slice(0, 5).map((p) => ({ id: p.id, name: p.name, municipality: p.municipalityName, score: p.score, band: greenDropBand(p.score) }));
      return table('gd-ranking', [col.rank(), col.text('name', 'WWTW'), col.text('municipality', 'Municipality'), col.num('score', 'Score', '%', 0, { scale: 'greenDrop' }), col.cls('band', 'Status', 'greenDrop')], rows, { rowKey: 'id' });
    },
  },
  map: {
    compliance: () => pointsLayer('compliance', 'Green Drop score (%)', 'greenDrop', '%', WWTWS.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, value: p.score, size: Math.min(1, Math.log10(p.capacityMld + 1) / 2.6), kind: 'wwtw', sub: p.municipalityName }))),
    utilisation: () => pointsLayer('utilisation', 'Hydraulic utilisation (%)', 'nrw', '%', WWTWS.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, value: round((p.flowMld / p.capacityMld) * 100 - 50, 0), size: Math.min(1, Math.log10(p.capacityMld + 1) / 2.6), kind: 'wwtw', sub: `${Math.round((p.flowMld / p.capacityMld) * 100)}% of design capacity` }))),
    municipal: () => choropleth('municipal', 'Mean Green Drop score by municipality (%)', 'municipality', 'greenDrop', '%', (id) => { const l = WWTWS.filter((p) => p.municipality === id); return l.length ? mean(l.map((p) => p.score)) : null; }, 0),
  },
  entities: (ctx) => ({ type: 'wwtw', total: wwIn(ctx).length, items: [...wwIn(ctx)].sort((a, b) => b.capacityMld - a.capacityMld).map((p) => ({ id: p.id, name: p.name, type: 'wwtw', province: p.province, lat: p.lat, lon: p.lon, sub: p.municipalityName })) }),
  entity: (_ctx, id) => plantEntity(plantById.get(id) ?? WWTWS[0]),
};
function s(ctx: Ctx) {
  return ctx.scope.level === 'national' ? 'National' : ctx.scope.name;
}

// =================================================================== Blue Drop
const wsIn = (ctx: Ctx) => WSSS.filter((p) => ctx.scope.includes(p));
export const blueDrop: ModuleHandlers = {
  summary: (ctx) => {
    const list = wsIn(ctx);
    const wtp = list.filter((p) => !p.process.startsWith('Borehole')).length;
    const pop = list.reduce((a, p) => a + p.populationServed, 0);
    const rate = mean(list.map((p) => p.score));
    return [
      kpi('n', 'boreholes', list.length, { label: 'Water Supply Systems', sublabel: s(ctx), unit: '' }),
      kpi('rate', 'blueDropScore', rate, { label: 'Blue Drop Compliance Rate', sublabel: 'Mean risk-adjusted score', delta: mean(list.map((p) => p.score - p.scorePrev)), deltaUnit: ' pp', deltaLabel: 'vs last assessment' }),
      kpi('risk', 'damsBelow', list.filter((p) => p.score < 50).length, { label: 'Systems at High Risk', sublabel: 'Score < 50%' }),
      kpi('wtp', 'boreholes', wtp, { label: 'Treatment Plants', sublabel: 'Excluding borehole-only systems', unit: '' }),
      kpi('samples', 'recordsIngested', list.reduce((a, p) => a + p.samplesPerMonth, 0) * 12 * DW_PARAMS.length, { label: 'Samples Analysed', sublabel: 'Last 12 months (all determinands)', unit: '' }),
      kpi('micro', 'wqCompliance', (list.filter((p) => drinking(p.id).ecoli[ct(ctx.last)] === 0).length / Math.max(1, list.length)) * 100, { label: 'Microbiological Compliance', sublabel: 'E. coli = 0 cfu/100 mL' }),
      kpi('pop', 'populationServed', pop / 1e6, { label: 'Population Served', unit: 'million', decimals: 1 }),
      kpi('status', 'wqi', null, { label: 'Overall Drinking Water Status', text: rate >= 85 ? 'Good' : rate >= 70 ? 'Fair' : 'Poor', status: { scale: 'wq', id: rate >= 85 ? 'Good' : rate >= 70 ? 'Fair' : 'Poor', label: s(ctx) } }),
    ];
  },
  timeseries: {
    trend: (ctx) => {
      const tr = scoreTrend(wsIn(ctx), 'wss', miYear(ctx.last));
      return {
        id: 'bd-trend',
        xType: 'category',
        axes: [{ unit: 'systems', label: 'Number of systems' }, { unit: '%', label: 'Compliance rate', min: 0, max: 100 }],
        series: [bar('eg', 'Excellent / Good', tr.map((x) => [String(x.year), x.bands[0] + x.bands[1]]), { color: '#1F6FD1', stack: 's' }), bar('m', 'Moderate', tr.map((x) => [String(x.year), x.bands[2]]), { color: '#F6CF3E', stack: 's' }), bar('pc', 'Poor / Critical', tr.map((x) => [String(x.year), x.bands[3] + x.bands[4]]), { color: '#D7301F', stack: 's' }), line('rate', 'Compliance rate (%)', tr.map((x) => [String(x.year), x.rate]), { axis: 1, color: '#13233A', symbol: true })],
      };
    },
    params: (ctx) => {
      const g = ctx.q('group') ?? 'key';
      const p = pickPlant(ctx, wsIn(ctx));
      const d = drinking(p.id);
      const from = Math.max(C_START, ctx.last - 23);
      const sets: Record<string, [string, string, string][]> = {
        key: [['ph', 'pH', '#1565C0'], ['turbidity', 'Turbidity (NTU)', '#F2A900'], ['freeChlorine', 'Free chlorine (mg/L)', '#2E9E5B']],
        micro: [['ecoli', 'E. coli (cfu/100 mL)', '#E53935'], ['totalColiforms', 'Total coliforms (cfu/100 mL)', '#1565C0']],
        nutrients: [['nitrate', 'Nitrate (mg/L)', '#1565C0'], ['fluoride', 'Fluoride (mg/L)', '#F2A900'], ['ec', 'EC (mS/m ÷ 10)', '#2E9E5B']],
        metals: [['arsenic', 'Arsenic (µg/L)', '#1565C0'], ['lead', 'Lead (µg/L)', '#E53935'], ['thm', 'Total THMs (µg/L ÷ 10)', '#2E9E5B']],
      };
      const scale = (k: string, v: number) => (k === 'ec' ? v / 10 : k === 'arsenic' || k === 'lead' ? v * 1000 : k === 'thm' ? v * 100 : v);
      const log = g === 'micro';
      return { ...seriesSet(`bd-${g}`, [{ unit: g === 'micro' ? 'cfu/100 mL' : g === 'metals' ? 'µg/L' : 'mixed', label: 'Value', log }], sets[g].map(([k, n, c]) => line(k, n, monthly(from, ctx.last, (mi) => (log ? Math.max(0.5, d[k][ct(mi)]) : scale(k, d[k][ct(mi)]))), { color: c, symbol: true }))), refLines: g === 'key' ? [{ y: 1, label: 'Turbidity ≤ 1 NTU' }] : g === 'metals' ? [{ y: 10, label: 'As / Pb ≤ 10 µg/L' }] : [], note: p.name };
    },
    performance: (ctx) => {
      const p = pickPlant(ctx, wsIn(ctx));
      const r = new Rng(`perf-${p.id}`);
      const from = Math.max(C_START, ctx.last - 23);
      const infl = monthly(from, ctx.last, (mi) => p.flowMld * 1.06 * (1 + 0.1 * Math.cos(((miMonth(mi) - 0.5) / 12) * 2 * Math.PI)) * r.range(0.95, 1.05));
      return seriesSet('bd-perf', [{ unit: 'Ml/day', label: 'Flow' }, { unit: '%', label: 'Utilisation', min: 0 }], [bar('in', 'Influent flow', infl, { color: '#1565C0' }), bar('tr', 'Treated flow', infl.map(([x, y]) => [x, (y ?? 0) * 0.95]), { color: '#2E9E5B' }), line('u', 'Utilisation (%)', infl.map(([x, y]) => [x, ((y ?? 0) * 0.95 / p.capacityMld) * 100]), { axis: 1, color: '#E53935', symbol: true })], { note: p.name });
    },
  },
  breakdown: {
    breakdown: (ctx) => {
      const list = wsIn(ctx);
      return categories('bd-breakdown', 'systems', BANDS, [{ key: 'n', name: 'Systems', values: BANDS.map((b) => list.filter((p) => blueDropBand(p.score) === b).length) }], { colors: bandColors('blueDrop'), center: { value: list.length.toLocaleString('en-ZA').replace(/,/g, ' '), label: 'Systems' } });
    },
    'by-province': () => categories('bd-prov', '%', PROVINCE_ORDER, [{ key: 'v', name: 'Mean Blue Drop score', values: PROVINCE_ORDER.map((p) => mean(WSSS.filter((w) => w.province === p).map((w) => w.score))) }], { colors: PROVINCE_ORDER.map((p) => SCALES.blueDrop.bins.find((b) => b.id === blueDropBand(mean(WSSS.filter((w) => w.province === p).map((w) => w.score))))!.color) }),
    'param-compliance': (ctx) => {
      const list = wsIn(ctx);
      const t = ct(ctx.last);
      const v = DW_PARAMS.map((k) => (list.filter((p) => sans241Pass(k, drinking(p.id)[k][t])).length / Math.max(1, list.length)) * 100);
      return categories('bd-param', '%', DW_PARAMS.map((k) => SANS_241.find((x) => x.id === k)?.label ?? k), [{ key: 'v', name: 'Systems compliant (SANS 241)', values: v }], { colors: v.map((x) => (x >= 97 ? '#1F6FD1' : x >= 90 ? '#2E9E5B' : x >= 80 ? '#F2A900' : '#E4572E')) });
    },
  },
  table: {
    latest: (ctx) => {
      const p = pickPlant(ctx, wsIn(ctx));
      const d = drinking(p.id);
      const t = ct(ctx.last);
      return table('bd-latest', [col.text('p', 'Parameter'), col.num('v', 'Result', '', 3), col.text('u', 'Unit'), col.text('l', 'SANS 241 limit'), col.cls('s', 'Compliance', 'pass'), col.date('d', 'Sample date')], DW_PARAMS.map((k) => {
        const l = SANS_241.find((x) => x.id === k)!;
        return { p: l.label, v: d[k][t], u: l.unit, l: sans241LimitText(k), s: sans241Pass(k, d[k][t]) ? 'Compliant' : 'Non-compliant', d: miToIso(ctx.last).slice(0, 8) + '12' };
      }));
    },
    ranking: (ctx) => {
      const worst = ctx.q('order') === 'bottom';
      const rows = [...wsIn(ctx)].sort((a, b) => (worst ? a.score - b.score : b.score - a.score)).slice(0, 5).map((p) => ({ id: p.id, name: p.name, municipality: p.municipalityName, score: p.score, band: blueDropBand(p.score) }));
      return table('bd-ranking', [col.rank(), col.text('name', 'System'), col.text('municipality', 'Municipality'), col.num('score', 'Score', '%', 0, { scale: 'blueDrop' }), col.cls('band', 'Status', 'blueDrop')], rows, { rowKey: 'id' });
    },
  },
  map: {
    compliance: () => pointsLayer('compliance', 'Blue Drop score (%)', 'blueDrop', '%', WSSS.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, value: p.score, size: Math.min(1, Math.log10(p.capacityMld + 1) / 2.6), kind: 'wss', sub: p.municipalityName }))),
    ecoli: () => pointsLayer('ecoli', 'Microbiological compliance (E. coli)', 'pass', '', WSSS.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, value: drinking(p.id).ecoli[ct(LASTC())] === 0 ? 'Compliant' : 'Non-compliant', size: 0.25, kind: 'wss' }))),
    municipal: () => choropleth('municipal', 'Mean Blue Drop score by municipality (%)', 'municipality', 'blueDrop', '%', (id) => { const l = WSSS.filter((p) => p.municipality === id); return l.length ? mean(l.map((p) => p.score)) : null; }, 0),
  },
  entities: (ctx) => ({ type: 'wss', total: wsIn(ctx).length, items: [...wsIn(ctx)].sort((a, b) => b.capacityMld - a.capacityMld).map((p) => ({ id: p.id, name: p.name, type: 'wss', province: p.province, lat: p.lat, lon: p.lon, sub: p.municipalityName })) }),
  entity: (_ctx, id) => plantEntity(plantById.get(id) ?? WSSS[0]),
};

// =================================================================== RWQO (spec §15)
const rwIn = (ctx: Ctx) => RWQO_SITES.filter((x) => ctx.scope.includes(x.station));
function pickSite(ctx: Ctx): RwqoSite {
  const id = ctx.q('entityId');
  return (id && rwqoById.get(id)) || [...(rwIn(ctx).length ? rwIn(ctx) : RWQO_SITES)].sort((a, b) => a.sass5 - b.sass5)[0];
}
const OBJECTIVES: Record<string, { label: string; min?: number; max?: number; unit: string }> = {
  do: { label: 'Dissolved oxygen', min: 6, unit: 'mg/L' },
  ph: { label: 'pH', min: 6.5, max: 8.5, unit: 'pH units' },
  ec: { label: 'Electrical conductivity', max: 55, unit: 'mS/m' },
  phosphate: { label: 'Orthophosphate (PO₄-P)', max: 0.025, unit: 'mg/L' },
  nitrate: { label: 'Total inorganic nitrogen (proxy NO₃-N)', max: 1, unit: 'mg/L' },
  ammonia: { label: 'Ammonia (NH₃-N, toxicity)', max: 0.073, unit: 'mg/L' },
  turbidity: { label: 'Turbidity', max: 15, unit: 'NTU' },
  lead: { label: 'Lead (toxicant)', max: 1.2, unit: 'µg/L' },
  arsenic: { label: 'Arsenic (toxicant)', max: 10, unit: 'µg/L' },
};
const meets = (k: string, v: number) => (OBJECTIVES[k].min == null || v >= OBJECTIVES[k].min!) && (OBJECTIVES[k].max == null || v <= OBJECTIVES[k].max!);
function siteCompliance(x: RwqoSite, mi = LASTC()) {
  const s = wqSamples(x.station.id);
  const ks = Object.keys(OBJECTIVES);
  return (ks.filter((k) => meets(k, s[k][wqT(mi)])).length / ks.length) * 100;
}

export const rwqo: ModuleHandlers = {
  summary: (ctx) => {
    const l = rwIn(ctx);
    const comp = mean(l.map((x) => siteCompliance(x)));
    return [
      kpi('sites', 'boreholes', l.length, { label: 'RWQO Monitoring Sites', sublabel: 'Rivers, dams, wetlands, estuaries', unit: '' }),
      kpi('comp', 'rwqoCompliance', comp, { label: 'RWQO Compliance', sublabel: 'Objectives met (latest sample)', delta: comp - mean(l.map((x) => siteCompliance(x, LASTC() - 12))), deltaUnit: ' pp', deltaLabel: 'vs last year' }),
      kpi('sass', 'sass5', mean(l.map((x) => x.sass5)), { label: 'Mean SASS5 Score', sublabel: 'Macroinvertebrates' }),
      kpi('aspt', 'aspt', mean(l.map((x) => x.aspt)), { label: 'Mean ASPT', sublabel: 'Average score per taxon' }),
      kpi('fibi', 'fibi', mean(l.map((x) => x.fibi)), { label: 'Fish Index (FIBI)', sublabel: 'Fish community integrity' }),
      kpi('ab', 'wqCompliance', (l.filter((x) => x.pes === 'A' || x.pes === 'B').length / Math.max(1, l.length)) * 100, { label: 'Sites in PES A/B', sublabel: 'Natural / largely natural' }),
      kpi('eflow', 'eflowCompliance', (l.filter((x) => x.eflowObs >= x.eflowReq).length / Math.max(1, l.length)) * 100, { label: 'E-flow Compliance', sublabel: 'Observed ≥ ecological requirement' }),
      kpi('below', 'damsBelow', l.filter((x) => x.pes > x.rec).length, { label: 'Sites Below REC', sublabel: 'Present state worse than recommended' }),
    ];
  },
  timeseries: {
    ecological: (ctx) => {
      const x = pickSite(ctx);
      const r = new Rng(`eco-${x.id}`);
      const ys = Array.from({ length: 10 }, (_, k) => miYear(ctx.last) - 9 + k);
      const drift = (k: number) => (9 - k) * r.range(0.2, 1.4);
      return { id: 'rwqo-eco', xType: 'category', axes: [{ unit: 'score', label: 'SASS5 / FIBI / IHI' }, { unit: '', label: 'ASPT', min: 0, max: 10 }], series: [bar('sass', 'SASS5', ys.map((y, k) => [String(y), clamp(x.sass5 + drift(k) * 2 + r.normal(0, 8), 10, 250)]), { color: '#1565C0' }), line('fibi', 'FIBI (%)', ys.map((y, k) => [String(y), clamp(x.fibi + drift(k) + r.normal(0, 4), 5, 100)]), { color: '#2E9E5B', symbol: true }), line('ihi', 'IHI (%)', ys.map((y, k) => [String(y), clamp(x.ihi + drift(k) + r.normal(0, 4), 5, 100)]), { color: '#8E44AD', symbol: true }), line('aspt', 'ASPT', ys.map((y, k) => [String(y), clamp(x.aspt + drift(k) * 0.05 + r.normal(0, 0.3), 2, 9)]), { axis: 1, color: '#F2A900', symbol: true })], note: x.name };
    },
    params: (ctx) => {
      const k = ctx.q('param') ?? 'do';
      const x = pickSite(ctx);
      const s = wqSamples(x.station.id)[k];
      const from = Math.max(monthIndex(2018, 1), Math.min(ctx.from, ctx.to - 23));
      const o = OBJECTIVES[k];
      return { ...seriesSet(`rwqo-${k}`, [{ unit: o.unit, label: o.label }], [line('v', o.label, monthly(from, ctx.to, (mi) => s[wqT(mi)]), { color: '#1565C0', symbol: true })]), refLines: [...(o.max != null ? [{ y: o.max, label: `RWQO ≤ ${o.max}` }] : []), ...(o.min != null ? [{ y: o.min, label: `RWQO ≥ ${o.min}`, color: '#2E9E5B' }] : [])], note: x.name };
    },
    eflow: (ctx) => {
      const x = pickSite(ctx);
      const r = new Rng(`ef-${x.id}`);
      const from = Math.max(ctx.from, ctx.to - 23);
      const seas = (mi: number) => 1 + 0.6 * Math.cos(((miMonth(mi) - 1) / 12) * 2 * Math.PI);
      return seriesSet('rwqo-eflow', [{ unit: 'm³/s', label: 'Flow', min: 0 }], [area2('obs', 'Observed flow', monthly(from, ctx.to, (mi) => x.eflowObs * seas(mi) * r.range(0.6, 1.4))), line('req', 'Ecological flow requirement (EWR)', monthly(from, ctx.to, (mi) => x.eflowReq * (0.7 + 0.3 * seas(mi))), { color: '#E53935', dash: true })], { note: x.name });
    },
  },
  breakdown: {
    'by-type': (ctx) => {
      const types = ['River', 'Dam', 'Wetland', 'Estuary'] as const;
      const l = rwIn(ctx);
      const cls = (c: number) => (c >= 80 ? 0 : c >= 55 ? 1 : 2);
      return categories('rwqo-type', 'sites', [...types], ['Compliant', 'Partially compliant', 'Non-compliant'].map((n, k) => ({ key: n, name: n, stack: 's', color: ['#2E9E5B', '#F2A900', '#C62828'][k], values: types.map((t) => l.filter((x) => x.waterBody === t && cls(siteCompliance(x)) === k).length) })));
    },
    pes: (ctx) => {
      const l = rwIn(ctx);
      const c = ['A', 'B', 'C', 'D', 'E', 'F'];
      return categories('rwqo-pes', 'sites', c.map((x) => SCALES.ecological.bins.find((b) => b.id === x)!.label), [{ key: 'n', name: 'Sites', values: c.map((x) => l.filter((s) => s.pes === x).length) }], { colors: c.map((x) => SCALES.ecological.bins.find((b) => b.id === x)!.color), center: { value: String(l.length), label: 'Sites' } });
    },
  },
  table: {
    results: (ctx) => {
      const x = pickSite(ctx);
      const s = wqSamples(x.station.id);
      const t = wqT(ctx.last);
      return table('rwqo-results', [col.text('p', 'Parameter'), col.num('v', 'Result', '', 3), col.text('u', 'Unit'), col.text('o', 'RWQO'), col.cls('s', 'Status', 'pass')], Object.entries(OBJECTIVES).map(([k, o]) => ({ p: o.label, v: s[k][t], u: o.unit, o: o.min != null && o.max != null ? `${o.min}–${o.max}` : o.max != null ? `≤ ${o.max}` : `≥ ${o.min}`, s: meets(k, s[k][t]) ? 'Compliant' : 'Non-compliant' })));
    },
    ranking: (ctx) => {
      const low = ctx.q('order') !== 'highest';
      const rows = [...rwIn(ctx)].sort((a, b) => (low ? a.sass5 - b.sass5 : b.sass5 - a.sass5)).slice(0, 8).map((x) => ({ id: x.id, name: x.name, body: x.waterBody, sass: x.sass5, aspt: x.aspt, pes: x.pes }));
      return table('rwqo-ranking', [col.rank(), col.text('name', 'Site'), col.text('body', 'Type'), col.num('sass', 'SASS5'), col.num('aspt', 'ASPT', '', 1), col.cls('pes', 'PES', 'ecological')], rows, { rowKey: 'id' });
    },
  },
  map: {
    pes: () => pointsLayer('pes', 'Present Ecological State (PES)', 'ecological', '', RWQO_SITES.map((x) => ({ id: x.id, name: x.name, lat: x.station.lat, lon: x.station.lon, value: x.pes, size: 0.35, kind: 'rwqo', sub: `SASS5 ${x.sass5} · ASPT ${x.aspt}` }))),
    compliance: () => pointsLayer('compliance', 'RWQO compliance (%)', 'coverage', '%', RWQO_SITES.map((x) => ({ id: x.id, name: x.name, lat: x.station.lat, lon: x.station.lon, value: round(siteCompliance(x), 0), size: 0.35, kind: 'rwqo' }))),
    sass5: () => pointsLayer('sass5', 'SASS5 score (as % of 250)', 'coverage', '%', RWQO_SITES.map((x) => ({ id: x.id, name: x.name, lat: x.station.lat, lon: x.station.lon, value: round((x.sass5 / 250) * 100, 0), size: 0.35, kind: 'rwqo', sub: `SASS5 ${x.sass5}` }))),
  },
  entities: (ctx) => ({ type: 'rwqo-site', total: rwIn(ctx).length, items: rwIn(ctx).map((x) => ({ id: x.id, name: x.name, type: 'rwqo-site', province: x.station.province, lat: x.station.lat, lon: x.station.lon, sub: x.waterBody })) }),
  entity: (_ctx, id) => {
    const x = rwqoById.get(id) ?? RWQO_SITES[0];
    return {
      id: x.id,
      name: x.name,
      title: x.name,
      type: 'rwqo-site',
      province: x.station.province,
      lat: x.station.lat,
      lon: x.station.lon,
      image: x.waterBody === 'Dam' ? 'dam' : 'river',
      status: { scale: 'ecological', id: x.pes, label: `PES ${x.pes}` },
      fields: [
        { label: 'Water body', value: x.waterBody },
        { label: 'River / system', value: x.station.river },
        { label: 'Province', value: provinceName(x.station.province) },
        { label: 'SASS5 score', value: x.sass5 },
        { label: 'ASPT', value: x.aspt },
        { label: 'Fish Index (FIBI)', value: `${x.fibi}%` },
        { label: 'Riparian vegetation (VEGRAI)', value: `${x.vegrai}%` },
        { label: 'Habitat integrity (IHI)', value: `${x.ihi}%` },
        { label: 'Present Ecological State', value: x.pes, scale: 'ecological' },
        { label: 'Recommended Ecological Category', value: x.rec },
        { label: 'Ecological flow requirement', value: x.eflowReq, unit: 'm³/s' },
        { label: 'Observed flow (mean)', value: x.eflowObs, unit: 'm³/s' },
        { label: 'RWQO compliance (latest)', value: `${round(siteCompliance(x), 0)}%` },
        { label: 'Data source', value: 'DWS RHP / NWQMS, SANBI' },
      ],
    };
  },
};

function area2(key: string, name: string, data: [string | number, number | null][]) {
  return { key, name, kind: 'area' as const, color: '#1E88E5', data: data.map(([x, y]) => [x, y == null ? null : round(y, 3)]) };
}

