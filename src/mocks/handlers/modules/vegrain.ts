/** Vegetation Condition (spec §5) and Rainfall Status (spec §6). */
import { vegClass } from '@/config/thresholds';
import { SCALES } from '@/config/palettes';
import { MONTH_NAMES } from '@/lib/format';
import { Rng } from '@/lib/prng';
import { clamp, mean, round, sensSlope } from '@/lib/stats';
import { miMonth, miToIso, miYear, monthIndex, season } from '@/lib/time';
import { MUNICIPALITIES, PROVINCE_ORDER, municipalityById, provinceName } from '../../reference/regions';
import { CELLS, END_MI, START_MI, cellNdvi, cellRain, cellTemp, cellWaterBalance } from '../../generators/climate';
import {
  LAST,
  cellSpi,
  cellVci,
  regionClimatology,
  regionEnvelope,
  regionSeries,
  regionSpei,
  regionSpi,
  regionTci,
  regionVci,
  regionVhi,
  sumMonths,
  normalMonths,
  tailAt,
  tOf,
  annualTotals,
} from '../../generators/hydromet';
import { cellDailyRain, cellEtccdi, scopeEtccdi, stationCells } from '../../generators/daily';
import { dampedForecast, forecastSeries } from '../../generators/forecast';
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
import { cellsOf, choropleth, gridLayer, regionMean, spark } from '../common';
import { DROUGHT_BANDS, rainAnomalyPct, outlookShift, cellForecastSpi } from './drought';

const win = (ctx: Ctx, min = 24) => Math.min(ctx.from, ctx.to - min + 1);

// ------------------------------------------------------------------ vegetation indices derived from NDVI / LST / soil moisture
type VegIdx =
  'ndvi' | 'evi' | 'savi' | 'msavi2' | 'vci' | 'vhi' | 'tci' | 'vpi' | 'asi' | 'svi' | 'ndwi' | 'ndii' | 'lst' | 'sm';
export const VEG_INDICES: { id: VegIdx; label: string; unit: string; scale: string; min: number; max: number }[] = [
  { id: 'ndvi', label: 'NDVI', unit: '', scale: 'ndvi', min: 0, max: 1 },
  { id: 'evi', label: 'EVI', unit: '', scale: 'ndvi', min: 0, max: 1 },
  { id: 'savi', label: 'SAVI', unit: '', scale: 'ndvi', min: 0, max: 1 },
  { id: 'msavi2', label: 'MSAVI2', unit: '', scale: 'ndvi', min: 0, max: 1 },
  { id: 'vci', label: 'VCI', unit: '%', scale: 'vci', min: 0, max: 100 },
  { id: 'vhi', label: 'VHI', unit: '%', scale: 'vci', min: 0, max: 100 },
  { id: 'tci', label: 'TCI', unit: '%', scale: 'vci', min: 0, max: 100 },
  { id: 'vpi', label: 'VPI', unit: '%', scale: 'vci', min: 0, max: 100 },
  { id: 'asi', label: 'ASI', unit: '%', scale: 'percent', min: 0, max: 100 },
  { id: 'svi', label: 'SVI', unit: '', scale: 'spi', min: -3, max: 3 },
  { id: 'ndwi', label: 'NDWI', unit: '', scale: 'ndvi', min: -0.5, max: 0.6 },
  { id: 'ndii', label: 'NDII', unit: '', scale: 'ndvi', min: -0.5, max: 0.6 },
  { id: 'lst', label: 'LST', unit: '°C', scale: 'lst', min: 10, max: 50 },
  { id: 'sm', label: 'Soil moisture', unit: 'm³/m³', scale: 'soilMoisture', min: 0, max: 0.4 },
];

function idxFromBase(
  id: VegIdx,
  ndvi: number,
  vci: number,
  tci: number,
  tmax: number,
  sm: number,
  zNdvi: number,
): number {
  switch (id) {
    case 'ndvi':
      return ndvi;
    case 'evi':
      return clamp(0.86 * ndvi - 0.03, -0.1, 1);
    case 'savi':
      return clamp(0.91 * ndvi - 0.01, -0.1, 1);
    case 'msavi2':
      return clamp(0.88 * ndvi - 0.02, -0.1, 1);
    case 'vci':
      return vci;
    case 'tci':
      return tci;
    case 'vhi':
      return 0.5 * vci + 0.5 * tci;
    case 'vpi':
      return clamp(50 + zNdvi * 30, 0, 100);
    case 'asi':
      return clamp(100 - (0.5 * vci + 0.5 * tci) * 1.6, 0, 100);
    case 'svi':
      return zNdvi;
    case 'ndwi':
      return clamp(ndvi - 0.38 + sm * 0.8, -0.6, 0.7);
    case 'ndii':
      return clamp(ndvi - 0.28 + sm * 0.9, -0.6, 0.7);
    case 'lst':
      return tmax + 5 - 7 * ndvi;
    case 'sm':
      return sm;
  }
}

function regionIdxSeries(scope: ResolvedScope, id: VegIdx): Float64Array {
  const nd = regionSeries(scope, 'ndvi');
  const vci = regionVci(scope);
  const tci = regionTci(scope);
  const tx = regionSeries(scope, 'tmax');
  const sm = regionSeries(scope, 'sm');
  const clim = regionClimatology(scope, 'ndvi');
  const env = regionEnvelope(scope, 'ndvi');
  return Float64Array.from(nd, (v, t) => {
    const m = miMonth(START_MI + t);
    const z = (v - clim[m]) / Math.max(0.01, (env.p90[m] - env.p10[m]) / 2.56);
    return idxFromBase(id, v, vci[t], tci[t], tx[t], sm[t], z);
  });
}

function cellIdx(i: number, id: VegIdx, mi: number): number {
  const t = tOf(mi);
  const nd = cellNdvi(i)[t];
  const vci = cellVci(i)[t];
  const tx = cellTemp(i).tmax[t];
  const sm = cellWaterBalance(i).surface[t];
  const tci = clamp(
    50 -
      (tx - (CELLS[i].tMean + CELLS[i].dtr / 2 + CELLS[i].tAmp * Math.cos(((miMonth(mi) - 0.5) / 12) * 2 * Math.PI))) *
        12,
    0,
    100,
  );
  return idxFromBase(id, nd, vci, tci, tx, sm, (vci - 50) / 30);
}

