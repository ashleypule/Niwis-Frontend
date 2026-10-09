/** Runoff Status (spec §7) and Surface Water Monitoring (spec §9). */
import { APP } from '@/config/app';
import { MONTH_NAMES, formatDate } from '@/lib/format';
import { Rng } from '@/lib/prng';
import {
  baseflowSeparation,
  clamp,
  flowDuration,
  logPearson3,
  mean,
  plottingPositions,
  round,
  sensSlope,
} from '@/lib/stats';
import { DAY_MS, dayToIso, miMonth, miToIso, miYear, monthIndex } from '@/lib/time';
import { PROVINCE_ORDER, WMAS, provinceName, wmaName } from '../../reference/regions';
import { CELLS, START_MI, cellRain, cellWaterBalance } from '../../generators/climate';
import {
  LAST,
  normalMonths,
  regionClimatology,
  regionSeries,
  regionSsi,
  sumMonths,
  tOf,
} from '../../generators/hydromet';
import {
  STATIONS,
  stationById,
  stationDaily,
  stationMonthly,
  stationNow,
  type Station,
} from '../../generators/stations';
import { WQ_STATIONS, wqNow } from '../../generators/quality';
import { forecastSeries } from '../../generators/forecast';
import { resolveScope, type ResolvedScope } from '../../generators/scope';
import {
  band,
  bar,
  categories,
  col,
  kpi,
  line,
  monthly,
  seriesSet,
  table,
  type Ctx,
  type ModuleHandlers,
} from '../build';
import { choropleth, gridLayer, pointsLayer, spark } from '../common';
import { DROUGHT_BANDS, outlookShift, runoffAnomalyPct } from './drought';

export const stationsIn = (scope: ResolvedScope) => STATIONS.filter((s) => scope.includes(s));
const win = (ctx: Ctx, min = 24) => Math.min(ctx.from, ctx.to - min + 1);

/** Selected station: entityId, else the station with the largest catchment in scope. */
function pickStation(ctx: Ctx): Station {
  const id = ctx.q('entityId');
  if (id && stationById.has(id)) return stationById.get(id)!;
  const list = stationsIn(ctx.scope);
  return [...(list.length ? list : STATIONS)].sort((a, b) => b.areaKm2 - a.areaKm2)[0];
}

function dailyWindow(id: string, days: number): [string, number][] {
  const end = Math.floor(APP.asOf.getTime() / DAY_MS) - 1;
  const out: [string, number][] = [];
  for (let d = end - days + 1; d <= end; d++) {
    const date = new Date(d * DAY_MS);
    const mi = monthIndex(date.getUTCFullYear(), date.getUTCMonth());
    out.push([dayToIso(d), stationDaily(id, mi)[date.getUTCDate() - 1]]);
  }
  return out;
}

const statusCounts = (list: Station[]) => {
  const c: Record<string, number> = { 'High Flow': 0, Normal: 0, 'Low Flow': 0, 'Data Delayed': 0, Offline: 0 };
  list.forEach((s) => c[stationNow(s.id).status]++);
  return c;
};

function annualMax(id: string): number[] {
  const out: number[] = [];
  for (let y = 1980; y < miYear(LAST); y++) {
    let mx = 0;
    for (let m = 0; m < 12; m++) mx = Math.max(mx, Math.max(...stationDaily(id, monthIndex(y, m))));
    out.push(mx);
  }
  return out;
}

function stationEntity(s: Station) {
  const n = stationNow(s.id);
  const wq = [...WQ_STATIONS].sort(
    (a, b) => (a.lat - s.lat) ** 2 + (a.lon - s.lon) ** 2 - ((b.lat - s.lat) ** 2 + (b.lon - s.lon) ** 2),
  )[0];
  return {
    id: s.id,
    name: s.name,
    title: `${s.name} (${s.id})`,
    type: 'station',
    province: s.province,
    wma: s.wma,
    lat: s.lat,
    lon: s.lon,
    image: 'river' as const,
    status: { scale: 'flowStatus', id: n.status, label: n.status },
    fields: [
      { label: 'Station code', value: s.id },
      { label: 'River system', value: `${s.river} River` },
      { label: 'Province', value: provinceName(s.province) },
      { label: 'Water Management Area', value: wmaName(s.wma) },
      { label: 'Coordinates', value: `${Math.abs(s.lat).toFixed(2)}° S, ${s.lon.toFixed(2)}° E` },
      { label: 'Drainage area', value: s.areaKm2, unit: 'km²' },
      { label: 'Stream order', value: s.order },
      { label: 'Current flow (monthly mean)', value: round(n.q, 1), unit: 'm³/s' },
      { label: 'Water level (stage)', value: round(n.stage, 2), unit: 'm' },
      { label: 'Flow anomaly', value: `${n.anomaly > 0 ? '+' : ''}${round(n.anomaly, 0)}%` },
      { label: 'Suspended sediment', value: round(n.sediment, 0), unit: 'mg/L' },
      { label: 'Q90 (low flow) / Q10 (high flow)', value: `${round(n.q90, 1)} / ${round(n.q10, 1)} m³/s` },
      { label: 'Data availability', value: s.telemetry ? 'Real-time (15 min)' : 'Manual (monthly)' },
      { label: 'Last reading', value: formatDate(n.lastReading, 'datetime') },
      { label: 'Nearest WQ station', value: wq ? `${wq.name} – WQI ${wqNow(wq.id).wqi}` : '—' },
      { label: 'Source', value: 'DWS Hydstra / Telemetry' },
    ],
  };
}

