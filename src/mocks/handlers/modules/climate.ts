/** Climate Change Indicators (spec §4) — trends from the generated 1960→present record + RCP projections. */
import { clamp, linearFit, mannKendall, mean, pearson, round, sensSlope, cv as coefVar } from '@/lib/stats';
import { miMonth, miYear, monthIndex, season } from '@/lib/time';
import { PROVINCE_ORDER, provinceName } from '../../reference/regions';
import { CELLS, END_MI, NINO34, START_MI, cellRain, cellTemp, cellPet } from '../../generators/climate';
import { annualMeans, annualTotals, regionClimatology, regionSeries, regionSpi, tOf } from '../../generators/hydromet';
import { cellEtccdi, scopeEtccdi } from '../../generators/daily';
import { resolveScope, type ResolvedScope } from '../../generators/scope';
import { MUNI_SERVICES } from '../../generators/services';
import { band, bar, categories, col, kpi, line, seriesSet, table, type Ctx, type ModuleHandlers } from '../build';
import { choropleth, gridLayer, regionMean } from '../common';

const yIso = (y: number) => `${y}-07-01`;
const lastFullYear = (ctx: Ctx) => (miMonth(ctx.last) === 11 ? miYear(ctx.last) : miYear(ctx.last) - 1);

function baseline(vals: { year: number; value: number }[]) {
  return mean(vals.filter((v) => v.year >= 1981 && v.year <= 2010).map((v) => v.value));
}

/** Last-12-month temperature anomaly vs 1981–2010. */
function tempAnom12(scope: ResolvedScope, endMi: number): number {
  const t = regionSeries(scope, 'tmean');
  const clim = regionClimatology(scope, 'tmean');
  let s = 0;
  for (let mi = endMi - 11; mi <= endMi; mi++) s += t[tOf(mi)] - clim[miMonth(mi)];
  return s / 12;
}

// ------------------------------------------------------------------ projections (relative to 1981–2010)
type Scen = 'rcp45' | 'rcp85';
function gWarm(year: number, s: Scen): number {
  const x = (year - 2020) / 80;
  return s === 'rcp45'
    ? 0.75 + (1.45 * (1 - Math.exp(-2.2 * x))) / (1 - Math.exp(-2.2))
    : 0.75 + 3.9 * Math.pow(Math.max(0, x), 1.25);
}
const warmFactor = (i: number) => 0.85 + 0.45 * CELLS[i].aridity;
const rainFactor = (i: number) => {
  const c = CELLS[i];
  const west = 1 / (1 + Math.exp(-(25 - c.lon) / 1.5));
  return -1 * west - 0.35 * (1 - west) + (c.lon > 29.5 && c.lat > -26 ? 0.45 : 0);
};
export function projTemp(i: number, year: number, s: Scen) {
  return warmFactor(i) * gWarm(year, s);
}
export function projRainPct(i: number, year: number, s: Scen) {
  const h = (gWarm(year, s) - 0.75) / (s === 'rcp45' ? 1.45 : 3.9);
  return rainFactor(i) * (s === 'rcp45' ? 9 : 22) * Math.max(0, h) - 2;
}

const sliceYears = (vals: { year: number; value: number }[], a: number, b: number) =>
  vals.filter((v) => v.year >= a && v.year <= b);
const decadeTrend = (vals: { year: number; value: number }[]) =>
  sensSlope(
    vals.map((v) => v.value),
    vals.map((v) => v.year),
  ) * 10;

const cellTrendCache = new Map<number, number>();
function cellTempTrend(i: number): number {
  if (!cellTrendCache.has(i)) {
    const t = cellTemp(i).tmean;
    const ys: number[] = [];
    const vs: number[] = [];
    for (let y = 1981; y <= 2025; y++) {
      let s = 0;
      for (let m = 0; m < 12; m++) s += t[monthIndex(y, m) - START_MI];
      ys.push(y);
      vs.push(s / 12);
    }
    cellTrendCache.set(i, round(linearFit(vs, ys).slope * 10, 3));
  }
  return cellTrendCache.get(i)!;
}