const LAND_COVER: [string, number, number][] = [
  // class, share of area %, mean NDVI
  ['Natural vegetation', 48, 0.45],
  ['Agriculture', 20, 0.46],
  ['Rangeland', 18, 0.32],
  ['Forest', 6, 0.68],
  ['Urban', 4, 0.28],
  ['Water bodies', 2, 0.05],
  ['Other', 2, 0.18],
];

export const vegetation: ModuleHandlers = {
  summary: (ctx) => {
    const s = ctx.scope;
    const L = ctx.last;
    const nd = regionSeries(s, 'ndvi');
    const vci = regionVci(s);
    const vhi = regionVhi(s);
    const tci = regionTci(s);
    const tx = regionSeries(s, 'tmax');
    const sm = regionSeries(s, 'sm');
    const clim = regionClimatology(s, 'ndvi');
    const stress = (mi: number) => (s.cells.filter((i) => cellVci(i)[tOf(mi)] < 35).length / s.cells.length) * 100;
    const anom = (mi: number) => ((nd[tOf(mi)] - clim[miMonth(mi)]) / clim[miMonth(mi)]) * 100;
    return [
      kpi('ndvi', 'ndvi', nd[tOf(L)], {
        label: 'NDVI (Mean)',
        sublabel: s.level === 'national' ? 'National' : s.name,
        delta: nd[tOf(L)] - nd[tOf(L - 12)],
        deltaUnit: '',
        deltaLabel: 'vs last year',
        spark: spark((mi) => nd[tOf(mi)], L, 24),
      }),
      kpi('vci', 'vci', vci[tOf(L)], {
        label: 'VCI (Current)',
        delta: vci[tOf(L)] - vci[tOf(L - 12)],
        deltaUnit: ' pp',
        deltaLabel: 'vs last year',
        spark: spark((mi) => vci[tOf(mi)], L, 24),
      }),
      kpi('vhi', 'vhi', vhi[tOf(L)], {
        label: 'VHI (Current)',
        delta: vhi[tOf(L)] - vhi[tOf(L - 12)],
        deltaUnit: ' pp',
        deltaLabel: 'vs last year',
        spark: spark((mi) => vhi[tOf(mi)], L, 24),
      }),
      kpi('tci', 'tci', tci[tOf(L)], {
        label: 'TCI (Current)',
        delta: tci[tOf(L)] - tci[tOf(L - 12)],
        deltaUnit: ' pp',
        deltaLabel: 'vs last year',
        spark: spark((mi) => tci[tOf(mi)], L, 24),
      }),
      kpi('lst', 'lst', idxFromBase('lst', nd[tOf(L)], 0, 0, tx[tOf(L)], 0, 0), {
        label: 'Land Surface Temp (LST)',
        delta:
          idxFromBase('lst', nd[tOf(L)], 0, 0, tx[tOf(L)], 0, 0) -
          idxFromBase('lst', nd[tOf(L - 12)], 0, 0, tx[tOf(L - 12)], 0, 0),
        deltaUnit: ' °C',
        deltaLabel: 'vs last year',
        spark: spark((mi) => tx[tOf(mi)] + 5 - 7 * nd[tOf(mi)], L, 24),
      }),
      kpi('sm', 'soilMoisture', sm[tOf(L)], {
        label: 'Soil Moisture (Surface)',
        delta: sm[tOf(L)] - sm[tOf(L - 12)],
        deltaUnit: '',
        deltaLabel: 'vs last year',
        spark: spark((mi) => sm[tOf(mi)], L, 24),
      }),
      kpi('stress', 'vegStressArea', stress(L), {
        label: 'Area Under Stress',
        sublabel: 'VCI < 35%',
        delta: stress(L) - stress(L - 12),
        deltaUnit: ' pp',
        deltaLabel: 'vs last year',
      }),
      kpi('anom', 'vegAnomaly', anom(L), {
        label: 'Vegetation Anomaly',
        sublabel: 'NDVI vs 1981–2010',
        spark: spark(anom, L, 24),
      }),
    ];
  },
  timeseries: {
    indices: (ctx) => {
      const ids = (ctx.q('set') ?? 'ndvi,evi,savi,msavi2').split(',') as VegIdx[];
      const from = win(ctx, 36);
      const defs = VEG_INDICES.filter((d) => ids.includes(d.id));
      const pct = defs[0]?.unit === '%';
      return seriesSet(
        'indices',
        [{ unit: defs[0]?.unit ?? '', label: 'Index value', min: pct ? 0 : undefined, max: pct ? 100 : undefined }],
        defs.map((d, k) =>
          line(
            d.id,
            d.label,
            monthly(from, ctx.to, (mi) => regionIdxSeries(ctx.scope, d.id)[tOf(mi)]),
            { color: ['#2E7D32', '#1565C0', '#F2A900', '#E53935'][k % 4] },
          ),
        ),
      );
    },
    'index-trend': (ctx) => {
      const id = (ctx.q('index') ?? 'ndvi') as VegIdx;
      const d = VEG_INDICES.find((x) => x.id === id)!;
      const s = regionIdxSeries(ctx.scope, id);
      const from = win(ctx, 24);
      const clim = Array.from({ length: 12 }, (_, m) =>
        mean(Array.from({ length: 30 }, (__, k) => s[tOf(monthIndex(1991 + k, m))])),
      );
      const sdv = Array.from({ length: 12 }, (_, m) => {
        const xs = Array.from({ length: 30 }, (__, k) => s[tOf(monthIndex(1991 + k, m))]);
        return Math.sqrt(mean(xs.map((x) => (x - clim[m]) ** 2)));
      });
      return seriesSet(
        'index-trend',
        [{ unit: d.unit, label: d.label }],
        [
          band(
            'normal',
            'Normal range (±1 s.d., 1991–2020)',
            monthly(from, ctx.to, () => 0).map(([x], j) => [
              x,
              clim[miMonth(from + j)] - sdv[miMonth(from + j)],
              clim[miMonth(from + j)] + sdv[miMonth(from + j)],
            ]),
            { color: '#A5D6A7' },
          ),
          line(
            'cur',
            `${d.label} (current)`,
            monthly(from, ctx.to, (mi) => s[tOf(mi)]),
            { color: '#2E7D32', symbol: true },
          ),
          line(
            'prev',
            `${d.label} (previous year)`,
            monthly(from, ctx.to, (mi) => s[tOf(mi - 12)]),
            { color: '#E53935', dash: true },
          ),
        ],
      );
    },
    anomaly: (ctx) => {
      const s = regionSeries(ctx.scope, 'ndvi');
      const clim = regionClimatology(ctx.scope, 'ndvi');
      const from = win(ctx, 24);
      const pts = monthly(from, ctx.to, (mi) => ((s[tOf(mi)] - clim[miMonth(mi)]) / clim[miMonth(mi)]) * 100);
      return seriesSet(
        'veg-anomaly',
        [{ unit: '%', label: 'NDVI anomaly' }],
        [
          bar(
            'pos',
            'Positive anomaly',
            pts.map(([x, y]) => [x, y != null && y >= 0 ? y : null]),
            { color: '#2E9E5B', stack: 'a' },
          ),
          bar(
            'neg',
            'Negative anomaly',
            pts.map(([x, y]) => [x, y != null && y < 0 ? y : null]),
            { color: '#E95F35', stack: 'a' },
          ),
        ],
      );
    },
    drivers: (ctx) => {
      const v = ctx.q('var') ?? 'rain';
      const from = win(ctx, 36);
      const s = regionSeries(ctx.scope, v === 'temp' ? 'tmax' : v === 'pet' ? 'pet' : v === 'sm' ? 'sm' : 'rain');
      const unit = v === 'temp' ? '°C' : v === 'sm' ? 'm³/m³' : 'mm';
      return seriesSet(
        `driver-${v}`,
        [
          {
            unit,
            label:
              v === 'temp' ? 'Max temperature' : v === 'pet' ? 'PET / ET₀' : v === 'sm' ? 'Soil moisture' : 'Rainfall',
          },
        ],
        [
          (v === 'rain' ? bar : line)(
            'v',
            v === 'temp' ? 'Tmax' : v === 'pet' ? 'ET₀' : v === 'sm' ? 'Soil moisture' : 'Rainfall',
            monthly(from, ctx.to, (mi) => s[tOf(mi)]),
            { color: v === 'temp' ? '#E53935' : v === 'pet' ? '#F2A900' : v === 'sm' ? '#0FA3B1' : '#1E88E5' },
          ),
        ],
        { note: ctx.scope.name },
      );
    },
  },
  breakdown: {
    'land-cover': (ctx) => {
      const kind = ctx.q('kind') ?? 'ndvi';
      const nd = regionSeries(ctx.scope, 'ndvi')[tOf(ctx.last)];
      const f = nd / 0.42;
      if (kind === 'share') {
        const tot = ctx.scope.cells.reduce((s, i) => s + CELLS[i].areaKm2, 0) / 10000; // Mha
        return categories(
          'land-cover-share',
          'M ha',
          LAND_COVER.map((l) => l[0]),
          [{ key: 'a', name: 'Area', values: LAND_COVER.map((l) => (l[1] / 100) * tot * 100) }],
          {
            colors: LAND_COVER.map((l) => SCALES.vegetationCover.bins.find((b) => b.id === l[0])!.color),
            center: { value: `${round(tot * 100, 1)} M ha`, label: 'Total area' },
          },
        );
      }
      return categories(
        'land-cover',
        '',
        LAND_COVER.map((l) => l[0]),
        [{ key: 'n', name: 'Mean NDVI', values: LAND_COVER.map((l) => clamp(l[2] * f, 0, 0.9)) }],
        { colors: LAND_COVER.map((l) => SCALES.vegetationCover.bins.find((b) => b.id === l[0])!.color) },
      );
    },
    classification: (ctx) => {
      const counts: Record<string, number> = {};
      ctx.scope.cells.forEach((i) => {
        const c = vegClass(cellVci(i)[tOf(ctx.last)]);
        counts[c] = (counts[c] ?? 0) + CELLS[i].areaKm2;
      });
      const cats = ['Very Healthy', 'Healthy', 'Moderate', 'Stressed', 'Very Stressed'];
      const tot = Object.values(counts).reduce((a, b) => a + b, 0);
      const healthy = ((counts['Very Healthy'] ?? 0) + (counts.Healthy ?? 0)) / tot;
      return categories(
        'classification',
        '%',
        cats,
        [{ key: 'a', name: 'Area', values: cats.map((c) => ((counts[c] ?? 0) / tot) * 100) }],
        {
          colors: cats.map((c) => SCALES.vci.bins.find((b) => b.id === c)!.color),
          center: { value: `${round(healthy * 100, 0)}%`, label: 'Healthy' },
        },
      );
    },
    'by-province': (ctx) => {
      const cats = ['Very Healthy', 'Healthy', 'Moderate', 'Stressed', 'Very Stressed'];
      const rows = PROVINCE_ORDER.map((p) => {
        const cs = cellsOf('province', p);
        return cats.map((c) => (cs.filter((i) => vegClass(cellVci(i)[tOf(ctx.last)]) === c).length / cs.length) * 100);
      });
      return categories(
        'by-province',
        '%',
        PROVINCE_ORDER,
        cats.map((c, k) => ({
          key: c,
          name: c,
          values: rows.map((r) => r[k]),
          color: SCALES.vci.bins.find((b) => b.id === c)!.color,
          stack: 's',
        })),
      );
    },
    seasonal: (ctx) => {
      const nd = regionSeries(ctx.scope, 'ndvi');
      const years = Array.from({ length: 7 }, (_, k) => miYear(ctx.last) - 6 + k);
      const seasons = ['DJF', 'MAM', 'JJA', 'SON'];
      return categories(
        'seasonal',
        '',
        years.map(String),
        seasons.map((se, k) => ({
          key: se,
          name: se,
          values: years.map((y) => {
            const xs = Array.from({ length: 12 }, (_, m) => monthIndex(y, m))
              .filter((mi) => season(miMonth(mi)) === se && mi <= ctx.last)
              .map((mi) => nd[tOf(mi)]);
            return xs.length ? mean(xs) : null;
          }),
          color: ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD'][k],
        })),
      );
    },
    drivers: (ctx) => {
      const s = ctx.scope;
      const L = ctx.last;
      const pct = (v: 'rain' | 'pet' | 'sm', n = 6) => {
        const x = regionSeries(s, v);
        const c = regionClimatology(s, v);
        return ((sumMonths(x, L, n) - normalMonths(c, L, n)) / normalMonths(c, L, n)) * 100;
      };
      const t = regionSeries(s, 'tmean');
      const tc = regionClimatology(s, 'tmean');
      const dT = mean(Array.from({ length: 6 }, (_, k) => t[tOf(L - k)] - tc[miMonth(L - k)]));
      return categories(
        'drivers',
        '%',
        ['Rainfall', 'Soil moisture', 'Temperature (°C ×10)', 'Evapotranspiration', 'Land cover change'],
        [
          {
            key: 'v',
            name: 'Change vs normal (6 months)',
            values: [pct('rain'), pct('sm'), dT * 10, pct('pet'), -2.5],
          },
        ],
        { colors: ['#1E88E5', '#0FA3B1', '#E53935', '#F2A900', '#6D4C41'] },
      );
    },
  },
  table: {
    provinces: (ctx) =>
      table(
        'provinces',
        [
          col.rank(),
          col.text('name', 'Province'),
          col.num('ndvi', 'Mean NDVI', '', 2),
          col.num('vci', 'VCI', '%', 0, { scale: 'vci' }),
          col.cls('cls', 'Health status', 'vci'),
          col.trend('chg', 'Change', 'up', '%', 0),
        ],
        PROVINCE_ORDER.map((p) => {
          const sc = resolveScope({ province: p });
          const nd = regionSeries(sc, 'ndvi');
          const v = regionVci(sc)[tOf(ctx.last)];
          return {
            name: provinceName(p),
            ndvi: nd[tOf(ctx.last)],
            vci: v,
            cls: vegClass(v),
            chg: ((nd[tOf(ctx.last)] - nd[tOf(ctx.last - 12)]) / nd[tOf(ctx.last - 12)]) * 100,
          };
        }).sort((a, b) => b.vci - a.vci),
      ),
    hotspots: (ctx) => {
      const rows = MUNICIPALITIES.filter((m) => ctx.scope.includes(m))
        .map((m) => {
          const cs = cellsOf('municipality', m.id);
          const now = regionMean(cs, (i) => cellNdvi(i)[tOf(ctx.last)]) ?? 0;
          const ly = regionMean(cs, (i) => cellNdvi(i)[tOf(ctx.last - 12)]) ?? 0;
          const vci = regionMean(cs, (i) => cellVci(i)[tOf(ctx.last)]) ?? 50;
          return {
            id: m.id,
            name: m.name,
            province: m.province,
            change: round(now - ly, 2),
            vci,
            cls: vci < 20 ? 'Extreme' : vci < 30 ? 'High' : vci < 40 ? 'Moderate' : 'Low',
          };
        })
        .sort((a, b) => a.vci - b.vci)
        .slice(0, 10);
      return table(
        'hotspots',
        [
          col.rank(),
          col.text('name', 'Municipality'),
          col.text('province', 'Prov.'),
          col.delta('change', 'NDVI change', 'up', '', 2),
          col.num('vci', 'VCI', '%', 0, { scale: 'vci' }),
          col.cls('cls', 'Stress', 'risk'),
        ],
        rows,
      );
    },
    'forecast-indicators': (ctx) => {
      const s = ctx.scope;
      const nd = regionSeries(s, 'ndvi');
      const fc = (x0: number, mu: number, sig: number, key: string) =>
        dampedForecast(`veg-${key}-${s.key}`, x0, {
          mu,
          phi: 0.85,
          sigma: sig,
          horizon: 12,
          startMi: ctx.last,
          outlook: outlookShift(s.key) * sig * 0.6,
        });
      const L = ctx.last;
      const clim = regionClimatology(s, 'ndvi');
      const ndF = fc(nd[tOf(L)], clim[miMonth(L)], 0.05, 'ndvi')[11].median;
      const vci = regionVci(s)[tOf(L)];
      const vciF = fc(vci, 50, 15, 'vci')[11].median;
      const rows = [
        { ind: 'Mean NDVI', cur: round(nd[tOf(L)], 2), f: round(ndF, 2), up: true },
        { ind: 'VCI (%)', cur: round(vci, 0), f: round(vciF, 0), up: true },
        {
          ind: 'Vegetation under stress (%)',
          cur: round(100 - vci * 1.1, 0),
          f: round(100 - vciF * 1.1, 0),
          up: false,
        },
        { ind: 'EVI', cur: round(0.86 * nd[tOf(L)] - 0.03, 2), f: round(0.86 * ndF - 0.03, 2), up: true },
        {
          ind: 'Recovery probability (%)',
          cur: '—',
          f: round(clamp(50 + (vciF - vci) * 1.5 + 10, 5, 95), 0),
          up: true,
        },
      ];
      return table(
        'forecast-indicators',
        [
          col.text('ind', 'Indicator'),
          col.text('cur', 'Current'),
          col.text('f', 'Forecast (12 months)'),
          col.text('chg', 'Change'),
        ],
        rows.map((r) => ({
          ind: r.ind,
          cur: String(r.cur),
          f: String(r.f),
          chg: typeof r.cur === 'number' ? `${r.f - r.cur >= 0 ? '+' : ''}${round(Number(r.f) - r.cur, 2)}` : '—',
        })),
      );
    },
  },
  map: Object.fromEntries([
    ...VEG_INDICES.map((d) => [
      d.id,
      () =>
        gridLayer(
          d.id,
          `${d.label}${d.unit ? ` (${d.unit})` : ''} – ${MONTH_NAMES[miMonth(LAST)]} ${miYear(LAST)}`,
          d.scale,
          d.unit,
          (i) => cellIdx(i, d.id, LAST),
          d.unit === '%' ? 0 : 2,
        ),
    ]),
    [
      'ndvi-anomaly',
      () =>
        gridLayer(
          'ndvi-anomaly',
          'NDVI anomaly vs same month 1981–2010',
          'ndviAnomaly',
          '',
          (i) =>
            cellNdvi(i)[tOf(LAST)] -
            mean(Array.from({ length: 30 }, (_, k) => cellNdvi(i)[tOf(monthIndex(1981 + k, miMonth(LAST)))])),
          2,
        ),
    ],
    [
      'ndvi-trend',
      () =>
        gridLayer(
          'ndvi-trend',
          "NDVI trend (Sen's slope per decade, 2001–present)",
          'ndviTrend',
          '/decade',
          (i) => {
            const nd = cellNdvi(i);
            const ys: number[] = [];
            const vs: number[] = [];
            for (let y = 2001; y < miYear(LAST); y++) {
              ys.push(y);
              vs.push(mean(Array.from({ length: 12 }, (_, m) => nd[tOf(monthIndex(y, m))])));
            }
            return sensSlope(vs, ys) * 10;
          },
          3,
        ),
    ],
    [
      'forecast-ndvi',
      () =>
        gridLayer(
          'forecast-ndvi',
          'NDVI forecast (12 months, median)',
          'ndvi',
          '',
          (i) => clamp(cellNdvi(i)[tOf(LAST)] + (cellForecastSpi(i, 6) ?? 0) * 0.025, 0, 0.9),
          2,
        ),
    ],
    [
      'forecast-anomaly',
      () =>
        gridLayer(
          'forecast-anomaly',
          'NDVI anomaly forecast (12 months)',
          'ndviAnomaly',
          '',
          (i) => (cellForecastSpi(i, 6) ?? 0) * 0.05,
          2,
        ),
    ],
  ]),
  forecast: {
    ndvi: (ctx) => {
      const s = regionSeries(ctx.scope, 'ndvi');
      const clim = regionClimatology(ctx.scope, 'ndvi');
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 23; mi <= ctx.last; mi++) hist.push([mi, s[tOf(mi)]]);
      const L = ctx.last;
      const anom0 = s[tOf(L)] - clim[miMonth(L)];
      const fc = dampedForecast(`ndvi-${ctx.scope.key}`, anom0, {
        mu: 0,
        phi: 0.82,
        sigma: 0.05,
        horizon: 12,
        startMi: L,
        outlook: outlookShift(ctx.scope.key) * 0.02,
      }).map((p) => ({
        ...p,
        median: p.median + clim[miMonth(p.mi)],
        p10: p.p10 + clim[miMonth(p.mi)],
        p90: p.p90 + clim[miMonth(p.mi)],
      }));
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'ndvi-forecast',
        [{ unit: '', label: 'NDVI', min: 0, max: 1 }],
        [
          band('band', f.names.band, f.band, { color: '#90CAF9' }),
          line('obs', 'Historical NDVI', f.observed, { color: '#13233A', symbol: true }),
          line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true }),
        ],
        { asOf: miToIso(L), note: ctx.scope.name },
      );
    },
    'recovery-probability': (ctx) => {
      // returned as a series of probability per province (category x)
      return {
        id: 'recovery-probability',
        xType: 'category',
        axes: [{ unit: '%', label: 'Probability', min: 0, max: 100 }],
        series: [
          bar(
            'p',
            'Recovery probability (12 months)',
            PROVINCE_ORDER.map((p) => {
              const sc = resolveScope({ province: p });
              const v = regionVci(sc)[tOf(ctx.last)];
              return [p, round(clamp(55 + outlookShift(sc.key) * 40 + (50 - v) * 0.25, 5, 95), 0)] as [string, number];
            }),
            { color: '#2E9E5B' },
          ),
        ],
      };
    },
  },
};