// =================================================================== Runoff
export const runoff: ModuleHandlers = {
  summary: (ctx) => {
    const s = ctx.scope;
    const L = ctx.last;
    const ro = regionSeries(s, 'runoff');
    const rain = regionSeries(s, 'rain');
    const clim = regionClimatology(s, 'runoff');
    const mar = normalMonths(clim, L, 12);
    const st = pickStation(ctx);
    const am = annualMax(st.id);
    const rc = sumMonths(ro, L, 12) / Math.max(1, sumMonths(rain, L, 12));
    const bf = baseflowSeparation(Array.from(stationMonthly(st.id).slice(-36)));
    const bfi =
      bf.reduce((a, b) => a + b, 0) /
      Math.max(
        0.001,
        Array.from(stationMonthly(st.id).slice(-36)).reduce((a, b) => a + b, 0),
      );
    const ssi6 = regionSsi(s, 6);
    const list = stationsIn(s);
    const c = statusCounts(list);
    const reporting = list.length - c.Offline - c['Data Delayed'];
    return [
      kpi('mar', 'runoff', sumMonths(ro, L, 12), {
        label: 'Annual Runoff',
        sublabel: `${s.name}, last 12 months`,
        delta: ((sumMonths(ro, L, 12) - mar) / mar) * 100,
        deltaUnit: '%',
        deltaLabel: 'vs 1981–2010',
        spark: spark((mi) => ro[tOf(mi)], L, 24),
      }),
      kpi('anom', 'runoffAnomaly', runoffAnomalyPct(s, L, 12), {
        label: 'Runoff Anomaly',
        sublabel: '12 months',
        spark: spark((mi) => runoffAnomalyPct(s, mi, 12), L, 24),
      }),
      kpi('peak', 'peakFlow', am[am.length - 1], {
        label: 'Peak Flow (Qmax)',
        sublabel: st.name,
        delta: ((am[am.length - 1] - am[am.length - 2]) / Math.max(1, am[am.length - 2])) * 100,
        deltaUnit: '%',
        deltaLabel: 'vs last year',
      }),
      kpi('bfi', 'baseflowIndex', bfi, { label: 'Baseflow Index', sublabel: st.name }),
      kpi('rc', 'runoffCoefficient', rc, { label: 'Runoff Coefficient', sublabel: 'Runoff / rainfall, 12 months' }),
      kpi('ssi', 'ssi', ssi6[tOf(L)], {
        label: 'SSI-6',
        sublabel: 'Standardised Streamflow Index',
        delta: (ssi6[tOf(L)] ?? 0) - (ssi6[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => ssi6[tOf(mi)], L),
      }),
      kpi('normal', 'stationsHighFlow', reporting ? (c.Normal / reporting) * 100 : 0, {
        label: 'Stations with Normal Flow',
        sublabel: `${reporting} reporting`,
        goodDirection: 'up',
      }),
      kpi('low', 'stationsLowFlow', reporting ? (c['Low Flow'] / reporting) * 100 : 0, {
        label: 'Stations with Low Flow',
        sublabel: `${c['Low Flow']} stations`,
      }),
    ];
  },
  timeseries: {
    discharge: (ctx) => {
      const st = pickStation(ctx);
      const days = Math.max(365, Math.min(3 * 365, (ctx.to - ctx.from + 1) * 30.4));
      const d = dailyWindow(st.id, days);
      const mon = stationMonthly(st.id);
      const lt = (mi: number) =>
        mean(Array.from({ length: 30 }, (_, k) => mon[monthIndex(1981 + k, miMonth(mi)) - START_MI]));
      return seriesSet(
        'discharge',
        [{ unit: 'm³/s', label: 'Discharge', min: 0 }],
        [
          line('daily', 'Daily flow', d, { color: '#1E88E5' }),
          line(
            'monthly',
            'Monthly mean',
            d
              .filter(([x]) => x.endsWith('-15'))
              .map(([x]) => [x, mon[monthIndex(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1) - START_MI]]),
            { color: '#FB8C00', symbol: true },
          ),
          line(
            'lt',
            'Long-term mean (1981–2010)',
            d
              .filter(([x]) => x.endsWith('-15'))
              .map(([x]) => [x, lt(monthIndex(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1))]),
            { color: '#13233A', dash: true },
          ),
        ],
        { note: `${st.name} (${st.id})` },
      );
    },
    'runoff-anomaly': (ctx) => {
      const from = win(ctx, 30);
      const pts = monthly(from, ctx.to, (mi) => runoffAnomalyPct(ctx.scope, mi, 1));
      return seriesSet(
        'runoff-anomaly',
        [{ unit: '%', label: 'Anomaly' }],
        [
          bar(
            'm',
            'Monthly anomaly',
            pts.map(([x, y]) => [x, y == null ? null : clamp(y, -100, 300)]),
            { color: '#1E88E5' },
          ),
          line(
            'ma',
            '12-month moving average',
            monthly(from, ctx.to, (mi) => runoffAnomalyPct(ctx.scope, mi, 12)),
            { color: '#E53935' },
          ),
        ],
      );
    },
    ssi: (ctx) => {
      const from = win(ctx, 30);
      return seriesSet(
        'ssi',
        [{ unit: '', label: 'SSI', min: -3, max: 3 }],
        [1, 3, 6, 12].map((k, i) =>
          line(
            `ssi${k}`,
            `SSI-${k}`,
            monthly(from, ctx.to, (mi) => regionSsi(ctx.scope, k)[tOf(mi)]),
            { color: ['#1565C0', '#E53935', '#F2A900', '#2E9E5B'][i] },
          ),
        ),
        { bands: DROUGHT_BANDS },
      );
    },
    'rainfall-runoff': (ctx) => {
      const from = win(ctx, 30);
      const r = regionSeries(ctx.scope, 'rain');
      const ro = regionSeries(ctx.scope, 'runoff');
      return seriesSet(
        'rainfall-runoff',
        [
          { unit: 'mm', label: 'Rainfall' },
          { unit: 'mm', label: 'Runoff' },
        ],
        [
          bar(
            'r',
            'Monthly rainfall',
            monthly(from, ctx.to, (mi) => r[tOf(mi)]),
            { color: '#90CAF9' },
          ),
          line(
            'q',
            'Monthly runoff',
            monthly(from, ctx.to, (mi) => ro[tOf(mi)]),
            { axis: 1, color: '#13233A', symbol: true },
          ),
        ],
      );
    },
    'water-balance': (ctx) => {
      const from = win(ctx, 24);
      const r = regionSeries(ctx.scope, 'rain');
      const a = regionSeries(ctx.scope, 'aet');
      const q = regionSeries(ctx.scope, 'runoff');
      return seriesSet(
        'water-balance',
        [{ unit: 'mm', label: 'Depth' }],
        [
          bar(
            'p',
            'Rainfall (P)',
            monthly(from, ctx.to, (mi) => r[tOf(mi)]),
            { color: '#1E88E5' },
          ),
          bar(
            'aet',
            'Actual ET (AET)',
            monthly(from, ctx.to, (mi) => a[tOf(mi)]),
            { color: '#2E9E5B' },
          ),
          line(
            'q',
            'Runoff (Q)',
            monthly(from, ctx.to, (mi) => q[tOf(mi)]),
            { color: '#FB8C00', symbol: true },
          ),
        ],
      );
    },
    'flood-frequency': (ctx) => {
      const st = pickStation(ctx);
      const am = annualMax(st.id);
      const T = [1.01, 1.5, 2, 5, 10, 20, 50, 100, 200];
      const fit = T.map((t) => [t, logPearson3(am, t)] as [number, number]);
      return {
        id: 'flood-frequency',
        xType: 'value',
        xLog: true,
        xUnit: 'Return period (years)',
        axes: [{ unit: 'm³/s', label: 'Peak flow', log: true }],
        series: [
          {
            key: 'band',
            name: '90% confidence',
            kind: 'band',
            color: '#C5CAE9',
            data: fit.map(([t, q]) => [t, q * (0.78 - 0.02 * Math.log(t)), q * (1.25 + 0.05 * Math.log(t))]),
          },
          {
            key: 'obs',
            name: 'Observed annual maxima',
            kind: 'scatter',
            color: '#1565C0',
            data: plottingPositions(am).map(([t, q]) => [round(t, 2), round(q, 1)]),
          },
          {
            key: 'fit',
            name: 'Log-Pearson III fit',
            kind: 'line',
            color: '#E53935',
            data: fit.map(([t, q]) => [t, round(q, 1)]),
          },
        ],
        note: `${st.name} · ${am.length} annual maxima`,
      };
    },
    fdc: (ctx) => {
      const st = pickStation(ctx);
      const days = (from: number, to: number) => {
        const v: number[] = [];
        for (let mi = from; mi <= to; mi++) v.push(...stationDaily(st.id, mi));
        return v;
      };
      const cur = flowDuration(days(ctx.last - 11, ctx.last));
      const lt = flowDuration(days(monthIndex(2011, 0), monthIndex(2020, 11)));
      const prev = flowDuration(days(ctx.last - 23, ctx.last - 12));
      const n = stationNow(st.id);
      return {
        id: 'fdc',
        xType: 'value',
        xUnit: 'Exceedance probability (%)',
        axes: [{ unit: 'm³/s', label: 'Discharge', log: true }],
        series: [
          {
            key: 'cur',
            name: 'Last 12 months',
            kind: 'line',
            color: '#1565C0',
            data: cur.map(([p, q]) => [p, Math.max(0.01, round(q, 2))]),
          },
          {
            key: 'prev',
            name: 'Previous 12 months',
            kind: 'line',
            color: '#E53935',
            data: prev.map(([p, q]) => [p, Math.max(0.01, round(q, 2))]),
          },
          {
            key: 'lt',
            name: 'Long-term (2011–2020)',
            kind: 'line',
            color: '#13233A',
            dash: true,
            data: lt.map(([p, q]) => [p, Math.max(0.01, round(q, 2))]),
          },
        ],
        refLines: [
          { y: Math.max(0.01, round(n.q90, 2)), label: 'Q90 (low flow)', color: '#E95F35' },
          { y: Math.max(0.01, round(n.q10, 2)), label: 'Q10 (high flow)', color: '#1565C0' },
        ],
        note: st.name,
      };
    },
    seasonal: (ctx) => {
      const st = pickStation(ctx);
      const mon = stationMonthly(st.id);
      const y = miYear(ctx.last);
      const yr = (yy: number) =>
        MONTH_NAMES.map(
          (n, m) =>
            [n, monthIndex(yy, m) > ctx.last ? null : mon[monthIndex(yy, m) - START_MI]] as [string, number | null],
        );
      return {
        id: 'seasonal',
        xType: 'category',
        axes: [{ unit: 'm³/s', label: 'Average flow' }],
        series: [
          bar('y0', String(y), yr(y), { color: '#1565C0' }),
          bar('y1', String(y - 1), yr(y - 1), { color: '#F2A900' }),
          line(
            'lt',
            'Long-term average',
            MONTH_NAMES.map((n, m) => [
              n,
              mean(Array.from({ length: 30 }, (_, k) => mon[monthIndex(1981 + k, m) - START_MI])),
            ]),
            { color: '#2E9E5B', symbol: true },
          ),
        ],
        note: st.name,
      };
    },
    'national-volume': (ctx) => {
      const ro = regionSeries(ctx.scope, 'runoff');
      const areaKm2 = ctx.scope.cells.reduce((a, i) => a + CELLS[i].areaKm2, 0);
      const clim = regionClimatology(ctx.scope, 'runoff');
      const y = miYear(ctx.last);
      const v = (mi: number) => (mi > ctx.last ? null : (ro[tOf(mi)] * areaKm2) / 1000);
      return {
        id: 'national-volume',
        xType: 'category',
        axes: [{ unit: 'Mm³', label: 'Runoff volume' }],
        series: [
          bar(
            'y0',
            String(y),
            MONTH_NAMES.map((n, m) => [n, v(monthIndex(y, m))]),
            { color: '#1565C0' },
          ),
          bar(
            'y1',
            String(y - 1),
            MONTH_NAMES.map((n, m) => [n, v(monthIndex(y - 1, m))]),
            { color: '#F2A900' },
          ),
          line(
            'lt',
            'Long-term average',
            MONTH_NAMES.map((n, m) => [n, (clim[m] * areaKm2) / 1000]),
            { color: '#13233A', dash: true },
          ),
        ],
      };
    },
    drivers: (ctx) => {
      const v = ctx.q('var') ?? 'rain';
      const from = win(ctx, 30);
      const key = v === 'aet' ? 'aet' : v === 'sm' ? 'sm' : 'rain';
      const s = regionSeries(ctx.scope, key);
      return seriesSet(
        `drv-${v}`,
        [
          {
            unit: v === 'sm' ? 'm³/m³' : 'mm',
            label: v === 'aet' ? 'Actual ET' : v === 'sm' ? 'Antecedent soil moisture' : 'Catchment rainfall',
          },
        ],
        [
          (v === 'rain' ? bar : line)(
            'v',
            v === 'aet' ? 'Actual ET' : v === 'sm' ? 'Soil moisture' : 'Rainfall',
            monthly(from, ctx.to, (mi) => s[tOf(mi)]),
            { color: v === 'aet' ? '#2E9E5B' : v === 'sm' ? '#6D4C41' : '#1E88E5' },
          ),
        ],
      );
    },
  },
  breakdown: {
    'by-province': () => {
      const cats = ['High Flow', 'Normal', 'Low Flow', 'Data Delayed', 'Offline'];
      const rows = PROVINCE_ORDER.map((p) => statusCounts(STATIONS.filter((s) => s.province === p)));
      return categories(
        'by-province',
        'stations',
        PROVINCE_ORDER,
        cats.map((c, k) => ({
          key: c,
          name: c,
          values: rows.map((r) => r[c]),
          color: ['#2166AC', '#4CAF50', '#F6CF3E', '#F28C28', '#7B8794'][k],
          stack: 's',
        })),
      );
    },
    'by-wma': (ctx) => {
      const rows = WMAS.map((w) => {
        const sc = resolveScope({ wma: w.id });
        const area = sc.cells.reduce((a, i) => a + CELLS[i].areaKm2, 0);
        return {
          name: w.name,
          cur: (sumMonths(regionSeries(sc, 'runoff'), ctx.last, 12) * area) / 1000,
          lt: (normalMonths(regionClimatology(sc, 'runoff'), ctx.last, 12) * area) / 1000,
        };
      });
      return categories(
        'by-wma',
        'Mm³',
        rows.map((r) => r.name),
        [
          { key: 'cur', name: 'Last 12 months', values: rows.map((r) => r.cur), color: '#1565C0' },
          { key: 'lt', name: 'Long-term mean', values: rows.map((r) => r.lt), color: '#94A3B8' },
        ],
      );
    },
  },
  table: {
    statistics: (ctx) => {
      const s = ctx.scope;
      const ro = regionSeries(s, 'runoff');
      const clim = regionClimatology(s, 'runoff');
      const r = regionSeries(s, 'rain');
      const st = pickStation(ctx);
      const n = stationNow(st.id);
      const am = annualMax(st.id);
      const cur = sumMonths(ro, ctx.last, 12);
      const lt = normalMonths(clim, ctx.last, 12);
      const yrs = Array.from({ length: 20 }, (_, k) => miYear(ctx.last) - 20 + k);
      const annual = yrs.map((y) =>
        Array.from({ length: 12 }, (_, m) => ro[tOf(monthIndex(y, m))]).reduce((a, b) => a + b, 0),
      );
      const pct = (a: number, b: number) => `${round(((a - b) / Math.max(0.001, b)) * 100, 0)}%`;
      return table(
        'statistics',
        [
          col.text('v', 'Variable'),
          col.text('cur', 'Current (12 m)'),
          col.text('clim', 'Climatology (1981–2010)'),
          col.text('anom', 'Anomaly'),
          col.text('trend', "Trend (Sen's slope)"),
        ],
        [
          {
            v: 'Annual runoff',
            cur: `${round(cur, 0)} mm`,
            clim: `${round(lt, 0)} mm`,
            anom: pct(cur, lt),
            trend: `${round(sensSlope(annual, yrs) * 10, 1)} mm/decade`,
          },
          {
            v: `Peak flow (Qmax), ${st.id}`,
            cur: `${round(am[am.length - 1], 0)} m³/s`,
            clim: `${round(mean(am.slice(1, 31)), 0)} m³/s`,
            anom: pct(am[am.length - 1], mean(am.slice(1, 31))),
            trend: `${round(sensSlope(am.slice(-20)) * 10, 0)} m³/s/decade`,
          },
          {
            v: 'Runoff coefficient',
            cur: round(cur / Math.max(1, sumMonths(r, ctx.last, 12)), 3).toFixed(3),
            clim: round(lt / Math.max(1, normalMonths(regionClimatology(s, 'rain'), ctx.last, 12)), 3).toFixed(3),
            anom: '—',
            trend: '—',
          },
          {
            v: `Q90 (low flow), ${st.id}`,
            cur: `${round(n.q90, 2)} m³/s`,
            clim: `${round(n.q90, 2)} m³/s`,
            anom: '—',
            trend: '—',
          },
          {
            v: `Q10 (high flow), ${st.id}`,
            cur: `${round(n.q10, 1)} m³/s`,
            clim: `${round(n.q10, 1)} m³/s`,
            anom: '—',
            trend: '—',
          },
          {
            v: 'Current monthly flow',
            cur: `${round(n.q, 1)} m³/s`,
            clim: `${round(n.ltMean, 1)} m³/s`,
            anom: pct(n.q, n.ltMean),
            trend: '—',
          },
        ],
      );
    },
    'top-stations': (ctx) => {
      const low = ctx.q('order') === 'lowest';
      const list = stationsIn(ctx.scope).filter((s) => stationNow(s.id).status !== 'Offline');
      const rows = list
        .map((s) => ({ s, n: stationNow(s.id) }))
        .sort((a, b) => (low ? a.n.percentile - b.n.percentile || a.n.q - b.n.q : b.n.q - a.n.q))
        .slice(0, 10)
        .map(({ s, n }) => ({
          id: s.id,
          station: s.name,
          code: s.id,
          river: s.river,
          flow: n.q,
          trend: n.q - n.qPrevYear,
        }));
      return table(
        'top-stations',
        [
          col.rank(),
          col.text('station', 'Station'),
          col.text('code', 'Code'),
          col.num('flow', 'Flow', 'm³/s', 1),
          col.trend('trend', 'vs last year', 'up', 'm³/s', 1),
        ],
        rows,
        { rowKey: 'id' },
      );
    },
    events: (ctx) => {
      const list = stationsIn(ctx.scope).slice(0, 400);
      const r = new Rng(`events-${ctx.scope.key}`);
      const rows: Record<string, string | number | null>[] = [];
      list.forEach((s) => {
        const n = stationNow(s.id);
        if (n.status === 'High Flow' && rows.length < 14)
          rows.push({
            date: miToIso(ctx.last).slice(0, 8) + String(r.int(1, 28)).padStart(2, '0'),
            station: s.name,
            type: 'High flow (> Q10)',
            value: round(n.q, 0),
            sev: n.q > n.q10 * 1.5 ? 'High' : 'Moderate',
          });
        if (n.status === 'Low Flow' && rows.length < 14)
          rows.push({
            date: miToIso(ctx.last).slice(0, 8) + String(r.int(1, 28)).padStart(2, '0'),
            station: s.name,
            type: 'Low flow (< Q90)',
            value: round(n.q, 2),
            sev: n.q < n.q90 * 0.5 ? 'High' : 'Moderate',
          });
      });
      return table(
        'events',
        [
          col.date('date'),
          col.text('station', 'Station'),
          col.text('type', 'Event'),
          col.num('value', 'Flow', 'm³/s', 1),
          col.cls('sev', 'Severity', 'risk'),
        ],
        rows.sort((a, b) => String(b.date).localeCompare(String(a.date))),
      );
    },
  },
  map: {
    'annual-runoff': () =>
      gridLayer(
        'annual-runoff',
        'Annual runoff, last 12 months (mm)',
        'runoff',
        'mm',
        (i) => {
          const r = cellWaterBalance(i).runoff;
          let s = 0;
          for (let mi = LAST - 11; mi <= LAST; mi++) s += r[tOf(mi)];
          return s;
        },
        0,
      ),
    'runoff-anomaly': () =>
      gridLayer(
        'runoff-anomaly',
        'Runoff anomaly, 12 months (%)',
        'anomalyPct',
        '%',
        (i) => {
          const r = cellWaterBalance(i).runoff;
          let s = 0;
          let n = 0;
          for (let mi = LAST - 11; mi <= LAST; mi++) {
            s += r[tOf(mi)];
            n += mean(Array.from({ length: 30 }, (_, k) => r[tOf(monthIndex(1981 + k, miMonth(mi)))]));
          }
          return n > 1 ? clamp(((s - n) / n) * 100, -100, 200) : null;
        },
        0,
      ),
    'monthly-runoff': () =>
      gridLayer(
        'monthly-runoff',
        `Monthly runoff – ${MONTH_NAMES[miMonth(LAST)]} ${miYear(LAST)} (mm)`,
        'runoff',
        'mm',
        (i) => cellWaterBalance(i).runoff[tOf(LAST)] * 12,
        0,
      ),
    'runoff-coefficient': () =>
      gridLayer(
        'runoff-coefficient',
        'Runoff coefficient (1981–2010)',
        'runoffCoeff',
        '',
        (i) => {
          const r = cellWaterBalance(i).runoff;
          const p = cellRain(i);
          let a = 0;
          let b = 0;
          for (let mi = monthIndex(1981, 0); mi <= monthIndex(2010, 11); mi++) {
            a += r[tOf(mi)];
            b += p[tOf(mi)];
          }
          return b ? a / b : null;
        },
        3,
      ),
    'catchment-runoff': () =>
      choropleth(
        'catchment-runoff',
        'Runoff anomaly by catchment (12 months, %)',
        'catchment',
        'anomalyPct',
        '%',
        (id) => clamp(runoffAnomalyPct(resolveScope({ catchment: id }), LAST, 12), -100, 200),
        0,
      ),
    stations: () =>
      pointsLayer(
        'stations',
        'River flow (m³/s)',
        'flow',
        'm³/s',
        STATIONS.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          value: round(stationNow(s.id).q, 1),
          size: Math.min(1, Math.log10(s.areaKm2) / 5.5),
          kind: 'station',
          sub: `${s.id} · ${stationNow(s.id).status}`,
        })),
      ),
    'flow-status': () =>
      pointsLayer(
        'flow-status',
        'Gauging station status',
        'flowStatus',
        '',
        STATIONS.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          value: stationNow(s.id).status,
          size: Math.min(1, Math.log10(s.areaKm2) / 5.5),
          kind: 'station',
          sub: s.id,
        })),
      ),
    'flow-anomaly': () =>
      pointsLayer(
        'flow-anomaly',
        'Flow anomaly vs long-term (%)',
        'anomalyPct',
        '%',
        STATIONS.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          value: round(clamp(stationNow(s.id).anomaly, -100, 300), 0),
          size: Math.min(1, Math.log10(s.areaKm2) / 5.5),
          kind: 'station',
        })),
      ),
    ssi: () =>
      pointsLayer(
        'ssi',
        'Flow percentile as SSI',
        'spi',
        '',
        STATIONS.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          value: round(clamp((stationNow(s.id).percentile - 0.5) * 4.2, -3, 3), 2),
          size: Math.min(1, Math.log10(s.areaKm2) / 5.5),
          kind: 'station',
        })),
      ),
  },
  entities: (ctx) => {
    const list = [...stationsIn(ctx.scope)].sort((a, b) => b.areaKm2 - a.areaKm2);
    return {
      type: 'station',
      total: list.length,
      items: list.map((s) => ({
        id: s.id,
        name: s.name,
        type: 'station',
        province: s.province,
        wma: s.wma,
        lat: s.lat,
        lon: s.lon,
        sub: s.id,
      })),
    };
  },
  entity: (_ctx, id) => stationEntity(stationById.get(id) ?? STATIONS[0]),
  forecast: {
    runoff: (ctx) => {
      const ro = regionSeries(ctx.scope, 'runoff');
      const clim = regionClimatology(ctx.scope, 'runoff');
      const L = ctx.last;
      const hist: [number, number | null][] = [];
      for (let mi = L - 23; mi <= L; mi++) hist.push([mi, ro[tOf(mi)]]);
      const ratio = clamp(sumMonths(ro, L, 3) / Math.max(0.1, normalMonths(clim, L, 3)), 0.2, 3);
      const sh = outlookShift(ctx.scope.key);
      const fc = Array.from({ length: 12 }, (_, h) => {
        const mi = L + 1 + h;
        const f = (1 + (ratio - 1) * Math.pow(0.8, h + 1)) * (1 + sh * 0.25);
        const med = clim[miMonth(mi)] * f;
        const spread = 0.25 + 0.06 * h;
        return { mi, median: med, p10: med * (1 - spread), p90: med * (1 + spread * 1.6) };
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'runoff-forecast',
        [{ unit: 'mm', label: 'Monthly runoff', min: 0 }],
        [
          band('band', f.names.band, f.band, { color: '#90CAF9' }),
          bar('obs', 'Observed', f.observed, { color: '#1565C0' }),
          line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true }),
        ],
        { asOf: miToIso(L) },
      );
    },
    flow: (ctx) => {
      const st = pickStation(ctx);
      const mon = stationMonthly(st.id);
      const L = ctx.last;
      const hist: [number, number | null][] = [];
      for (let mi = L - 17; mi <= L; mi++) hist.push([mi, mon[mi - START_MI]]);
      const lt = (mi: number) =>
        mean(Array.from({ length: 30 }, (_, k) => mon[monthIndex(1991 + k, miMonth(mi)) - START_MI]));
      const ratio = clamp(mon[L - START_MI] / Math.max(0.01, lt(L)), 0.1, 4);
      const fc = Array.from({ length: 6 }, (_, h) => {
        const mi = L + 1 + h;
        const med = lt(mi) * (1 + (ratio - 1) * Math.pow(0.75, h + 1));
        return { mi, median: med, p10: med * (0.55 - 0.03 * h), p90: med * (1.6 + 0.15 * h) };
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'flow-forecast',
        [{ unit: 'm³/s', label: 'Monthly mean flow', min: 0 }],
        [
          band('band', f.names.band, f.band, { color: '#90CAF9' }),
          line('obs', 'Observed', f.observed, { color: '#13233A', symbol: true }),
          line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true }),
        ],
        { asOf: miToIso(L), note: `${st.name} (${st.id})` },
      );
    },
    'flood-probability': (ctx) => {
      const list = stationsIn(ctx.scope).slice(0, 500);
      const L = ctx.last;
      const pts: [string, number][] = [];
      for (let h = 1; h <= 6; h++) {
        const mi = L + h;
        const wetSeason = CELLS.length ? mean(list.slice(0, 80).map((s) => CELLS[s.cell].shares[miMonth(mi)])) * 12 : 1;
        pts.push([miToIso(mi), round(clamp(6 + wetSeason * 9 + outlookShift(ctx.scope.key) * 6, 1, 60), 1)]);
      }
      return seriesSet(
        'flood-probability',
        [{ unit: '%', label: 'Probability of exceeding Q10', min: 0 }],
        [bar('p', 'Flood probability (stations > Q10)', pts, { color: '#1565C0' })],
      );
    },
  },
};