export const climate: ModuleHandlers = {
  summary: (ctx) => {
    const s = ctx.scope;
    const ly = lastFullYear(ctx);
    const tAnn = annualMeans(regionSeries(s, 'tmean'), 1960, ly);
    const rAnn = annualTotals(regionSeries(s, 'rain'), 1960, ly);
    const eAnn = annualTotals(regionSeries(s, 'pet'), 1960, ly);
    const qAnn = annualTotals(regionSeries(s, 'runoff'), 1960, ly);
    const recent = (a: { year: number; value: number }[]) => mean(sliceYears(a, ly - 9, ly).map((v) => v.value));
    const pctChange = (a: { year: number; value: number }[]) => ((recent(a) - baseline(a)) / baseline(a)) * 100;
    const ext = scopeEtccdi(s.cells, ly);
    const extBase = mean([1981, 1990, 2000, 2010].map((y) => scopeEtccdi(s.cells, y).hotDays));
    const r20Base = mean([1981, 1990, 2000, 2010].map((y) => scopeEtccdi(s.cells, y).r20mm));
    const cddBase = mean([1981, 1990, 2000, 2010].map((y) => scopeEtccdi(s.cells, y).cdd));
    return [
      kpi('tanom', 'tempAnomaly', tempAnom12(s, ctx.last), {
        label: 'Temperature Anomaly',
        sublabel: 'Last 12 months vs 1981–2010',
        delta: tempAnom12(s, ctx.last) - tempAnom12(s, ctx.last - 12),
        deltaUnit: ' °C',
        deltaLabel: 'vs previous 12 months',
        spark: tAnn.slice(-30).map((v) => v.value),
      }),
      kpi('tchange', 'tempTrend', decadeTrend(sliceYears(tAnn, 1981, ly)), {
        label: 'Warming Trend',
        sublabel: "Sen's slope 1981–present",
        spark: tAnn.slice(-30).map((v) => v.value),
      }),
      kpi('rain', 'rainfallAnomaly', pctChange(rAnn), {
        label: 'Rainfall Change',
        sublabel: 'Last decade vs 1981–2010',
        spark: rAnn.slice(-30).map((v) => v.value),
      }),
      kpi('et0', 'et0', recent(eAnn), {
        label: 'Reference ET₀ (annual)',
        sublabel: 'Last-decade mean',
        unit: 'mm/yr',
        delta: pctChange(eAnn),
        deltaUnit: '%',
        deltaLabel: 'vs 1981–2010',
        spark: eAnn.slice(-30).map((v) => v.value),
      }),
      kpi('flow', 'runoffAnomaly', pctChange(qAnn), {
        label: 'Mean Annual Runoff',
        sublabel: 'Last decade vs 1981–2010',
        spark: qAnn.slice(-30).map((v) => v.value),
      }),
      kpi('hot', 'hotDays', ext.hotDays, {
        label: 'Hot Days (> 35 °C)',
        sublabel: `${ly}, station mean`,
        delta: ext.hotDays - extBase,
        deltaUnit: ' days',
        deltaLabel: 'vs 1981–2010',
      }),
      kpi('r20', 'heavyRainDays', ext.r20mm, {
        label: 'Heavy Rain Days (R20mm)',
        sublabel: `${ly}, station mean`,
        delta: ext.r20mm - r20Base,
        deltaUnit: ' days',
        deltaLabel: 'vs 1981–2010',
      }),
      kpi('cdd', 'cdd', ext.cdd, {
        label: 'Consecutive Dry Days',
        sublabel: `${ly}, station mean`,
        delta: ext.cdd - cddBase,
        deltaUnit: ' days',
        deltaLabel: 'vs 1981–2010',
      }),
    ];
  },

  timeseries: {
    'temperature-long': (ctx) => {
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const tx = annualMeans(regionSeries(s, 'tmax'), 1960, ly);
      const tm = annualMeans(regionSeries(s, 'tmean'), 1960, ly);
      const tn = annualMeans(regionSeries(s, 'tmin'), 1960, ly);
      const b = baseline(tm);
      return seriesSet(
        'temperature-long',
        [
          { unit: '°C', label: 'Temperature' },
          { unit: '°C', label: 'Anomaly' },
        ],
        [
          bar(
            'anom',
            'Tavg anomaly (vs 1981–2010)',
            tm.map((v) => [yIso(v.year), v.value - b]),
            { axis: 1, color: '#B0BEC5' },
          ),
          line(
            'tmax',
            'Tmax',
            tx.map((v) => [yIso(v.year), v.value]),
            { color: '#E53935' },
          ),
          line(
            'tavg',
            'Tavg',
            tm.map((v) => [yIso(v.year), v.value]),
            { color: '#F2A900' },
          ),
          line(
            'tmin',
            'Tmin',
            tn.map((v) => [yIso(v.year), v.value]),
            { color: '#1E88E5' },
          ),
        ],
      );
    },
    'national-trend': (ctx) => {
      const v = (ctx.q('var') ?? 'temperature') as 'temperature' | 'rainfall' | 'et' | 'streamflow';
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const vals =
        v === 'temperature'
          ? annualMeans(regionSeries(s, 'tmean'), 1960, ly)
          : annualTotals(regionSeries(s, v === 'rainfall' ? 'rain' : v === 'et' ? 'pet' : 'runoff'), 1960, ly);
      const unit = v === 'temperature' ? '°C' : 'mm';
      const fit = linearFit(
        vals.map((x) => x.value),
        vals.map((x) => x.year),
      );
      const ma = vals.map(
        (x, i) =>
          [yIso(x.year), i >= 4 ? mean(vals.slice(i - 4, i + 1).map((y) => y.value)) : null] as [string, number | null],
      );
      const resid = Math.sqrt(mean(vals.map((x) => (x.value - (fit.intercept + fit.slope * x.year)) ** 2)));
      return seriesSet(
        `trend-${v}`,
        [{ unit, label: v === 'temperature' ? 'Mean temperature' : 'Annual total' }],
        [
          band(
            'band',
            'Trend ± 1 s.d.',
            vals.map((x) => [
              yIso(x.year),
              fit.intercept + fit.slope * x.year - resid,
              fit.intercept + fit.slope * x.year + resid,
            ]),
            { color: '#EF9A9A' },
          ),
          line(
            'annual',
            'Annual',
            vals.map((x) => [yIso(x.year), x.value]),
            { color: '#E53935', symbol: true },
          ),
          line('ma', '5-year moving average', ma, { color: '#13233A', dash: true }),
        ],
        {
          note: `Linear trend ${fit.slope >= 0 ? '+' : ''}${round(fit.slope * 10, v === 'temperature' ? 2 : 1)} ${unit}/decade`,
        },
      );
    },
    projections: (ctx) => {
      const v = ctx.q('var') ?? 'temperature';
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const isT = v === 'temperature';
      const hist = isT
        ? annualMeans(regionSeries(s, 'tmean'), 1960, ly)
        : annualTotals(regionSeries(s, 'rain'), 1960, ly);
      const b = baseline(hist);
      const histA = hist.map((x) => [yIso(x.year), isT ? x.value - b : ((x.value - b) / b) * 100] as [string, number]);
      const years = Array.from({ length: 2100 - ly }, (_, k) => ly + 1 + k);
      const proj = (sc: Scen) =>
        years.map(
          (y) =>
            [y, regionMean(s.cells, (i) => (isT ? projTemp(i, y, sc) : projRainPct(i, y, sc))) ?? 0] as [
              number,
              number,
            ],
        );
      const p45 = proj('rcp45');
      const p85 = proj('rcp85');
      const sp = (y: number, sc: Scen) =>
        isT ? 0.25 + 0.012 * (y - 2020) * (sc === 'rcp85' ? 1.5 : 1) : 4 + 0.12 * (y - 2020);
      return seriesSet(
        `proj-${v}`,
        [{ unit: isT ? '°C' : '%', label: isT ? 'Change vs 1981–2010' : 'Rainfall change vs 1981–2010' }],
        [
          band(
            'b45',
            'RCP 4.5 (10th–90th pct)',
            p45.map(([y, m]) => [yIso(y), m - sp(y, 'rcp45'), m + sp(y, 'rcp45')]),
            { color: '#64B5F6' },
          ),
          band(
            'b85',
            'RCP 8.5 (10th–90th pct)',
            p85.map(([y, m]) => [yIso(y), m - sp(y, 'rcp85'), m + sp(y, 'rcp85')]),
            { color: '#EF9A9A' },
          ),
          line('hist', 'Historical', histA, { color: '#13233A' }),
          line(
            'm45',
            'RCP 4.5 (median)',
            p45.map(([y, m]) => [yIso(y), m]),
            { color: '#1565C0' },
          ),
          line(
            'm85',
            'RCP 8.5 (median)',
            p85.map(([y, m]) => [yIso(y), m]),
            { color: '#E53935' },
          ),
        ],
        { asOf: yIso(ly), note: 'Ensemble-median downscaled projections (CSIR CORDEX-Africa style)' },
      );
    },
    extremes: (ctx) => {
      const ly = lastFullYear(ctx);
      const ys = Array.from({ length: ly - 1960 + 1 }, (_, k) => 1960 + k);
      const e = ys.map((y) => scopeEtccdi(ctx.scope.cells, y));
      return seriesSet(
        'extremes',
        [
          { unit: 'days', label: 'Spell length' },
          { unit: 'mm', label: 'Max rainfall' },
        ],
        [
          bar(
            'cdd',
            'CDD',
            e.map((x) => [yIso(x.year), x.cdd]),
            { color: '#E95F35' },
          ),
          bar(
            'cwd',
            'CWD',
            e.map((x) => [yIso(x.year), x.cwd]),
            { color: '#1E88E5' },
          ),
          line(
            'rx1',
            'Rx1day',
            e.map((x) => [yIso(x.year), x.rx1day]),
            { axis: 1, color: '#2E9E5B' },
          ),
          line(
            'rx5',
            'Rx5day',
            e.map((x) => [yIso(x.year), x.rx5day]),
            { axis: 1, color: '#8E44AD' },
          ),
        ],
      );
    },
    'heat-days': (ctx) => {
      const kind = ctx.q('kind') ?? 'hot';
      const ly = lastFullYear(ctx);
      const ys = Array.from({ length: ly - 1980 + 1 }, (_, k) => 1980 + k);
      const vals = ys.map((y) => scopeEtccdi(ctx.scope.cells, y)[kind === 'hot' ? 'hotDays' : 'frostDays']);
      const fit = linearFit(vals, ys);
      return seriesSet(
        'heat-days',
        [{ unit: 'days', label: kind === 'hot' ? 'Days with Tmax > 35 °C' : 'Nights with Tmin < 0 °C', min: 0 }],
        [
          bar(
            'n',
            'Annual count',
            ys.map((y, k) => [yIso(y), vals[k]]),
            { color: kind === 'hot' ? '#E53935' : '#1E88E5' },
          ),
          line(
            'trend',
            'Trend',
            ys.map((y) => [yIso(y), fit.intercept + fit.slope * y]),
            { dash: true, color: '#13233A' },
          ),
        ],
      );
    },
    'extreme-rain': (ctx) => {
      const kind = ctx.q('kind') ?? 'r20';
      const ly = lastFullYear(ctx);
      const ys = Array.from({ length: ly - 1980 + 1 }, (_, k) => 1980 + k);
      const vals = ys.map((y) =>
        kind === 'r20' ? scopeEtccdi(ctx.scope.cells, y).r20mm : scopeEtccdi(ctx.scope.cells, y).rx1day,
      );
      const fit = linearFit(vals, ys);
      return seriesSet(
        'extreme-rain',
        [
          {
            unit: kind === 'r20' ? 'days' : 'mm',
            label: kind === 'r20' ? 'Days ≥ 20 mm' : 'Max 1-day rainfall',
            min: 0,
          },
        ],
        [
          bar(
            'n',
            kind === 'r20' ? 'Heavy rain days (R20mm)' : 'Rx1day',
            ys.map((y, k) => [yIso(y), vals[k]]),
            { color: '#1565C0' },
          ),
          line(
            'trend',
            'Trend',
            ys.map((y) => [yIso(y), fit.intercept + fit.slope * y]),
            { dash: true, color: '#13233A' },
          ),
        ],
      );
    },
    evaporation: (ctx) => {
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const et0 = annualTotals(regionSeries(s, 'pet'), 1960, ly);
      const aet = annualTotals(regionSeries(s, 'aet'), 1960, ly);
      const tx = annualMeans(regionSeries(s, 'tmax'), 1960, ly);
      return seriesSet(
        'evaporation',
        [
          { unit: 'mm/yr', label: 'Evaporation' },
          { unit: 'kPa', label: 'VPD' },
        ],
        [
          line(
            'et0',
            'ET₀ (FAO-56 Hargreaves)',
            et0.map((x) => [yIso(x.year), x.value]),
            { color: '#1565C0' },
          ),
          line(
            'pet',
            'PET (Thornthwaite-adj.)',
            et0.map((x) => [yIso(x.year), x.value * 0.93]),
            { color: '#E53935' },
          ),
          line(
            'aet',
            'AET (water balance)',
            aet.map((x) => [yIso(x.year), x.value]),
            { color: '#2E9E5B' },
          ),
          line(
            'pan',
            'Pan evaporation (Class A)',
            et0.map((x) => [yIso(x.year), x.value * 1.22]),
            { color: '#F2A900', dash: true },
          ),
          line(
            'vpd',
            'Vapour pressure deficit',
            tx.map((x) => [yIso(x.year), 0.6108 * Math.exp((17.27 * x.value) / (x.value + 237.3)) * 0.55]),
            { axis: 1, color: '#8E44AD' },
          ),
        ],
      );
    },
    irrigation: (ctx) => {
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const et0 = annualTotals(regionSeries(s, 'pet'), 1960, ly);
      const rain = annualTotals(regionSeries(s, 'rain'), 1960, ly);
      const sm = annualMeans(regionSeries(s, 'sm'), 1960, ly);
      return seriesSet(
        'irrigation',
        [{ unit: 'mm/yr', label: 'Depth' }],
        [
          line(
            'cwr',
            'Crop water requirement (Kc 0.85)',
            et0.map((x) => [yIso(x.year), x.value * 0.85]),
            { color: '#1565C0' },
          ),
          line(
            'irr',
            'Irrigation demand',
            et0.map((x, k) => [yIso(x.year), Math.max(0, x.value * 0.85 - rain[k].value * 0.75)]),
            { color: '#E53935' },
          ),
          line(
            'def',
            'Rainfall deficit',
            et0.map((x, k) => [yIso(x.year), x.value - rain[k].value]),
            { color: '#F2A900', dash: true },
          ),
          line(
            'smd',
            'Soil moisture deficit',
            sm.map((x) => [yIso(x.year), (0.35 - x.value) * 1000]),
            { color: '#8E44AD' },
          ),
        ],
      );
    },
    'streamflow-linkage': (ctx) => {
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const q = annualTotals(regionSeries(s, 'runoff'), 1960, ly);
      const b = baseline(q);
      return seriesSet(
        'streamflow-linkage',
        [
          { unit: 'mm/yr', label: 'Runoff' },
          { unit: '%', label: 'Anomaly' },
        ],
        [
          bar(
            'q',
            'Mean annual runoff',
            q.map((x) => [yIso(x.year), x.value]),
            { color: '#1E88E5' },
          ),
          line(
            'a',
            'Runoff anomaly',
            q.map((x) => [yIso(x.year), ((x.value - b) / b) * 100]),
            { axis: 1, color: '#E53935' },
          ),
        ],
      );
    },
    'drought-frequency': (ctx) => {
      const spi = regionSpi(ctx.scope, 3);
      const ly = lastFullYear(ctx);
      const ys = Array.from({ length: ly - 1980 + 1 }, (_, k) => 1980 + k);
      const vals = ys.map(
        (y) => Array.from({ length: 12 }, (_, m) => spi[tOf(monthIndex(y, m))] ?? 0).filter((v) => v <= -1.5).length,
      );
      const fit = linearFit(vals, ys);
      return seriesSet(
        'drought-frequency',
        [{ unit: 'months', label: 'Months with SPI-3 ≤ −1.5', min: 0 }],
        [
          bar(
            'n',
            'Drought months',
            ys.map((y, k) => [yIso(y), vals[k]]),
            { color: '#F28C28' },
          ),
          line(
            't',
            'Trend',
            ys.map((y) => [yIso(y), fit.intercept + fit.slope * y]),
            { dash: true, color: '#13233A' },
          ),
        ],
      );
    },
    'indicator-trends': (ctx) => {
      const s = ctx.scope;
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      const years = Array.from({ length: 7 }, (_, k) => 2020 + k * 5);
      const t = (y: number) => regionMean(s.cells, (i) => projTemp(i, y, sc)) ?? 0;
      const p = (y: number) => regionMean(s.cells, (i) => projRainPct(i, y, sc)) ?? 0;
      const rel = (f: (y: number) => number) => years.map((y) => [yIso(y), f(y) - f(2020)] as [string, number]);
      return seriesSet(
        'indicator-trends',
        [{ unit: '%', label: 'Change vs 2020' }],
        [
          line(
            't',
            'Mean temperature (×10 %/°C)',
            rel((y) => t(y) * 10),
            { color: '#E53935', symbol: true },
          ),
          line('r', 'Annual rainfall', rel(p), { color: '#1E88E5', symbol: true }),
          line(
            'h',
            'Extreme heat days',
            rel((y) => t(y) * 28),
            { color: '#F2A900', symbol: true },
          ),
          line(
            'd',
            'Drought frequency',
            rel((y) => -p(y) * 2.2 + t(y) * 9),
            { color: '#6D4C41', symbol: true },
          ),
          line(
            'x',
            'Extreme rainfall events',
            rel((y) => t(y) * 7),
            { color: '#8E44AD', symbol: true },
          ),
        ],
        { note: sc === 'rcp85' ? 'RCP 8.5' : 'RCP 4.5' },
      );
    },
  },

  breakdown: {
    'seasonal-change': (ctx) => {
      const v = ctx.q('var') ?? 'temperature';
      const s = ctx.scope;
      const series = v === 'temperature' ? regionSeries(s, 'tmean') : regionSeries(s, 'rain');
      const periods: [string, number, number][] = [
        ['1981–2000', 1981, 2000],
        ['2001–2020', 2001, 2020],
        [`2021–${miYear(ctx.last)}`, 2021, miYear(ctx.last)],
      ];
      const seasons = ['DJF', 'MAM', 'JJA', 'SON'] as const;
      const val = (a: number, b: number, se: string) => {
        const xs: number[] = [];
        for (let mi = monthIndex(a, 0); mi <= Math.min(ctx.last, monthIndex(b, 11)); mi++)
          if (season(miMonth(mi)) === se) xs.push(series[tOf(mi)]);
        return v === 'temperature' ? mean(xs) : mean(xs) * 3;
      };
      const base = seasons.map((se) => val(1961, 1990, se));
      return categories(
        'seasonal-change',
        v === 'temperature' ? '°C' : '%',
        ['Summer (DJF)', 'Autumn (MAM)', 'Winter (JJA)', 'Spring (SON)'],
        periods.map(([name, a, b], k) => ({
          key: `p${k}`,
          name,
          values: seasons.map((se, j) =>
            v === 'temperature' ? val(a, b, se) - base[j] : ((val(a, b, se) - base[j]) / base[j]) * 100,
          ),
          color: ['#1E88E5', '#F2A900', '#E53935'][k],
        })),
      );
    },
    'map-seasonality': (ctx) => {
      const r = regionSeries(ctx.scope, 'rain');
      const periods: [string, number, number][] = [
        ['1960–1980', 1960, 1980],
        ['1981–2010', 1981, 2010],
        [`2011–${miYear(ctx.last)}`, 2011, miYear(ctx.last) - 1],
      ];
      const seasonal = (a: number, b: number, se: string | null) => {
        let tot = 0;
        for (let y = a; y <= b; y++)
          for (let m = 0; m < 12; m++) if (!se || season(m) === se) tot += r[tOf(monthIndex(y, m))];
        return tot / (b - a + 1);
      };
      const cats = ['Annual', 'DJF', 'MAM', 'JJA', 'SON'];
      return categories(
        'map-seasonality',
        'mm',
        periods.map((p) => p[0]),
        cats.map((c, k) => ({
          key: c,
          name: c,
          values: periods.map(([, a, b]) => seasonal(a, b, c === 'Annual' ? null : c)),
          color: ['#1565C0', '#E53935', '#2E9E5B', '#F2A900', '#8E44AD'][k],
        })),
      );
    },
    'risk-index': (ctx) => {
      const s = ctx.scope;
      const tr = regionMean(s.cells, cellTempTrend) ?? 0.2;
      const rows = [
        ['Water scarcity', clamp(0.45 + tr * 0.8 + (regionMean(s.cells, (i) => CELLS[i].aridity) ?? 0.5) * 0.3, 0, 1)],
        ['Drought risk', clamp(0.4 + tr * 0.7 + 0.15, 0, 1)],
        ['Flood risk', clamp(0.35 + tr * 0.4, 0, 1)],
        ['Heat stress', clamp(0.4 + tr * 1.0, 0, 1)],
        ['Agricultural risk', clamp(0.35 + tr * 0.8, 0, 1)],
        ['Ecosystem risk', clamp(0.3 + tr * 0.7, 0, 1)],
      ] as [string, number][];
      return categories(
        'risk-index',
        '%',
        rows.map((r) => r[0]),
        [{ key: 'v', name: 'Risk index', values: rows.map((r) => r[1] * 100) }],
        {
          colors: rows.map((r) =>
            r[1] >= 0.7 ? '#D7301F' : r[1] >= 0.55 ? '#F28C28' : r[1] >= 0.4 ? '#F6CF3E' : '#8BC34A',
          ),
        },
      );
    },
    'projection-bars': (ctx) => {
      const kind = ctx.q('kind') ?? 'heat';
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      const ly = lastFullYear(ctx);
      const base = mean(
        [2005, 2010, 2015, 2020].map((y) => scopeEtccdi(ctx.scope.cells, y)[kind === 'heat' ? 'hotDays' : 'r20mm']),
      );
      const spiB = regionSpi(ctx.scope, 3);
      const droughtBase =
        mean(
          Array.from({ length: 30 }, (_, k) => spiB[tOf(monthIndex(1991, 0) + k * 12)] ?? 0).map((v) =>
            v <= -1.5 ? 1 : 0,
          ),
        ) * 120;
      const years = [2030, 2050, 2070];
      const dt = (y: number) => regionMean(ctx.scope.cells, (i) => projTemp(i, y, sc)) ?? 0;
      const dp = (y: number) => regionMean(ctx.scope.cells, (i) => projRainPct(i, y, sc)) ?? 0;
      const val = (y: number) =>
        kind === 'heat'
          ? base + dt(y) * 13
          : kind === 'drought'
            ? droughtBase * (1 + dt(y) * 0.18 - dp(y) / 25)
            : dt(y) * 7;
      return categories(
        'projection-bars',
        kind === 'heat' ? 'days/yr' : kind === 'drought' ? 'events/decade' : '% change',
        [`1991–${ly}`, ...years.map(String)],
        [
          {
            key: 'v',
            name:
              kind === 'heat'
                ? 'Extreme heat days'
                : kind === 'drought'
                  ? 'Drought frequency'
                  : 'Extreme rainfall events',
            values: [kind === 'extreme' ? 0 : kind === 'heat' ? base : droughtBase, ...years.map(val)],
          },
        ],
        { colors: ['#94A3B8', '#F6CF3E', '#F28C28', '#D7301F'] },
      );
    },
  },

  table: {
    statistics: (ctx) => {
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const r = annualTotals(regionSeries(s, 'rain'), 1960, ly);
      const vals = r.map((x) => x.value);
      const mk = mannKendall(sliceYears(r, 1981, ly).map((x) => x.value));
      const rain = regionSeries(s, 'rain');
      const djf: number[] = [];
      const nino: number[] = [];
      for (let y = 1961; y <= ly; y++) {
        djf.push(rain[tOf(monthIndex(y, 0))] + rain[tOf(monthIndex(y, 1))] + rain[tOf(monthIndex(y - 1, 11))]);
        nino.push(NINO34[tOf(monthIndex(y, 0))]);
      }
      const ensoR = pearson(djf, nino);
      return table(
        'statistics',
        [col.text('stat', 'Statistic'), col.text('value', 'Value')],
        [
          { stat: 'Mean annual rainfall (1981–2010)', value: `${round(baseline(r), 0)} mm` },
          {
            stat: `Rainfall ${ly} vs baseline`,
            value: `${round(((r[r.length - 1].value - baseline(r)) / baseline(r)) * 100, 0)}%`,
          },
          { stat: 'Coefficient of variation', value: `${round(coefVar(vals) * 100, 0)}%` },
          { stat: "Sen's slope (1981–present)", value: `${round(decadeTrend(sliceYears(r, 1981, ly)), 1)} mm/decade` },
          { stat: 'Mann–Kendall trend', value: `${mk.trend} (Z = ${round(mk.z, 2)}, p = ${round(mk.p, 2)})` },
          { stat: 'ENSO correlation (SOI, DJF)', value: round(-ensoR, 2).toFixed(2) },
          { stat: 'ENSO correlation (Niño 3.4, DJF)', value: round(ensoR, 2).toFixed(2) },
        ],
      );
    },
    provinces: (ctx) => {
      const ly = lastFullYear(ctx);
      return table(
        'provinces',
        [
          col.text('name', 'Province'),
          col.delta('t', 'Temp change', 'down', '°C', 1),
          col.delta('r', 'Rainfall change', 'up', '%', 0),
          col.num('trend', 'Trend', '°C/dec', 2),
          col.num('hot', 'Hot days'),
          col.trend('dir', 'Trend', 'down', '', 2),
        ],
        PROVINCE_ORDER.map((p) => {
          const sc = resolveScope({ province: p });
          const tm = annualMeans(regionSeries(sc, 'tmean'), 1960, ly);
          const rr = annualTotals(regionSeries(sc, 'rain'), 1960, ly);
          const tr = decadeTrend(sliceYears(tm, 1981, ly));
          return {
            name: provinceName(p),
            t: mean(sliceYears(tm, ly - 9, ly).map((x) => x.value)) - baseline(tm),
            r: ((mean(sliceYears(rr, ly - 9, ly).map((x) => x.value)) - baseline(rr)) / baseline(rr)) * 100,
            trend: tr,
            hot: scopeEtccdi(sc.cells, ly).hotDays,
            dir: tr,
          };
        }),
      );
    },
    'signal-chain': (ctx) => {
      const s = ctx.scope;
      const ly = lastFullYear(ctx);
      const tm = annualMeans(regionSeries(s, 'tmean'), 1960, ly);
      const rr = annualTotals(regionSeries(s, 'rain'), 1960, ly);
      const et = annualTotals(regionSeries(s, 'pet'), 1960, ly);
      const sm = annualMeans(regionSeries(s, 'sm'), 1960, ly);
      const q = annualTotals(regionSeries(s, 'runoff'), 1960, ly);
      const rec = (a: { year: number; value: number }[]) => mean(sliceYears(a, ly - 9, ly).map((x) => x.value));
      const pc = (a: { year: number; value: number }[]) => ((rec(a) - baseline(a)) / baseline(a)) * 100;
      const sev = (x: number) => (x > 0.75 ? 'Very High' : x > 0.5 ? 'High' : x > 0.25 ? 'Moderate' : 'Low');
      const dT = rec(tm) - baseline(tm);
      const rows = [
        { stage: 'Warming trend', metric: 'tmean', value: `${dT > 0 ? '+' : ''}${dT.toFixed(1)} °C`, s: dT / 1.5 },
        {
          stage: 'Rainfall pattern shift',
          metric: 'rainfall',
          value: `${pc(rr) > 0 ? '+' : ''}${pc(rr).toFixed(0)}%`,
          s: -pc(rr) / 20,
        },
        {
          stage: 'Atmospheric water demand',
          metric: 'et0',
          value: `${pc(et) > 0 ? '+' : ''}${pc(et).toFixed(0)}% ET₀`,
          s: pc(et) / 8,
        },
        {
          stage: 'Soil moisture stress',
          metric: 'soilMoisture',
          value: `${pc(sm) > 0 ? '+' : ''}${pc(sm).toFixed(0)}%`,
          s: -pc(sm) / 20,
        },
        {
          stage: 'Irrigation demand',
          metric: 'cwr',
          value: `${pc(et) - pc(rr) * 0.6 > 0 ? '+' : ''}${(pc(et) - pc(rr) * 0.6).toFixed(0)}%`,
          s: (pc(et) - pc(rr) * 0.6) / 15,
        },
        {
          stage: 'Streamflow response',
          metric: 'runoff',
          value: `${pc(q) > 0 ? '+' : ''}${pc(q).toFixed(0)}%`,
          s: -pc(q) / 30,
        },
      ];
      return table(
        'signal-chain',
        [col.text('stage', 'Signal'), col.text('value', 'Change'), col.cls('cls', 'Severity', 'risk')],
        rows.map((r) => ({
          stage: r.stage,
          metric: r.metric,
          value: r.value,
          cls: sev(clamp(r.s, 0, 1)),
          scale: 'risk',
          bar: Math.round(clamp(r.s, 0, 1) * 100),
        })),
      );
    },
    'forecast-summary': (ctx) => {
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      const t = (y: number) => regionMean(ctx.scope.cells, (i) => projTemp(i, y, sc)) ?? 0;
      const p = (y: number) => regionMean(ctx.scope.cells, (i) => projRainPct(i, y, sc)) ?? 0;
      const base = mean(annualMeans(regionSeries(ctx.scope, 'tmean'), 1991, 2020).map((x) => x.value));
      const rows = [
        { ind: 'Mean temperature (°C)', base: round(base, 1), f: (y: number) => `+${round(t(y), 1)}`, dir: 1 },
        { ind: 'Annual rainfall (%)', base: '—', f: (y: number) => `${round(p(y), 0)}%`, dir: -1 },
        { ind: 'Extreme heat days (days/yr)', base: '—', f: (y: number) => `+${round(t(y) * 13, 0)}`, dir: 1 },
        { ind: 'Drought frequency (%)', base: '—', f: (y: number) => `+${round(t(y) * 18 - p(y) * 2, 0)}%`, dir: 1 },
        { ind: 'Runoff (mean, %)', base: '—', f: (y: number) => `${round(p(y) * 2.2 - t(y) * 4, 0)}%`, dir: -1 },
        { ind: 'Dam inflows (mean, %)', base: '—', f: (y: number) => `${round(p(y) * 2.4 - t(y) * 5, 0)}%`, dir: -1 },
        { ind: 'Water demand (%)', base: '—', f: (y: number) => `+${round(t(y) * 6 + 2, 0)}%`, dir: 1 },
      ];
      return table(
        'forecast-summary',
        [
          col.text('ind', 'Indicator'),
          col.text('base', 'Baseline (1991–2020)'),
          col.text('y2030', '2030'),
          col.text('y2050', '2050'),
          col.text('y2070', '2070'),
        ],
        rows.map((r) => ({ ind: r.ind, base: String(r.base), y2030: r.f(2030), y2050: r.f(2050), y2070: r.f(2070) })),
      );
    },
    'risk-outlook': (ctx) => {
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      const t = regionMean(ctx.scope.cells, (i) => projTemp(i, 2050, sc)) ?? 0;
      const lvl = (x: number) => (x > 0.66 ? 'High' : x > 0.4 ? 'Moderate' : 'Low');
      const risks: [string, number][] = [
        ['Heat stress', t / 2.2],
        ['Water scarcity', t / 2.4 + 0.15],
        ['Agricultural productivity', t / 3],
        ['Urban water supply', t / 3.2 + 0.1],
        ['Ecosystem health', t / 2.6],
        ['Flood risk (localised)', 0.45],
        ['Sea level rise (coastal)', 0.5],
        ['Groundwater recharge', t / 2.5 + 0.1],
      ];
      return table(
        'risk-outlook',
        [col.text('risk', 'Risk'), col.cls('level', 'Risk level (2050)', 'risk')],
        risks.map(([risk, x]) => ({ risk, level: lvl(x) })),
      );
    },
  },

  map: {
    'temp-trend': () =>
      gridLayer('temp-trend', 'Temperature trend 1981–present (°C/decade)', 'tempTrend', '°C/decade', cellTempTrend),
    'temp-anomaly': () =>
      gridLayer('temp-anomaly', 'Temperature anomaly, last 12 months (°C)', 'tempAnomaly', '°C', (i) => {
        const t = cellTemp(i).tmean;
        const L = END_LAST();
        let s = 0;
        for (let mi = L - 11; mi <= L; mi++)
          s += t[tOf(mi)] - mean(Array.from({ length: 30 }, (_, k) => t[tOf(monthIndex(1981 + k, miMonth(mi)))]));
        return s / 12;
      }),
    'mean-temp': () =>
      gridLayer('mean-temp', 'Mean annual temperature (°C)', 'temperature', '°C', (i) => CELLS[i].tMean + 0.4, 1),
    'rain-trend': () =>
      gridLayer(
        'rain-trend',
        'Rainfall change, last decade vs 1981–2010 (%)',
        'anomalyPct',
        '%',
        (i) => {
          const r = cellRain(i);
          const tot = (a: number, b: number) =>
            mean(
              Array.from({ length: b - a + 1 }, (_, k) =>
                Array.from({ length: 12 }, (__, m) => r[tOf(monthIndex(a + k, m))]).reduce((x, y) => x + y, 0),
              ),
            );
          const bse = tot(1981, 2010);
          return bse > 5 ? ((tot(2015, 2024) - bse) / bse) * 100 : null;
        },
        0,
      ),
    'hot-days': () =>
      gridLayer(
        'hot-days',
        `Hot days (Tmax > 35 °C), ${miYear(END_LAST()) - 1}`,
        'days',
        'days',
        (i) => cellEtccdi(i, miYear(END_LAST()) - 1).hotDays,
        0,
      ),
    cdd: () =>
      gridLayer(
        'cdd',
        `Consecutive dry days, ${miYear(END_LAST()) - 1}`,
        'days',
        'days',
        (i) => cellEtccdi(i, miYear(END_LAST()) - 1).cdd,
        0,
      ),
    et0: () =>
      gridLayer(
        'et0',
        'Reference ET₀ (mm/yr, 1981–2010)',
        'rainfall',
        'mm',
        (i) =>
          mean(
            Array.from({ length: 30 }, (_, k) =>
              Array.from({ length: 12 }, (__, m) => cellPet(i)[tOf(monthIndex(1981 + k, m))]).reduce(
                (x, y) => x + y,
                0,
              ),
            ),
          ),
        0,
      ),
    vulnerability: () =>
      choropleth('vulnerability', 'Climate vulnerability index', 'municipality', 'index01', '', (id, cells) => {
        const svc = MUNI_SERVICES.find((m) => m.id === id);
        const arid = regionMean(cells, (i) => CELLS[i].aridity) ?? 0.5;
        const tr = regionMean(cells, cellTempTrend) ?? 0.2;
        return clamp(
          0.35 * arid +
            0.25 * clamp(tr / 0.4, 0, 1) +
            0.25 * ((svc?.belowRdp ?? 10) / 30) +
            0.15 * (svc?.distressed ? 1 : 0.3),
          0,
          1,
        );
      }),
    'proj-temp': (ctx) => {
      const y = Number(ctx.q('year') ?? 2050);
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      return gridLayer(
        'proj-temp',
        `Projected temperature change ${y} (°C, ${sc === 'rcp85' ? 'RCP 8.5' : 'RCP 4.5'})`,
        'tempAnomaly',
        '°C',
        (i) => projTemp(i, y, sc),
        1,
      );
    },
    'proj-rain': (ctx) => {
      const y = Number(ctx.q('year') ?? 2050);
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      return gridLayer(
        'proj-rain',
        `Projected rainfall change ${y} (%, ${sc === 'rcp85' ? 'RCP 8.5' : 'RCP 4.5'})`,
        'anomalyPct',
        '%',
        (i) => projRainPct(i, y, sc),
        0,
      );
    },
    'proj-spi': (ctx) => {
      const y = Number(ctx.q('year') ?? 2050);
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      return gridLayer(
        'proj-spi',
        `Projected SPI change ${y}`,
        'spi',
        '',
        (i) => projRainPct(i, y, sc) / 12 - projTemp(i, y, sc) * 0.25,
        2,
      );
    },
    'proj-availability': (ctx) => {
      const y = Number(ctx.q('year') ?? 2050);
      const sc: Scen = ctx.q('scenario') === 'rcp45' ? 'rcp45' : 'rcp85';
      return gridLayer(
        'proj-availability',
        `Projected water availability change ${y} (%)`,
        'anomalyPct',
        '%',
        (i) => projRainPct(i, y, sc) * 2.2 - projTemp(i, y, sc) * 4,
        0,
      );
    },
  },
};

function END_LAST() {
  return END_MI - 1;
}