// =================================================================== Rainfall (spec §6)
export const rainfall: ModuleHandlers = {
  summary: (ctx) => {
    const s = ctx.scope;
    const L = ctx.last;
    const r = regionSeries(s, 'rain');
    const clim = regionClimatology(s, 'rain');
    const r12 = sumMonths(r, L, 12);
    const n12 = normalMonths(clim, L, 12);
    const y = miYear(L) - (miMonth(L) === 11 ? 0 : 1);
    const ex = scopeEtccdi(s.cells, y);
    const exPrev = scopeEtccdi(s.cells, y - 1);
    const spi6 = regionSpi(s, 6);
    const spei6 = regionSpei(s, 6);
    const stations = Math.round(802 * (s.cells.length / CELLS.length));
    return [
      kpi('total', 'rainfall', r12, {
        label: 'Total Rainfall',
        sublabel: 'Last 12 months',
        delta: ((r12 - sumMonths(r, L - 12, 12)) / sumMonths(r, L - 12, 12)) * 100,
        deltaUnit: '%',
        deltaLabel: 'vs previous 12 months',
        spark: spark((mi) => r[tOf(mi)], L, 24),
      }),
      kpi('anom', 'rainfallAnomaly', ((r12 - n12) / n12) * 100, {
        label: 'Rainfall Anomaly',
        sublabel: '12 months vs 1981–2010',
        spark: spark((mi) => rainAnomalyPct(s, mi, 12), L, 24),
      }),
      kpi('r20', 'heavyRainDays', ex.r20mm, {
        label: 'Heavy Rain Days (R20mm)',
        sublabel: `${y}, station mean`,
        delta: ex.r20mm - exPrev.r20mm,
        deltaUnit: ' days',
        deltaLabel: 'vs previous year',
      }),
      kpi('rx1', 'maxDailyRain', ex.rx1day, {
        label: 'Max Daily Rainfall',
        sublabel: `Rx1day, ${y}`,
        delta: ex.rx1day - exPrev.rx1day,
        deltaUnit: ' mm',
        deltaLabel: 'vs previous year',
      }),
      kpi('cdd', 'cdd', ex.cdd, {
        label: 'Consecutive Dry Days',
        sublabel: `CDD, ${y}`,
        delta: ex.cdd - exPrev.cdd,
        deltaUnit: ' days',
        deltaLabel: 'vs previous year',
      }),
      kpi('spi6', 'spi', spi6[tOf(L)], {
        label: 'SPI-6',
        sublabel: s.level === 'national' ? 'National' : s.name,
        delta: (spi6[tOf(L)] ?? 0) - (spi6[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => spi6[tOf(mi)], L),
      }),
      kpi('spei6', 'spei', spei6[tOf(L)], {
        label: 'SPEI-6',
        sublabel: 'Rainfall + PET',
        delta: (spei6[tOf(L)] ?? 0) - (spei6[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => spei6[tOf(mi)], L),
      }),
      kpi('stations', 'activeStations', stations, {
        label: 'Active Rainfall Stations',
        sublabel: 'SAWS + partners',
        unit: '',
        delta: 3,
        deltaUnit: '%',
        deltaLabel: 'vs last year',
      }),
    ];
  },
  timeseries: {
    monthly: (ctx) => {
      const r = regionSeries(ctx.scope, 'rain');
      const clim = regionClimatology(ctx.scope, 'rain');
      const y = miYear(ctx.last);
      const yr = (yy: number) =>
        MONTH_NAMES.map(
          (n, m) => [n, monthIndex(yy, m) > ctx.last ? null : r[tOf(monthIndex(yy, m))]] as [string, number | null],
        );
      return {
        id: 'monthly',
        xType: 'category',
        axes: [{ unit: 'mm', label: 'Rainfall' }],
        series: [
          bar('y0', String(y), yr(y), { color: '#1565C0' }),
          line('y1', String(y - 1), yr(y - 1), { color: '#F2A900', symbol: true }),
          line('y2', String(y - 2), yr(y - 2), { color: '#2E9E5B', symbol: true }),
          line(
            'n',
            '1981–2010 mean',
            MONTH_NAMES.map((n, m) => [n, clim[m]]),
            { color: '#13233A', dash: true },
          ),
        ],
      };
    },
    anomaly: (ctx) => {
      const n = Number(ctx.q('window') ?? 1);
      const from = win(ctx, 12);
      const pts = monthly(from, ctx.to, (mi) => rainAnomalyPct(ctx.scope, mi, n));
      return seriesSet(
        'anomaly',
        [{ unit: '%', label: 'Anomaly' }],
        [
          bar(
            'pos',
            'Positive anomaly',
            pts.map(([x, y]) => [x, y != null && y >= 0 ? y : null]),
            { color: '#2E9E5B', stack: 'a' },
          ),
          bar(
            'neg',
            'Negative anomaly',
            pts.map(([x, y]) => [x, y != null && y < 0 ? y : null]),
            { color: '#E95F35', stack: 'a' },
          ),
        ],
      );
    },
    'spi-spei': (ctx) => {
      const from = win(ctx, 30);
      const sp = (k: number) => regionSpi(ctx.scope, k);
      const se = (k: number) => regionSpei(ctx.scope, k);
      return seriesSet(
        'spi-spei',
        [{ unit: '', label: 'Index', min: -3, max: 3 }],
        [
          line(
            'spi1',
            'SPI-1',
            monthly(from, ctx.to, (mi) => sp(1)[tOf(mi)]),
            { color: '#94A3B8' },
          ),
          line(
            'spi3',
            'SPI-3',
            monthly(from, ctx.to, (mi) => sp(3)[tOf(mi)]),
            { color: '#1565C0' },
          ),
          line(
            'spi6',
            'SPI-6',
            monthly(from, ctx.to, (mi) => sp(6)[tOf(mi)]),
            { color: '#E53935' },
          ),
          line(
            'spi12',
            'SPI-12',
            monthly(from, ctx.to, (mi) => sp(12)[tOf(mi)]),
            { color: '#2E9E5B' },
          ),
          line(
            'spei6',
            'SPEI-6',
            monthly(from, ctx.to, (mi) => se(6)[tOf(mi)]),
            { color: '#8E44AD', dash: true },
          ),
          line(
            'spei12',
            'SPEI-12',
            monthly(from, ctx.to, (mi) => se(12)[tOf(mi)]),
            { color: '#F2A900', dash: true },
          ),
        ],
        { bands: DROUGHT_BANDS },
      );
    },
    intensity: (ctx) => {
      const from = Math.max(win(ctx, 24), END_MI - 30);
      const st = stationCells(ctx.scope.cells, 16);
      return seriesSet(
        'intensity',
        [
          { unit: 'mm', label: 'Daily max rainfall' },
          { unit: 'days', label: 'R20mm days' },
        ],
        [
          bar(
            'max',
            'Daily max (mm)',
            monthly(from, ctx.to, (mi) => Math.max(...st.map((i) => Math.max(...cellDailyRain(i, mi))))),
            { color: '#1565C0' },
          ),
          line(
            'r20',
            'R20mm days (station mean)',
            monthly(from, ctx.to, (mi) => mean(st.map((i) => cellDailyRain(i, mi).filter((v) => v >= 20).length))),
            { axis: 1, color: '#F2A900', symbol: true },
          ),
        ],
      );
    },
    'dry-wet': (ctx) => {
      const from = Math.max(win(ctx, 24), END_MI - 30);
      const st = stationCells(ctx.scope.cells, 16);
      const spell = (mi: number, wet: boolean) =>
        mean(
          st.map((i) => {
            let best = 0;
            let run = 0;
            for (const v of cellDailyRain(i, mi)) {
              run = (wet ? v >= 1 : v < 1) ? run + 1 : 0;
              best = Math.max(best, run);
            }
            return best;
          }),
        );
      return seriesSet(
        'dry-wet',
        [{ unit: 'days', label: 'Spell length', min: 0 }],
        [
          line(
            'cdd',
            'CDD (dry days)',
            monthly(from, ctx.to, (mi) => spell(mi, false)),
            { color: '#E53935', symbol: true },
          ),
          line(
            'cwd',
            'CWD (wet days)',
            monthly(from, ctx.to, (mi) => spell(mi, true)),
            { color: '#1565C0', symbol: true },
          ),
        ],
      );
    },
    station: (ctx) => {
      const id = ctx.q('entityId');
      const m = (id && municipalityById.get(id)) || MUNICIPALITIES.find((x) => x.name === 'City of Tshwane')!;
      const sc = resolveScope({ municipality: m.id });
      const r = regionSeries(sc, 'rain');
      const from = win(ctx, 30);
      return seriesSet(
        'station',
        [
          { unit: 'mm', label: 'Rainfall' },
          { unit: '', label: 'Index', min: -3, max: 3 },
        ],
        [
          bar(
            'r',
            'Rainfall',
            monthly(from, ctx.to, (mi) => r[tOf(mi)]),
            { color: '#1565C0' },
          ),
          line(
            'spi3',
            'SPI-3',
            monthly(from, ctx.to, (mi) => regionSpi(sc, 3)[tOf(mi)]),
            { axis: 1, color: '#E53935' },
          ),
          line(
            'spi12',
            'SPI-12',
            monthly(from, ctx.to, (mi) => regionSpi(sc, 12)[tOf(mi)]),
            { axis: 1, color: '#13233A' },
          ),
        ],
        { note: `${m.name} (SAWS composite)` },
      );
    },
  },
  breakdown: {
    seasonal: (ctx) => {
      const r = regionSeries(ctx.scope, 'rain');
      const y1 = miYear(ctx.last);
      const years = Array.from({ length: 7 }, (_, k) => y1 - 6 + k);
      const ss = ['DJF', 'MAM', 'JJA', 'SON'];
      return categories(
        'seasonal',
        'mm',
        years.map(String),
        ss.map((se, k) => ({
          key: se,
          name: se,
          values: years.map((y) => {
            const xs = Array.from({ length: 12 }, (_, m) => monthIndex(y, m)).filter(
              (mi) => season(miMonth(mi)) === se && mi <= ctx.last,
            );
            return xs.reduce((a, mi) => a + r[tOf(mi)], 0);
          }),
          color: ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD'][k],
        })),
      );
    },
    events: (ctx) => {
      const kind = ctx.q('kind') ?? 'count';
      const y1 = miYear(ctx.last) - (miMonth(ctx.last) === 11 ? 0 : 1);
      const years = Array.from({ length: 10 }, (_, k) => y1 - 9 + k);
      const st = stationCells(ctx.scope.cells, 20);
      return categories(
        'events',
        kind === 'count' ? 'events' : 'mm',
        years.map(String),
        [
          {
            key: 'v',
            name: kind === 'count' ? 'Events > 50 mm/day (all stations)' : 'Max 1-day rainfall',
            values: years.map((y) =>
              kind === 'count'
                ? st.reduce(
                    (a, i) =>
                      a +
                      Array.from(
                        { length: 12 },
                        (_, m) => cellDailyRain(i, monthIndex(y, m)).filter((v) => v > 50).length,
                      ).reduce((x, z) => x + z, 0),
                    0,
                  )
                : Math.max(...st.map((i) => cellEtccdi(i, y).rx1day)),
            ),
            color: '#1565C0',
          },
        ],
        {},
      );
    },
  },
  table: {
    provinces: (ctx) =>
      table(
        'provinces',
        [
          col.rank(),
          col.text('name', 'Province'),
          col.num('total', 'Total (12 m)', 'mm'),
          col.delta('anom', 'Anomaly', 'up', '%', 0),
          col.cls('status', 'Status', 'risk'),
        ],
        PROVINCE_ORDER.map((p) => {
          const sc = resolveScope({ province: p });
          const r = regionSeries(sc, 'rain');
          const c = regionClimatology(sc, 'rain');
          const tot = sumMonths(r, ctx.last, 12);
          const a = ((tot - normalMonths(c, ctx.last, 12)) / normalMonths(c, ctx.last, 12)) * 100;
          return {
            name: provinceName(p),
            total: tot,
            anom: a,
            status: a > 10 ? 'Low' : a > -10 ? 'Moderate' : a > -25 ? 'High' : 'Very High',
          };
        }).sort((a, b) => b.total - a.total),
      ),
    extremes: (ctx) => {
      const wet = ctx.q('kind') !== 'driest';
      const rows = MUNICIPALITIES.filter((m) => ctx.scope.includes(m))
        .map((m) => ({
          name: m.name,
          province: m.province,
          total: sumMonths(regionSeries(resolveScope({ municipality: m.id }), 'rain'), ctx.last, 12),
        }))
        .sort((a, b) => (wet ? b.total - a.total : a.total - b.total))
        .slice(0, 5);
      return table(
        'extremes',
        [
          col.rank(),
          col.text('name', 'Location'),
          col.text('province', 'Province'),
          col.num('total', 'Total (12 m)', 'mm'),
        ],
        rows,
      );
    },
    statistics: (ctx) => {
      const s = ctx.scope;
      const y = miYear(ctx.last) - (miMonth(ctx.last) === 11 ? 0 : 1);
      const e = scopeEtccdi(s.cells, y);
      const base = (k: 'rx1day' | 'r10mm' | 'r20mm' | 'cdd' | 'cwd') =>
        mean([1985, 1990, 1995, 2000, 2005, 2010].map((yy) => scopeEtccdi(s.cells, yy)[k]));
      const trend = (k: 'rx1day' | 'r10mm' | 'r20mm' | 'cdd' | 'cwd') =>
        sensSlope(
          [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, y].map((yy) => scopeEtccdi(s.cells, yy)[k]),
          [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, y],
        ) * 10;
      const ann = annualTotals(regionSeries(s, 'rain'), 1981, y);
      const mapB = mean(ann.filter((a) => a.year <= 2010).map((a) => a.value));
      const rows: Record<string, string | number | null>[] = [
        {
          v: 'Mean annual rainfall',
          value: `${round(ann[ann.length - 1].value, 0)} mm`,
          clim: `${round(mapB, 0)} mm`,
          anom: `${round(((ann[ann.length - 1].value - mapB) / mapB) * 100, 1)}%`,
          trend: `${round(
            sensSlope(
              ann.map((a) => a.value),
              ann.map((a) => a.year),
            ) * 10,
            1,
          )} mm/decade`,
        },
        ...(['rx1day', 'r10mm', 'r20mm', 'cdd', 'cwd'] as const).map((k) => ({
          v: {
            rx1day: 'Max daily rainfall',
            r10mm: 'R10mm days',
            r20mm: 'R20mm days',
            cdd: 'CDD (max)',
            cwd: 'CWD (max)',
          }[k],
          value: `${round(e[k], 0)} ${k === 'rx1day' ? 'mm' : 'days'}`,
          clim: `${round(base(k), 0)} ${k === 'rx1day' ? 'mm' : 'days'}`,
          anom: `${round(((e[k] - base(k)) / Math.max(1, base(k))) * 100, 1)}%`,
          trend: `${round(trend(k), 1)} ${k === 'rx1day' ? 'mm' : 'days'}/decade`,
        })),
      ];
      return table(
        'statistics',
        [
          col.text('v', 'Variable'),
          col.text('value', `Value (${y})`),
          col.text('clim', 'Climatology (1981–2010)'),
          col.text('anom', 'Anomaly'),
          col.text('trend', "Trend (Sen's slope)"),
        ],
        rows,
      );
    },
    sources: (ctx) => {
      const f = ctx.scope.cells.length / CELLS.length;
      const rows = [
        { source: 'SAWS ground stations', count: Math.round(802 * f), res: 'Point', cadence: 'Real-time (15 min)' },
        { source: 'Satellite (CHIRPS, TAMSAT, PERSIANN)', count: 1, res: '1 km / 0.05°', cadence: 'Daily' },
        { source: 'Municipal stations', count: Math.round(278 * f), res: 'Point', cadence: 'Daily' },
        { source: 'Water boards', count: Math.round(126 * f), res: 'Point', cadence: 'Daily' },
        { source: 'Research networks (universities / WRC)', count: Math.round(84 * f), res: 'Point', cadence: 'Daily' },
        { source: 'Other (private / IoT)', count: Math.round(53 * f), res: 'Point', cadence: 'Daily' },
      ];
      return table(
        'sources',
        [
          col.text('source', 'Source'),
          col.num('count', 'Stations'),
          col.text('res', 'Resolution'),
          col.text('cadence', 'Cadence'),
        ],
        rows,
      );
    },
  },
  map: {
    total: () =>
      gridLayer(
        'total',
        'Total rainfall, last 12 months (mm)',
        'rainfall',
        'mm',
        (i) => {
          const r = cellRain(i);
          let s = 0;
          for (let mi = LAST - 11; mi <= LAST; mi++) s += r[tOf(mi)];
          return s;
        },
        0,
      ),
    anomaly: () =>
      gridLayer(
        'anomaly',
        'Rainfall anomaly, 12 months (% of normal)',
        'anomalyPct',
        '%',
        (i) => {
          const r = cellRain(i);
          let s = 0;
          for (let mi = LAST - 11; mi <= LAST; mi++) s += r[tOf(mi)];
          return ((s - CELLS[i].map) / CELLS[i].map) * 100;
        },
        0,
      ),
    monthly: () =>
      gridLayer(
        'monthly',
        `Monthly rainfall – ${MONTH_NAMES[miMonth(LAST)]} ${miYear(LAST)} (mm)`,
        'rainfallMonthly',
        'mm',
        (i) => cellRain(i)[tOf(LAST)],
        0,
      ),
    map: () => gridLayer('map', 'Mean annual precipitation 1981–2010 (mm)', 'rainfall', 'mm', (i) => CELLS[i].map, 0),
    spi1: () => gridLayer('spi1', 'SPI-1', 'spi', '', (i) => tailAt(cellSpi(i, 1), LAST)),
    spi3: () => gridLayer('spi3', 'SPI-3', 'spi', '', (i) => tailAt(cellSpi(i, 3), LAST)),
    spi6: () => gridLayer('spi6', 'SPI-6', 'spi', '', (i) => tailAt(cellSpi(i, 6), LAST)),
    spi12: () => gridLayer('spi12', 'SPI-12', 'spi', '', (i) => tailAt(cellSpi(i, 12), LAST)),
    spei6: () => gridLayer('spei6', 'SPEI-6', 'spi', '', (i) => tailAt(cellSpi(i, 6, 'spei'), LAST)),
    cdd: () =>
      gridLayer(
        'cdd',
        `Consecutive dry days (current, to ${MONTH_NAMES[miMonth(LAST)]})`,
        'days',
        'days',
        (i) => {
          let run = 0;
          for (let mi = LAST - 4; mi <= LAST; mi++) for (const v of cellDailyRain(i, mi)) run = v < 1 ? run + 1 : 0;
          return run;
        },
        0,
      ),
    r20: () =>
      gridLayer(
        'r20',
        `R20mm days (${miYear(LAST) - 1})`,
        'days',
        'days',
        (i) => cellEtccdi(i, miYear(LAST) - 1).r20mm,
        0,
      ),
    'forecast-1': () =>
      gridLayer(
        'forecast-1',
        'Rainfall outlook +1 month (% of normal)',
        'anomalyPct',
        '%',
        (i) => (cellForecastSpi(i, 1) ?? 0) * 22,
        0,
      ),
    'forecast-2': () =>
      gridLayer(
        'forecast-2',
        'Rainfall outlook +2 months (% of normal)',
        'anomalyPct',
        '%',
        (i) => (cellForecastSpi(i, 2) ?? 0) * 22,
        0,
      ),
    'forecast-3': () =>
      gridLayer(
        'forecast-3',
        'Rainfall outlook +3 months (% of normal)',
        'anomalyPct',
        '%',
        (i) => (cellForecastSpi(i, 3) ?? 0) * 22,
        0,
      ),
    'municipal-total': () =>
      choropleth(
        'municipal-total',
        'Rainfall last 12 months by municipality (mm)',
        'municipality',
        'rainfall',
        'mm',
        (_id, cells) =>
          regionMean(cells, (i) => {
            const r = cellRain(i);
            let s = 0;
            for (let mi = LAST - 11; mi <= LAST; mi++) s += r[tOf(mi)];
            return s;
          }),
        0,
      ),
  },
  entities: (ctx) => {
    const items = MUNICIPALITIES.filter((m) => ctx.scope.includes(m)).sort((a, b) => a.name.localeCompare(b.name));
    return {
      type: 'station',
      total: items.length,
      items: items.map((m) => ({
        id: m.id,
        name: `${m.name} (SAWS composite)`,
        type: 'station',
        province: m.province,
        lat: m.lat,
        lon: m.lon,
        sub: m.province,
      })),
    };
  },
  forecast: {
    rainfall: (ctx) => {
      const r = regionSeries(ctx.scope, 'rain');
      const clim = regionClimatology(ctx.scope, 'rain');
      const L = ctx.last;
      const hist: [number, number | null][] = [];
      for (let mi = L - 17; mi <= L; mi++) hist.push([mi, r[tOf(mi)]]);
      const rr = new Rng(`rainfc-${ctx.scope.key}`);
      const shift = outlookShift(ctx.scope.key);
      const fc = Array.from({ length: 6 }, (_, h) => {
        const mi = L + 1 + h;
        const c = clim[miMonth(mi)];
        const med = c * (1 + shift * 0.25 * Math.pow(0.85, h)) * rr.range(0.95, 1.05);
        return { mi, median: med, p10: med * 0.45, p90: med * 1.7 };
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'rain-forecast',
        [{ unit: 'mm', label: 'Monthly rainfall', min: 0 }],
        [
          band('band', f.names.band, f.band, { color: '#90CAF9' }),
          bar('obs', 'Observed', f.observed, { color: '#1565C0' }),
          line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true }),
          line(
            'n',
            '1981–2010 normal',
            [
              ...hist.map(([mi]) => [miToIso(mi), clim[miMonth(mi)]] as [string, number]),
              ...fc.map((p) => [miToIso(p.mi), clim[miMonth(p.mi)]] as [string, number]),
            ],
            { color: '#13233A', dash: true },
          ),
        ],
        { asOf: miToIso(L) },
      );
    },
    spi: (ctx) => {
      const s = regionSpi(ctx.scope, 6);
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 23; mi <= ctx.last; mi++) hist.push([mi, s[tOf(mi)]]);
      const fc = dampedForecast(`spi6-${ctx.scope.key}`, s[tOf(ctx.last)] ?? 0, {
        mu: 0,
        phi: 0.88,
        sigma: 0.9,
        horizon: 6,
        startMi: ctx.last,
        outlook: outlookShift(ctx.scope.key),
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'spi6-forecast',
        [{ unit: '', label: 'SPI-6', min: -3, max: 3 }],
        [
          band('band', f.names.band, f.band, { color: '#E57373' }),
          line('obs', 'Observed SPI-6', f.observed, { color: '#13233A', symbol: true }),
          line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true }),
        ],
        { asOf: miToIso(ctx.last), bands: DROUGHT_BANDS },
      );
    },
  },
};