// =================================================================== Surface water
export const surfaceWater: ModuleHandlers = {
  summary: (ctx) => {
    const list = stationsIn(ctx.scope);
    const c = statusCounts(list);
    const rep = list.length - c.Offline - c['Data Delayed'];
    const st = pickStation(ctx);
    const n = stationNow(st.id);
    const eflow = list.length ? mean(list.slice(0, 600).map((s) => stationNow(s.id).eflowPct)) : 0;
    const flood = list.filter((s) => stationNow(s.id).q > stationNow(s.id).q10).length;
    const wq = WQ_STATIONS.filter((w) => ctx.scope.includes(w) && w.type === 'River');
    const good = wq.length ? (wq.filter((w) => wqNow(w.id).wqi >= 70).length / wq.length) * 100 : 0;
    return [
      kpi('stations', 'gaugingStations', list.length, {
        label: 'Active Gauging Stations',
        sublabel: `${rep} reporting now`,
        unit: '',
      }),
      kpi('discharge', 'discharge', mean(list.filter((s) => s.order >= 5).map((s) => stationNow(s.id).q)), {
        label: 'Mean River Discharge',
        sublabel: 'Main-stem stations (order ≥ 5)',
        delta: mean(list.filter((s) => s.order >= 5).map((s) => stationNow(s.id).anomaly)),
        deltaUnit: '%',
        deltaLabel: 'vs long-term',
      }),
      kpi('level', 'stage', n.stage, {
        label: 'River Water Level',
        sublabel: st.name,
        delta: n.stage - 0.32 * Math.pow(Math.max(0.01, n.qPrevYear), 0.38),
        deltaUnit: ' m',
        deltaLabel: 'vs last year',
        goodDirection: 'neutral',
      }),
      kpi('high', 'stationsHighFlow', rep ? (c['High Flow'] / rep) * 100 : 0, {
        label: 'Stations with High Flow',
        sublabel: `${c['High Flow']} stations`,
      }),
      kpi('low', 'stationsLowFlow', rep ? (c['Low Flow'] / rep) * 100 : 0, {
        label: 'Stations with Low Flow',
        sublabel: `${c['Low Flow']} stations`,
      }),
      kpi('flood', 'floodAlerts', flood, { label: 'Flood Alerts', sublabel: 'Stations above Q10' }),
      kpi('eflow', 'eflowCompliance', eflow, {
        label: 'Ecological Flow Compliance',
        sublabel: 'Months ≥ Q90, last 12',
      }),
      kpi('sediment', 'sediment', n.sediment, {
        label: 'Suspended Sediment',
        sublabel: st.name,
        goodDirection: 'down',
      }),
      kpi('wq', 'wqi', good, { label: 'River WQ Status', sublabel: 'Stations Good or better', unit: '%', decimals: 0 }),
    ];
  },
  timeseries: {
    discharge: runoff.timeseries!.discharge,
    fdc: runoff.timeseries!.fdc,
    seasonal: runoff.timeseries!.seasonal,
    'water-level': (ctx) => {
      const st = pickStation(ctx);
      const d = dailyWindow(st.id, Math.max(365, Math.min(3 * 365, (ctx.to - ctx.from + 1) * 30.4)));
      const n = stationNow(st.id);
      return {
        ...seriesSet(
          'water-level',
          [{ unit: 'm', label: 'Water level', min: 0 }],
          [
            line(
              'h',
              'Water level (stage)',
              d.map(([x, q]) => [x, round(0.32 * Math.pow(Math.max(0.01, q), 0.38), 2)]),
              { color: '#1565C0' },
            ),
          ],
        ),
        refLines: [{ y: round(n.bankfull, 2), label: 'Bankfull level', color: '#E53935' }],
        note: st.name,
      };
    },
    sediment: (ctx) => {
      const st = pickStation(ctx);
      const n = stationNow(st.id);
      const d = dailyWindow(st.id, 730);
      const conc = d.map(
        ([x, q]) =>
          [
            x,
            round(25 * Math.pow(Math.max(0.01, q) / Math.max(0.01, n.ltMean), 0.7) * (1 + CELLS[st.cell].aridity), 0),
          ] as [string, number],
      );
      const kind = ctx.q('kind') ?? 'conc';
      if (kind === 'load')
        return seriesSet(
          'sediment-load',
          [{ unit: 't/day', label: 'Sediment load', min: 0 }],
          [
            bar(
              'l',
              'Sediment load',
              d.map(([x, q], k) => [x, round(conc[k][1] * q * 0.0864, 0)]),
              { color: '#6D4C41' },
            ),
          ],
          { note: st.name },
        );
      return seriesSet(
        'sediment',
        [{ unit: 'mg/L', label: 'Concentration', min: 0 }],
        [
          bar('c', 'Suspended sediment', conc, { color: '#8D6E63' }),
          line(
            'm',
            'Monthly mean',
            conc
              .filter(([x]) => x.endsWith('-15'))
              .map(([x]) => [x, mean(conc.filter(([y]) => y.slice(0, 7) === x.slice(0, 7)).map((p) => p[1]))]),
            { color: '#F2A900', symbol: true },
          ),
        ],
        { note: st.name },
      );
    },
    baseflow: (ctx) => {
      const st = pickStation(ctx);
      const d = dailyWindow(st.id, 730);
      const bf = baseflowSeparation(d.map((p) => p[1]));
      return seriesSet(
        'baseflow',
        [{ unit: 'm³/s', label: 'Discharge', min: 0 }],
        [
          line('total', 'Total flow', d, { color: '#1565C0' }),
          line(
            'base',
            'Baseflow',
            d.map(([x], k) => [x, bf[k]]),
            { color: '#2E9E5B' },
          ),
          line(
            'quick',
            'Quickflow',
            d.map(([x, q], k) => [x, q - bf[k]]),
            { color: '#F2A900' },
          ),
        ],
        { note: `${st.name} · Lyne–Hollick filter (α = 0.925)` },
      );
    },
    'flow-anomaly': (ctx) => {
      const list = stationsIn(ctx.scope)
        .filter((s) => s.order >= 4)
        .slice(0, 200);
      const from = win(ctx, 12);
      const pts = monthly(from, ctx.to, (mi) =>
        mean(
          list.map((s) => {
            const mon = stationMonthly(s.id);
            const lt = mean(Array.from({ length: 30 }, (_, k) => mon[monthIndex(1981 + k, miMonth(mi)) - START_MI]));
            return clamp(((mon[mi - START_MI] - lt) / Math.max(0.01, lt)) * 100, -100, 200);
          }),
        ),
      );
      return seriesSet(
        'flow-anomaly',
        [{ unit: '%', label: 'Anomaly' }],
        [
          bar(
            'pos',
            'Above average',
            pts.map(([x, y]) => [x, y != null && y >= 0 ? y : null]),
            { color: '#2E9E5B', stack: 'a' },
          ),
          bar(
            'neg',
            'Below average',
            pts.map(([x, y]) => [x, y != null && y < 0 ? y : null]),
            { color: '#E95F35', stack: 'a' },
          ),
        ],
      );
    },
  },
  breakdown: {
    eflow: (ctx) => {
      const list = stationsIn(ctx.scope);
      const e = list.map((s) => stationNow(s.id).eflowPct);
      const vals = [
        e.filter((v) => v >= 80).length,
        e.filter((v) => v >= 60 && v < 80).length,
        e.filter((v) => v < 60).length,
      ];
      return categories(
        'eflow',
        'stations',
        ['Compliant (≥ 80% of months)', 'Partially compliant (60–80%)', 'Non-compliant (< 60%)'],
        [{ key: 'n', name: 'Stations', values: vals }],
        { colors: ['#2E9E5B', '#F6CF3E', '#D7301F'], center: { value: String(list.length), label: 'Stations' } },
      );
    },
    risk: (ctx) => {
      const list = stationsIn(ctx.scope);
      const c = { hi: 0, med: 0, norm: 0, watch: 0, alert: 0 };
      list.forEach((s) => {
        const n = stationNow(s.id);
        if (n.q > n.q10 * 1.4) c.hi++;
        else if (n.q > n.q10) c.med++;
        else if (n.q < n.q90 * 0.5) c.alert++;
        else if (n.q < n.q90) c.watch++;
        else c.norm++;
      });
      return categories(
        'risk',
        'stations',
        ['High flood risk', 'Medium flood risk', 'Normal', 'Drought watch', 'Drought alert'],
        [{ key: 'n', name: 'Stations', values: [c.hi, c.med, c.norm, c.watch, c.alert] }],
        {
          colors: ['#B2182B', '#F28C28', '#4CAF50', '#F6CF3E', '#7F0000'],
          center: { value: String(list.length), label: 'Stations' },
        },
      );
    },
    status: (ctx) => {
      const c = statusCounts(stationsIn(ctx.scope));
      const cats = ['Normal', 'High Flow', 'Low Flow', 'Data Delayed', 'Offline'];
      return categories('status', 'stations', cats, [{ key: 'n', name: 'Stations', values: cats.map((k) => c[k]) }], {
        colors: ['#4CAF50', '#2166AC', '#F6CF3E', '#F28C28', '#7B8794'],
        center: { value: String(stationsIn(ctx.scope).length), label: 'Stations' },
      });
    },
    abstraction: (ctx) => {
      const by = new Map<string, number>();
      stationsIn(ctx.scope).forEach((s) => {
        if (s.order < 4) return;
        by.set(s.river, (by.get(s.river) ?? 0) + stationNow(s.id).ltMean * 0.9);
      });
      const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      return categories(
        'abstraction',
        'Mm³/yr',
        rows.map((r) => r[0]),
        [{ key: 'v', name: 'Licensed abstraction', values: rows.map((r) => r[1]) }],
        {
          colors: rows.map(
            (_, k) => ['#1565C0', '#2E9E5B', '#F2A900', '#E95F35', '#8E44AD', '#0FA3B1', '#6D4C41', '#94A3B8'][k],
          ),
        },
      );
    },
  },
  table: {
    'top-stations': runoff.table!['top-stations'],
    statistics: runoff.table!.statistics,
    'gauge-quality': (ctx) => {
      const st = pickStation(ctx);
      const wq = [...WQ_STATIONS]
        .filter((w) => w.type === 'River')
        .sort(
          (a, b) => (a.lat - st.lat) ** 2 + (a.lon - st.lon) ** 2 - ((b.lat - st.lat) ** 2 + (b.lon - st.lon) ** 2),
        )[0];
      const n = wqNow(wq.id).latest;
      const cls = (ok: boolean, warn: boolean) => (ok ? 'Good' : warn ? 'Moderate' : 'Poor');
      const rows = [
        { p: 'pH', v: n.ph, s: cls(n.ph >= 6.5 && n.ph <= 8.5, n.ph >= 6 && n.ph <= 9) },
        { p: 'Electrical conductivity (mS/m)', v: n.ec, s: cls(n.ec < 70, n.ec < 150) },
        { p: 'Turbidity (NTU)', v: n.turbidity, s: cls(n.turbidity < 10, n.turbidity < 25) },
        { p: 'Dissolved oxygen (mg/L)', v: n.do, s: cls(n.do >= 6, n.do >= 5) },
        { p: 'Nitrate (mg/L)', v: n.nitrate, s: cls(n.nitrate < 3, n.nitrate < 6) },
        { p: 'Phosphate (mg/L)', v: n.phosphate, s: cls(n.phosphate < 0.025, n.phosphate < 0.125) },
        { p: 'E. coli (cfu/100 mL)', v: n.ecoli, s: cls(n.ecoli < 130, n.ecoli < 1000) },
      ];
      return table(
        'gauge-quality',
        [col.text('p', 'Parameter'), col.num('v', 'Value', '', 2), col.cls('s', 'Status', 'wq')],
        rows,
      );
    },
    alerts: (ctx) => {
      const rows = stationsIn(ctx.scope)
        .map((s) => ({ s, n: stationNow(s.id) }))
        .filter(({ n }) => n.status === 'High Flow' || n.status === 'Low Flow')
        .sort((a, b) => Math.abs(b.n.percentile - 0.5) - Math.abs(a.n.percentile - 0.5))
        .slice(0, 8)
        .map(({ s, n }, k) => ({
          date: dayToIso(Math.floor(APP.asOf.getTime() / DAY_MS) - (k % 7)),
          station: s.id,
          river: s.river,
          type: n.status === 'High Flow' ? 'High flow' : 'Low flow',
          sev: n.q > n.q10 * 1.4 || n.q < n.q90 * 0.4 ? 'High' : 'Moderate',
        }));
      return table(
        'alerts',
        [
          col.date('date'),
          col.text('station', 'Station'),
          col.text('river', 'River'),
          col.text('type', 'Alert type'),
          col.cls('sev', 'Severity', 'risk'),
        ],
        rows,
      );
    },
  },
  map: runoff.map,
  entities: runoff.entities,
  entity: runoff.entity,
  forecast: runoff.forecast,
};
