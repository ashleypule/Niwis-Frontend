/** Drought Status Monitoring (spec §3) — all classes derived from SPI/SPEI computed on generated rainfall. */
import {
  DROUGHT_CLASSES,
  DROUGHT_RANK,
  droughtClassFromSpi,
  droughtLabel,
  type DroughtClass,
} from '@/config/thresholds';
import { SCALES } from '@/config/palettes';
import { Rng } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { miMonth, miToIso, miYear } from '@/lib/time';
import { MONTH_NAMES } from '@/lib/format';
import {
  PROVINCES,
  PROVINCE_ORDER,
  MUNICIPALITIES,
  municipalPopulation,
  provinceName,
  CATCHMENTS,
} from '../../reference/regions';
import { CELLS, END_MI } from '../../generators/climate';
import {
  LAST,
  areaInDrought,
  cellSpi,
  cellVci,
  droughtAreaFractions,
  regionClimatology,
  regionEnvelope,
  regionGwDriver,
  regionSeries,
  regionSpei,
  regionSpi,
  regionSsi,
  regionVci,
  regionVhi,
  sumMonths,
  normalMonths,
  tailAt,
  tOf,
  cellSeries,
} from '../../generators/hydromet';
import {
  DAMS,
  aggregatePctAt,
  aggregateFlows,
  aggregateStorage,
  damNow,
  simulateDam,
  damT,
} from '../../generators/dams';
import { BOREHOLES, boreholeNow, boreholeSgi, boreholeLevels, gwT } from '../../generators/groundwater';
import { SETTLEMENTS, atRisk, settlementNow } from '../../generators/settlements';
import { dampedForecast, forecastSeries } from '../../generators/forecast';
import { resolveScope, type ResolvedScope } from '../../generators/scope';
import {
  area,
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
import { cellsOf, choropleth, gridLayer, pointsLayer, regionMean, spark } from '../common';

export const DROUGHT_BANDS = [
  { from: -3.5, to: -2.0, color: SCALES.drought.bins[5].color, label: 'D4' },
  { from: -2.0, to: -1.6, color: SCALES.drought.bins[4].color, label: 'D3' },
  { from: -1.6, to: -1.3, color: SCALES.drought.bins[3].color, label: 'D2' },
  { from: -1.3, to: -0.8, color: SCALES.drought.bins[2].color, label: 'D1' },
  { from: -0.8, to: -0.5, color: SCALES.drought.bins[1].color, label: 'D0' },
];

const scaleOf = (ctx: Ctx, def = 3) => {
  const s = Number(ctx.q('scale') ?? def);
  return [1, 3, 6, 12, 24].includes(s) ? s : def;
};
const windowStart = (ctx: Ctx, min = 24) => Math.min(ctx.from, ctx.to - min + 1);
const v2 = (x: number | null | undefined) => (x == null ? null : round(x, 2));

/** SPI at month mi averaged over municipality cells. */
function muniSpi(muniId: string, k: number, mi: number): number | null {
  return regionMean(cellsOf('municipality', muniId), (i) => tailAt(cellSpi(i, k), mi));
}

function damsIn(scope: ResolvedScope) {
  return DAMS.filter((d) => (scope.level === 'national' ? true : scope.includes(d)));
}
function boreholesIn(scope: ResolvedScope) {
  return BOREHOLES.filter((b) => scope.includes(b));
}
function settlementsIn(scope: ResolvedScope) {
  return SETTLEMENTS.filter((s) => scope.includes(s));
}

function regionalSgi(scope: ResolvedScope, mi: number): number {
  const bhs = boreholesIn(scope).slice(0, 220);
  if (!bhs.length) return round(regionGwDriver(scope)[tOf(mi)], 2);
  return round(mean(bhs.map((b) => boreholeSgi(b.id)[gwT(mi)] ?? 0)), 2);
}

function soilAnomalyPct(scope: ResolvedScope, mi: number) {
  const sm = regionSeries(scope, 'sm');
  const clim = regionClimatology(scope, 'sm');
  return ((sm[tOf(mi)] - clim[miMonth(mi)]) / clim[miMonth(mi)]) * 100;
}

function rainAnomalyPct(scope: ResolvedScope, mi: number, n: number) {
  const s = regionSeries(scope, 'rain');
  const clim = regionClimatology(scope, 'rain');
  const nor = normalMonths(clim, mi, n);
  return ((sumMonths(s, mi, n) - nor) / nor) * 100;
}

function runoffAnomalyPct(scope: ResolvedScope, mi: number, n: number) {
  const s = regionSeries(scope, 'runoff');
  const clim = regionClimatology(scope, 'runoff');
  const nor = normalMonths(clim, mi, n);
  return ((sumMonths(s, mi, n) - nor) / nor) * 100;
}

const sev = (x: number) => clamp(x, 0, 1);
const riskLabel = (s: number) => (s < 0.25 ? 'Low' : s < 0.5 ? 'Moderate' : s < 0.75 ? 'High' : 'Very High');

/** Deterministic regional outlook signal (seasonal forecast proxy). */
function outlookShift(key: string) {
  return new Rng(`outlook-${key}-${END_MI}`).normal(0.15, 0.25);
}

function cellForecastSpi(i: number, h: number): number | null {
  const x0 = tailAt(cellSpi(i, 3), LAST);
  if (x0 == null) return null;
  const c = CELLS[i];
  return round(x0 * Math.pow(0.78, h) + outlookShift(c.province) * Math.min(1, h / 3), 2);
}

export const drought: ModuleHandlers = {
  summary: (ctx) => {
    const s = ctx.scope;
    const L = ctx.last;
    const spi3 = regionSpi(s, 3);
    const spi6 = regionSpi(s, 6);
    const spei12 = regionSpei(s, 12);
    const vci = regionVci(s);
    const ssi = regionSsi(s, 3);
    const dams = damsIn(s);
    const stor = aggregateStorage(dams);
    // headline class: SPI-6 (medium-term state, less sensitive to dry-season noise than SPI-3)
    const cls = droughtClassFromSpi(spi6[tOf(L)]);
    const prevCls = droughtClassFromSpi(spi6[tOf(L - 1)]);
    const sets = settlementsIn(s);
    const risk = atRisk(sets).length;
    const riskPrev = atRisk(sets, L - 1).length;
    const sgiNow = regionalSgi(s, L);
    return [
      kpi('class', 'droughtClass', null, {
        label: 'Drought Class',
        sublabel: s.level === 'national' ? 'National (SPI-6)' : `${s.name} (SPI-6)`,
        text: cls === 'None' ? 'None' : cls,
        status: {
          scale: 'drought',
          id: cls,
          label: cls === 'None' ? 'No drought' : DROUGHT_CLASSES.find((d) => d.id === cls)!.label,
        },
        delta: DROUGHT_RANK[cls] - DROUGHT_RANK[prevCls],
        deltaUnit: ' class',
        deltaLabel: 'vs last month',
        goodDirection: 'down',
        spark: spark((mi) => spi6[tOf(mi)], L),
      }),
      kpi('spi3', 'spi', spi3[tOf(L)], {
        label: 'SPI-3',
        sublabel: 'Current value',
        delta: (spi3[tOf(L)] ?? 0) - (spi3[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => spi3[tOf(mi)], L),
      }),
      kpi('spi6', 'spi', spi6[tOf(L)], {
        label: 'SPI-6',
        sublabel: 'Current value',
        delta: (spi6[tOf(L)] ?? 0) - (spi6[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => spi6[tOf(mi)], L),
      }),
      kpi('spei12', 'spei', spei12[tOf(L)], {
        label: 'SPEI-12',
        sublabel: 'Rainfall + PET',
        delta: (spei12[tOf(L)] ?? 0) - (spei12[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => spei12[tOf(mi)], L),
      }),
      kpi('vci', 'vci', vci[tOf(L)], {
        label: 'VCI',
        sublabel: 'Vegetation condition',
        delta: vci[tOf(L)] - vci[tOf(L - 1)],
        deltaUnit: ' pp',
        deltaLabel: 'vs last month',
        spark: spark((mi) => vci[tOf(mi)], L),
      }),
      kpi('sm', 'soilMoistureAnomaly', soilAnomalyPct(s, L), {
        label: 'Soil Moisture Anomaly',
        sublabel: 'Surface, vs 1981–2010',
        delta: soilAnomalyPct(s, L) - soilAnomalyPct(s, L - 1),
        deltaUnit: ' pp',
        deltaLabel: 'vs last month',
        spark: spark((mi) => soilAnomalyPct(s, mi), L),
      }),
      kpi('ssi', 'ssi', ssi[tOf(L)], {
        label: 'SSI-3',
        sublabel: 'Streamflow index',
        delta: (ssi[tOf(L)] ?? 0) - (ssi[tOf(L - 1)] ?? 0),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => ssi[tOf(mi)], L),
      }),
      kpi('dams', 'storagePct', stor.pct, {
        label: 'Dam Storage',
        sublabel: `${dams.length} dams, % FSC`,
        delta: stor.pct - aggregatePctAt(dams, L - 1),
        deltaLabel: 'vs last month',
        spark: spark((mi) => aggregatePctAt(dams, mi), L),
      }),
      kpi('sgi', 'sgi', sgiNow, {
        label: 'SGI',
        sublabel: 'Groundwater index',
        delta: sgiNow - regionalSgi(s, L - 1),
        deltaUnit: '',
        deltaLabel: 'vs last month',
        spark: spark((mi) => regionalSgi(s, mi), L, 8),
      }),
      kpi('settlements', 'settlementsAtRisk', risk, {
        label: 'Settlements at Risk',
        sublabel: `of ${sets.length} monitored`,
        delta: risk - riskPrev,
        deltaUnit: '',
        deltaLabel: 'vs last month',
      }),
    ];
  },

  timeseries: {
    spi: (ctx) => {
      const k = scaleOf(ctx);
      const s = regionSpi(ctx.scope, k);
      const from = windowStart(ctx, 24);
      const series = [
        bar(
          `spi${k}`,
          `SPI-${k}`,
          monthly(from, ctx.to, (mi) => v2(s[tOf(mi)])),
          { color: '#1565C0' },
        ),
      ];
      if (ctx.q('compare') === '1')
        series.push(
          line(
            'prev',
            'Same month, previous year',
            monthly(from, ctx.to, (mi) => v2(s[tOf(mi - 12)])),
            { dash: true, color: '#64748B' },
          ),
        );
      return seriesSet(
        `spi-${k}`,
        [{ unit: '', label: `SPI-${k}`, min: -3, max: 3 }],
        series.map((x) => ({ ...x, kind: k <= 1 ? 'bar' : 'line' })),
        { bands: DROUGHT_BANDS, note: `${ctx.scope.name} · gamma-fitted, 1981–2010 calibration` },
      );
    },
    'rain-spei': (ctx) => {
      const s = ctx.scope;
      const rain = regionSeries(s, 'rain');
      const clim = regionClimatology(s, 'rain');
      const sp = regionSpei(s, 3);
      const from = windowStart(ctx, 24);
      return seriesSet(
        'rain-spei',
        [
          { unit: 'mm', label: 'Rainfall' },
          { unit: '', label: 'SPEI-3', min: -3, max: 3 },
        ],
        [
          bar(
            'rain',
            'Rainfall',
            monthly(from, ctx.to, (mi) => rain[tOf(mi)]),
            { color: '#1E88E5' },
          ),
          line(
            'mean',
            'Long-term mean (1981–2010)',
            monthly(from, ctx.to, (mi) => clim[miMonth(mi)]),
            { dash: true, color: '#64748B' },
          ),
          line(
            'spei',
            'SPEI-3',
            monthly(from, ctx.to, (mi) => v2(sp[tOf(mi)])),
            { axis: 1, color: '#E53935', symbol: true },
          ),
        ],
      );
    },
    'rain-anomaly': (ctx) => {
      const n = Number(ctx.q('window') ?? 1);
      const from = windowStart(ctx, 12);
      const pts = monthly(from, ctx.to, (mi) => rainAnomalyPct(ctx.scope, mi, n));
      return seriesSet(
        'rain-anomaly',
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
    'dam-flows': (ctx) => {
      const dams = damsIn(ctx.scope);
      const from = windowStart(ctx, 24);
      return seriesSet(
        'dam-flows',
        [
          { unit: '%', label: 'Storage', min: 0, max: 100 },
          { unit: 'Mm³', label: 'Monthly volume' },
        ],
        [
          area(
            'storage',
            'Storage (% FSC)',
            monthly(from, ctx.to, (mi) => aggregatePctAt(dams, mi)),
            { color: '#1565C0' },
          ),
          bar(
            'inflow',
            'Inflow',
            monthly(from, ctx.to, (mi) => aggregateFlows(dams, mi).inflow),
            { axis: 1, color: '#2E9E5B' },
          ),
          bar(
            'outflow',
            'Outflow',
            monthly(from, ctx.to, (mi) => aggregateFlows(dams, mi).outflow),
            { axis: 1, color: '#F2A900' },
          ),
        ],
      );
    },
    'gw-sgi': (ctx) => {
      const bhs = boreholesIn(ctx.scope).slice(0, 220);
      const from = windowStart(ctx, 24);
      return seriesSet(
        'gw-sgi',
        [
          { unit: 'm bgl', label: 'Level', inverse: true },
          { unit: '', label: 'SGI', min: -3, max: 3 },
        ],
        [
          line(
            'level',
            'Mean borehole level (m bgl)',
            monthly(from, ctx.to, (mi) => mean(bhs.map((b) => boreholeLevels(b.id)[gwT(mi)]))),
            { color: '#1565C0', symbol: true },
          ),
          line(
            'sgi',
            'SGI',
            monthly(from, ctx.to, (mi) => regionalSgi(ctx.scope, mi)),
            { axis: 1, color: '#E53935' },
          ),
        ],
        { note: `${bhs.length} boreholes` },
      );
    },
    'soil-moisture': (ctx) => {
      const s = ctx.scope;
      const sm = regionSeries(s, 'sm');
      const rz = regionSeries(s, 'smRoot');
      const clim = regionClimatology(s, 'sm');
      const env = regionEnvelope(s, 'sm');
      const from = windowStart(ctx, 24);
      return seriesSet(
        'soil-moisture',
        [{ unit: 'm³/m³', label: 'Soil moisture', min: 0 }],
        [
          band(
            'env',
            'Min–max range',
            monthly(from, ctx.to, () => 0).map(([x], j) => [x, env.min[miMonth(from + j)], env.max[miMonth(from + j)]]),
            { color: '#90CAF9' },
          ),
          line(
            'surface',
            'Surface soil moisture',
            monthly(from, ctx.to, (mi) => sm[tOf(mi)]),
            { color: '#1565C0' },
          ),
          line(
            'root',
            'Root-zone soil moisture',
            monthly(from, ctx.to, (mi) => rz[tOf(mi)]),
            { color: '#E53935' },
          ),
          line(
            'clim',
            'Long-term mean (surface)',
            monthly(from, ctx.to, (mi) => clim[miMonth(mi)]),
            { dash: true, color: '#64748B' },
          ),
        ],
      );
    },
    vegetation: (ctx) => {
      const s = ctx.scope;
      const nd = regionSeries(s, 'ndvi');
      const vci = regionVci(s);
      const vhi = regionVhi(s);
      const from = windowStart(ctx, 24);
      return seriesSet(
        'vegetation',
        [
          { unit: '', label: 'NDVI', min: 0, max: 1 },
          { unit: '%', label: 'VCI / VHI', min: 0, max: 100 },
        ],
        [
          line(
            'ndvi',
            'NDVI',
            monthly(from, ctx.to, (mi) => nd[tOf(mi)]),
            { color: '#2E7D32', symbol: true },
          ),
          line(
            'vci',
            'VCI',
            monthly(from, ctx.to, (mi) => vci[tOf(mi)]),
            { axis: 1, color: '#F2A900' },
          ),
          line(
            'vhi',
            'VHI',
            monthly(from, ctx.to, (mi) => vhi[tOf(mi)]),
            { axis: 1, color: '#6D4C41', dash: true },
          ),
        ],
      );
    },
    'drought-area': (ctx) => {
      const k = scaleOf(ctx, 6);
      const from = Math.max(windowStart(ctx, 24), END_MI - 46);
      const classes: DroughtClass[] = ['D0', 'D1', 'D2', 'D3', 'D4'];
      return seriesSet(
        'drought-area',
        [{ unit: '%', label: 'Area', min: 0, max: 100 }],
        classes.map((c, i) =>
          area(
            c,
            c,
            monthly(from, ctx.to, (mi) => droughtAreaFractions(ctx.scope, k, mi)[c] * 100),
            { stack: 'a', color: SCALES.drought.bins[i + 1].color },
          ),
        ),
        { note: `Share of area by SPI-${k} class` },
      );
    },
    'storage-vs-spi': (ctx) => {
      const dams = damsIn(ctx.scope).filter((d) => d.province !== 'LS');
      const pts = (cat: string) =>
        dams
          .filter((d) => d.category === cat)
          .map((d) => {
            const i = CELLS.findIndex((c) => Math.abs(c.lon - d.lon) <= 0.125 && Math.abs(c.lat - d.lat) <= 0.125);
            const spi = tailAt(cellSpi(i >= 0 ? i : 0, 3), ctx.last);
            return [spi ?? 0, damNow(d.id).pct] as [number, number];
          });
      return {
        id: 'storage-vs-spi',
        xType: 'value',
        xUnit: 'SPI-3 at dam',
        axes: [{ unit: '%', label: 'Storage', min: 0, max: 100 }],
        series: [
          { key: 'large', name: 'Large dams', kind: 'scatter', data: pts('Large'), color: '#1565C0' },
          { key: 'medium', name: 'Medium dams', kind: 'scatter', data: pts('Medium'), color: '#2E9E5B' },
          { key: 'small', name: 'Small dams', kind: 'scatter', data: pts('Small'), color: '#F2A900' },
        ],
      };
    },
    'population-at-risk': (ctx) => {
      const from = windowStart(ctx, 12);
      const munis = MUNICIPALITIES.filter((m) => ctx.scope.includes(m));
      const calc = (mi: number, urban: boolean) =>
        munis.reduce((s, m) => {
          const c = droughtClassFromSpi(muniSpi(m.id, 3, mi));
          if (DROUGHT_RANK[c] < DROUGHT_RANK.D1) return s;
          const pop = municipalPopulation.get(m.id) ?? 0;
          const uf = pop > 700_000 ? 0.92 : 0.38;
          return s + pop * (urban ? uf : 1 - uf) * (DROUGHT_RANK[c] >= DROUGHT_RANK.D2 ? 1 : 0.4);
        }, 0) / 1e6;
      return seriesSet(
        'population-at-risk',
        [{ unit: 'million', label: 'Population' }],
        [
          bar(
            'urban',
            'Urban',
            monthly(from, ctx.to, (mi) => calc(mi, true)),
            { stack: 'p', color: '#1565C0' },
          ),
          bar(
            'rural',
            'Rural',
            monthly(from, ctx.to, (mi) => calc(mi, false)),
            { stack: 'p', color: '#2E9E5B' },
          ),
        ],
      );
    },
  },

  breakdown: {
    severity: (ctx) => {
      const fr = droughtAreaFractions(ctx.scope, scaleOf(ctx, 6), ctx.last);
      const total = ctx.scope.cells.reduce((s, i) => s + CELLS[i].areaKm2, 0);
      const cats: DroughtClass[] = ['D4', 'D3', 'D2', 'D1', 'D0', 'None'];
      const affected = (1 - fr.None) * total;
      return categories(
        'severity',
        'km²',
        cats.map((c) => (c === 'None' ? 'Normal' : droughtLabel(c))),
        [{ key: 'area', name: 'Area', values: cats.map((c) => fr[c] * total) }],
        {
          colors: cats.map((c) => SCALES.drought.bins.find((b) => b.id === c)!.color),
          center: {
            value: `${Math.round(affected / 1000)
              .toLocaleString('en-ZA')
              .replace(/,/g, ' ')}k km²`,
            label: 'Affected area',
          },
        },
      );
    },
    'province-area': (ctx) => {
      const k = scaleOf(ctx, 6);
      const rows = PROVINCES.map((p) => ({
        name: p.name,
        v: areaInDrought(droughtAreaFractions(resolveScope({ province: p.id }), k, ctx.last), 'D1') * 100,
      })).sort((a, b) => b.v - a.v);
      return categories(
        'province-area',
        '%',
        rows.map((r) => r.name),
        [{ key: 'area', name: 'Area in drought (D1–D4)', values: rows.map((r) => r.v) }],
        {
          colors: rows.map((r) =>
            r.v >= 60 ? '#B2182B' : r.v >= 40 ? '#E95F35' : r.v >= 25 ? '#F2A900' : r.v >= 10 ? '#C0CA33' : '#2E9E5B',
          ),
        },
      );
    },
    restrictions: (ctx) => {
      const levels = ['No restrictions', 'Level 1', 'Level 2', 'Level 3'];
      const counts = PROVINCE_ORDER.map((pid) => {
        const c = [0, 0, 0, 0];
        MUNICIPALITIES.filter((m) => m.province === pid).forEach((m) => {
          const cls = droughtClassFromSpi(muniSpi(m.id, 12, ctx.last));
          const lvl =
            DROUGHT_RANK[cls] >= DROUGHT_RANK.D3
              ? 3
              : DROUGHT_RANK[cls] >= DROUGHT_RANK.D2
                ? 2
                : DROUGHT_RANK[cls] >= DROUGHT_RANK.D1
                  ? 1
                  : 0;
          c[lvl]++;
        });
        return c;
      });
      return categories(
        'restrictions',
        'municipalities',
        PROVINCE_ORDER,
        levels.map((l, i) => ({
          key: `l${i}`,
          name: l,
          values: counts.map((c) => c[i]),
          color: ['#2E9E5B', '#F6CF3E', '#F28C28', '#D7301F'][i],
        })),
      );
    },
    'class-probability': (ctx) => {
      // probability of each class at horizons 1–6 months from the forecast distribution of SPI-3
      const s = regionSpi(ctx.scope, 3);
      const x0 = s[tOf(ctx.last)] ?? 0;
      const fc = dampedForecast(`spi-${ctx.scope.key}`, x0, {
        mu: 0,
        phi: 0.78,
        sigma: 0.95,
        horizon: 6,
        startMi: ctx.last,
        outlook: outlookShift(ctx.scope.key),
      });
      const classes: DroughtClass[] = ['D0', 'D1', 'D2', 'D3', 'D4'];
      const cdf = (x: number, m: number, sd: number) => 0.5 * (1 + erf((x - m) / (sd * Math.SQRT2)));
      const probs = fc.map((p) => {
        const sd = (p.p90 - p.p10) / 2.5632 || 0.3;
        const bounds: Record<DroughtClass, [number, number]> = {
          None: [-0.5, 99],
          D0: [-0.8, -0.5],
          D1: [-1.3, -0.8],
          D2: [-1.6, -1.3],
          D3: [-2.0, -1.6],
          D4: [-99, -2.0],
        };
        return classes.map((c) => (cdf(bounds[c][1], p.median, sd) - cdf(bounds[c][0], p.median, sd)) * 100);
      });
      return categories(
        'class-probability',
        '%',
        fc.map((_, h) => `${h + 1} month${h ? 's' : ''}`),
        classes.map((c, ci) => ({
          key: c,
          name: c,
          values: probs.map((p) => p[ci]),
          color: SCALES.drought.bins[ci + 1].color,
          stack: 'p',
        })),
      );
    },
  },

  matrix: {
    'veg-heatmap': (ctx) => {
      const months = Array.from({ length: 12 }, (_, i) => ctx.last - 11 + i);
      return {
        id: 'veg-heatmap',
        rows: PROVINCE_ORDER.map(provinceName),
        cols: months.map((mi) => `${MONTH_NAMES[miMonth(mi)]} ${String(miYear(mi)).slice(2)}`),
        values: PROVINCE_ORDER.map((p) => {
          const v = regionVci(resolveScope({ province: p }));
          return months.map((mi) => round(v[tOf(mi)], 0));
        }),
        unit: '%',
        scale: 'vci',
      };
    },
  },

  table: {
    cascade: (ctx) => {
      const s = ctx.scope;
      const L = ctx.last;
      const spi6 = regionSpi(s, 6)[tOf(L)] ?? 0;
      const rainA = rainAnomalyPct(s, L, 6);
      const smA = soilAnomalyPct(s, L);
      const vci = regionVci(s)[tOf(L)];
      const roA = runoffAnomalyPct(s, L, 6);
      const ssi = regionSsi(s, 6)[tOf(L)] ?? 0;
      const stor = aggregateStorage(damsIn(s)).pct;
      const sgi = regionalSgi(s, L);
      const bhs = boreholesIn(s).slice(0, 200);
      const lvlA = mean(bhs.map((b) => boreholeNow(b.id).anomaly));
      const risk = atRisk(settlementsIn(s)).length;
      const stages = [
        {
          stage: 'Precipitation deficit',
          metric: 'rainfall',
          value: `${rainA > 0 ? '+' : ''}${Math.round(rainA)}%`,
          s: sev((-spi6 + 0.3) / 2.2),
        },
        {
          stage: 'Soil moisture reduction',
          metric: 'soilMoisture',
          value: `${smA > 0 ? '+' : ''}${Math.round(smA)}%`,
          s: sev(-smA / 45),
        },
        { stage: 'Vegetation stress', metric: 'vci', value: `VCI ${Math.round(vci)}%`, s: sev((60 - vci) / 50) },
        {
          stage: 'Streamflow decline',
          metric: 'runoff',
          value: `${roA > 0 ? '+' : ''}${Math.round(roA)}%`,
          s: sev((-ssi + 0.3) / 2.2),
        },
        {
          stage: 'Reservoir depletion',
          metric: 'storagePct',
          value: `${Math.round(stor)}% FSC`,
          s: sev((75 - stor) / 55),
        },
        {
          stage: 'Groundwater depletion',
          metric: 'gwLevel',
          value: `${lvlA > 0 ? '+' : ''}${lvlA.toFixed(1)} m`,
          s: sev((-sgi + 0.3) / 2),
        },
        {
          stage: 'Socio-economic impact',
          metric: 'settlementsAtRisk',
          value: `${risk} settlements`,
          s: sev(risk / 40),
        },
      ];
      return table(
        'cascade',
        [
          col.text('stage', 'Stage'),
          col.text('value', 'Value'),
          col.cls('cls', 'Class', 'risk'),
          col.num('bar', 'Severity', '%'),
        ],
        stages.map((x) => ({
          stage: x.stage,
          metric: x.metric,
          value: x.value,
          cls: riskLabel(x.s),
          scale: 'risk',
          bar: Math.round(x.s * 100),
        })),
      );
    },
    affected: (ctx) => {
      const lvl = ctx.q('level') === 'catchment' ? 'catchment' : 'province';
      const k = scaleOf(ctx, 6);
      const list =
        lvl === 'province'
          ? PROVINCES.map((p) => ({
              id: p.id,
              name: p.name,
              scope: resolveScope({ province: p.id }),
              stations: 40 + p.areaKm2 / 4000,
            }))
          : CATCHMENTS.filter(
              (c) =>
                ctx.scope.level === 'national' ||
                ctx.scope.includes({
                  province: c.province ?? undefined,
                  wma: c.wma ?? undefined,
                  lat: c.lat,
                  lon: c.lon,
                }),
            ).map((c) => ({
              id: c.id,
              name: `${c.id} (${c.province})`,
              scope: resolveScope({ catchment: c.id }),
              stations: c.areaKm2 / 2000,
            }));
      const rows = list
        .map((r) => {
          const spi = regionSpi(r.scope, k)[tOf(ctx.last)] ?? 0;
          return {
            id: r.id,
            name: r.name,
            spi: round(spi, 2),
            cls: droughtClassFromSpi(spi),
            area: round(areaInDrought(droughtAreaFractions(r.scope, k, ctx.last), 'D0') * 100, 0),
            confidence: r.stations > 60 ? 'High' : r.stations > 25 ? 'Medium' : 'Low',
            updated: miToIso(ctx.last + 1).slice(0, 8) + '05',
          };
        })
        .sort((a, b) => a.spi - b.spi)
        .slice(0, lvl === 'province' ? 9 : 12);
      return table(
        'affected',
        [
          col.rank(),
          col.text('name', lvl === 'province' ? 'Province' : 'Catchment'),
          col.num('spi', `SPI-${k}`, '', 2),
          col.cls('cls', 'Drought class', 'drought'),
          col.num('area', 'Area affected', '%'),
          col.cls('confidence', 'Confidence', 'risk'),
          col.date('updated', 'Last update'),
        ],
        rows,
        { rowKey: 'id' },
      );
    },
    'early-warning': (ctx) => {
      const s = ctx.scope;
      const L = ctx.last;
      const spi = regionSpi(s, 3)[tOf(L)] ?? 0;
      const fc = dampedForecast(`ew-${s.key}`, spi, {
        mu: 0,
        phi: 0.78,
        sigma: 0.95,
        horizon: 3,
        startMi: L,
        outlook: outlookShift(s.key),
      });
      const f3 = fc[2].median;
      const vci = regionVci(s)[tOf(L)];
      const status = (z: number) =>
        z <= -1 ? 'Below normal' : z <= -0.5 ? 'Low' : z >= 0.5 ? 'Above normal' : 'Normal';
      const rows = [
        { indicator: 'Rainfall', current: status(spi), forecast: status(f3), confidence: 70 },
        {
          indicator: 'Soil moisture',
          current: status(soilAnomalyPct(s, L) / 30),
          forecast: status((soilAnomalyPct(s, L) / 30) * 0.7 + f3 * 0.3),
          confidence: 65,
        },
        {
          indicator: 'Reservoir inflow',
          current: status(regionSsi(s, 3)[tOf(L)] ?? 0),
          forecast: status(((regionSsi(s, 3)[tOf(L)] ?? 0) + f3) / 2),
          confidence: 70,
        },
        { indicator: 'Drought index (SPI-3)', current: spi.toFixed(2), forecast: f3.toFixed(2), confidence: 60 },
        {
          indicator: 'Vegetation (VCI %)',
          current: String(Math.round(vci)),
          forecast: String(Math.round(clamp(vci + f3 * 8, 0, 100))),
          confidence: 65,
        },
      ];
      const overall = f3 <= -1.3 ? 'High' : f3 <= -0.8 ? 'Moderate' : 'Low';
      rows.push({
        indicator: 'Overall risk',
        current: riskLabel(sev((-spi + 0.3) / 2.2)),
        forecast: overall,
        confidence: 70,
      });
      return table(
        'early-warning',
        [
          col.text('indicator', 'Indicator'),
          col.text('current', 'Current status'),
          col.text('forecast', 'Forecast (3 months)'),
          col.num('confidence', 'Confidence', '%'),
        ],
        rows,
      );
    },
    sources: () => {
      const r = new Rng(`sources-${END_MI}`);
      const src = [
        ['SAWS', 'Meteorological (800+ stations)'],
        ['SANSA', 'Satellite / Earth Observation'],
        ['DWS', 'Hydrology & dams (Hydstra)'],
        ['DWS NGA', 'Groundwater levels'],
        ['Stats SA', 'Socio-economic'],
        ['SANBI', 'Ecology'],
      ];
      return table(
        'sources',
        [
          col.text('source', 'Source'),
          col.text('feed', 'Feed'),
          col.cls('status', 'Status', 'feed'),
          col.text('updated', 'Last updated'),
        ],
        src.map(([source, feed], i) => {
          const delayed = r.bool(i === 3 ? 0.6 : 0.15);
          const h = delayed ? r.int(30, 60) : r.int(1, 6);
          return { source, feed, status: delayed ? 'Delayed' : 'Online', updated: `${h} h ago` };
        }),
      );
    },
    municipalities: (ctx) => {
      const munis = MUNICIPALITIES.filter((m) => ctx.scope.includes(m));
      const rows = munis
        .map((m) => {
          const spi = muniSpi(m.id, 6, ctx.last) ?? 0;
          const pop = municipalPopulation.get(m.id) ?? 0;
          const cls = droughtClassFromSpi(spi);
          const affected = DROUGHT_RANK[cls] >= DROUGHT_RANK.D1 ? pop * clamp(0.3 + (-spi - 0.8) * 0.4, 0.25, 1) : 0;
          const supply = regionMean(cellsOf('municipality', m.id), (i) => tailAt(cellSpi(i, 12), ctx.last)) ?? 0;
          return {
            id: m.id,
            name: m.name,
            province: m.province,
            spi: round(spi, 2),
            cls,
            pop: Math.round(affected / 100) * 100,
            supply: supply <= -1.3 ? 'High' : supply <= -0.8 ? 'Medium' : 'Low',
          };
        })
        .sort((a, b) => a.spi - b.spi)
        .slice(0, 10);
      return table(
        'municipalities',
        [
          col.rank(),
          col.text('name', 'Municipality'),
          col.text('province', 'Province'),
          col.num('spi', 'SPI-6', '', 2),
          col.cls('cls', 'Drought class', 'drought'),
          col.num('pop', 'Population affected'),
          col.cls('supply', 'Water supply risk', 'risk'),
        ],
        rows,
        { rowKey: 'id' },
      );
    },
    'forecast-indicators': (ctx) => {
      const s = ctx.scope;
      const L = ctx.last;
      const horizons = [3, 6, 12, 24];
      const spi = regionSpi(s, 3)[tOf(L)] ?? 0;
      const fc = dampedForecast(`spi-${s.key}`, spi, {
        mu: 0,
        phi: 0.82,
        sigma: 0.95,
        horizon: 24,
        startMi: L,
        outlook: outlookShift(s.key),
      });
      const area = areaInDrought(droughtAreaFractions(s, 3, L), 'D1') * 100;
      const stor = aggregateStorage(damsIn(s)).pct;
      const risk = atRisk(settlementsIn(s)).length;
      const at = (h: number) => fc[h - 1].median;
      const rows = [
        {
          indicator: 'SPI-3 (median)',
          unit: '',
          cur: round(spi, 2),
          ...Object.fromEntries(horizons.map((h) => [`h${h}`, round(at(h), 2)])),
        },
        {
          indicator: 'Area in drought (D1–D4)',
          unit: '%',
          cur: round(area, 0),
          ...Object.fromEntries(horizons.map((h) => [`h${h}`, round(clamp(area + (spi - at(h)) * -28, 0, 100), 0)])),
        },
        {
          indicator: 'Dam storage',
          unit: '% FSC',
          cur: round(stor, 0),
          ...Object.fromEntries(horizons.map((h) => [`h${h}`, round(clamp(stor + at(h) * 6 - h * 0.4, 5, 100), 0)])),
        },
        {
          indicator: 'Settlements at risk',
          unit: '',
          cur: risk,
          ...Object.fromEntries(horizons.map((h) => [`h${h}`, Math.max(0, Math.round(risk + (spi - at(h)) * -9))])),
        },
        {
          indicator: 'Drought class',
          unit: '',
          cur: droughtClassFromSpi(spi),
          ...Object.fromEntries(horizons.map((h) => [`h${h}`, droughtClassFromSpi(at(h))])),
        },
      ];
      return table(
        'forecast-indicators',
        [
          col.text('indicator', 'Indicator'),
          col.text('unit', 'Unit'),
          col.text('cur', 'Current'),
          ...horizons.map((h) => col.text(`h${h}`, `${h} months`)),
        ],
        rows.map((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])),
        ),
      );
    },
    recovery: (ctx) => {
      const spi = regionSpi(ctx.scope, 3)[tOf(ctx.last)] ?? 0;
      const fc = dampedForecast(`rec-${ctx.scope.key}`, spi, {
        mu: 0,
        phi: 0.8,
        sigma: 0.95,
        horizon: 13,
        startMi: ctx.last,
        outlook: outlookShift(ctx.scope.key),
      });
      const p = (h: number) => {
        const m = fc[h - 1];
        const sd = (m.p90 - m.p10) / 2.5632;
        return 100 * (1 - 0.5 * (1 + erf((-0.5 - m.median) / (sd * Math.SQRT2))));
      };
      const rows = [
        {
          frame: 'Next 3 months',
          expected: p(3) > 60 ? 'Near-normal conditions' : 'Persisting dry conditions',
          prob: p(3),
        },
        { frame: '3 – 6 months', expected: p(6) > 55 ? 'Improvement likely' : 'Slight improvement', prob: p(6) },
        { frame: '6 – 12 months', expected: p(12) > 55 ? 'Near-normal rainfall' : 'Gradual recovery', prob: p(12) },
        {
          frame: '> 12 months',
          expected: 'Full hydrological recovery (storage & groundwater)',
          prob: Math.max(5, p(13) - 15),
        },
      ];
      return table(
        'recovery',
        [
          col.text('frame', 'Time frame'),
          col.text('expected', 'Expected conditions'),
          col.bar('prob', 'Recovery probability', '%'),
        ],
        rows.map((r) => ({ ...r, prob: Math.round(r.prob) })),
      );
    },
  },

  map: {
    'drought-class': () =>
      gridLayer('drought-class', 'Drought classification (SPI-6)', 'spi', '', (i) => tailAt(cellSpi(i, 6), LAST)),
    spi1: () => gridLayer('spi1', 'SPI-1', 'spi', '', (i) => tailAt(cellSpi(i, 1), LAST)),
    spi3: () => gridLayer('spi3', 'SPI-3', 'spi', '', (i) => tailAt(cellSpi(i, 3), LAST)),
    spi6: () => gridLayer('spi6', 'SPI-6', 'spi', '', (i) => tailAt(cellSpi(i, 6), LAST)),
    spi12: () => gridLayer('spi12', 'SPI-12', 'spi', '', (i) => tailAt(cellSpi(i, 12), LAST)),
    spi24: () => gridLayer('spi24', 'SPI-24', 'spi', '', (i) => tailAt(cellSpi(i, 24), LAST)),
    spei3: () => gridLayer('spei3', 'SPEI-3', 'spi', '', (i) => tailAt(cellSpi(i, 3, 'spei'), LAST)),
    spei12: () => gridLayer('spei12', 'SPEI-12', 'spi', '', (i) => tailAt(cellSpi(i, 12, 'spei'), LAST)),
    'rain-anomaly': () =>
      gridLayer(
        'rain-anomaly',
        'Rainfall anomaly (3 months, % of normal)',
        'anomalyPct',
        '%',
        (i) => {
          const s = regionSeriesCell(i, 'rain');
          const nor =
            CELLS[i].shares[miMonth(LAST)] + CELLS[i].shares[miMonth(LAST - 1)] + CELLS[i].shares[miMonth(LAST - 2)];
          const normal = CELLS[i].map * nor;
          return normal > 3 ? ((s[tOf(LAST)] + s[tOf(LAST - 1)] + s[tOf(LAST - 2)] - normal) / normal) * 100 : null;
        },
        0,
      ),
    'soil-moisture': () =>
      gridLayer(
        'soil-moisture',
        'Surface soil moisture',
        'soilMoisture',
        'm³/m³',
        (i) => regionSeriesCell(i, 'sm')[tOf(LAST)],
        3,
      ),
    ndvi: () => gridLayer('ndvi', 'NDVI', 'ndvi', '', (i) => regionSeriesCell(i, 'ndvi')[tOf(LAST)], 2),
    vci: () => gridLayer('vci', 'Vegetation Condition Index', 'vci', '%', (i) => cellVci(i)[tOf(LAST)], 0),
    'municipal-class': () =>
      choropleth(
        'municipal-class',
        'Drought classification by municipality (SPI-6)',
        'municipality',
        'drought',
        '',
        (id) => droughtClassFromSpi(muniSpi(id, 6, LAST)),
      ),
    'province-class': () =>
      choropleth('province-class', 'Drought classification by province (SPI-6)', 'province', 'drought', '', (id) =>
        droughtClassFromSpi(regionSpi(resolveScope({ province: id }), 6)[tOf(LAST)]),
      ),
    'catchment-class': () =>
      choropleth('catchment-class', 'Drought classification by catchment (SPI-6)', 'catchment', 'drought', '', (id) =>
        droughtClassFromSpi(regionSpi(resolveScope({ catchment: id }), 6)[tOf(LAST)]),
      ),
    dams: () =>
      pointsLayer(
        'dams',
        'Dam storage (% FSC)',
        'storage',
        '%',
        DAMS.map((d) => ({
          id: d.id,
          name: `${d.name} Dam`,
          lat: d.lat,
          lon: d.lon,
          value: damNow(d.id).pct,
          size: Math.min(1, Math.log10(d.capacity) / 3.7),
          kind: 'dam',
          sub: `${d.capacity.toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³ capacity`,
        })),
      ),
    boreholes: () =>
      pointsLayer(
        'boreholes',
        'Groundwater (SGI)',
        'spi',
        '',
        BOREHOLES.filter((_, i) => i % 3 === 0).map((b) => ({
          id: b.id,
          name: b.id,
          lat: b.lat,
          lon: b.lon,
          value: boreholeNow(b.id).sgi,
          size: 0.1,
          kind: 'borehole',
          sub: b.aquifer.name,
        })),
      ),
    settlements: () =>
      pointsLayer(
        'settlements',
        'Drought-affected settlements (risk)',
        'risk',
        '',
        SETTLEMENTS.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          value: settlementNow(s.id).risk,
          size: Math.min(1, s.population / 40000),
          kind: 'settlement',
          sub: `${provinceName(s.province)} · ${s.population.toLocaleString('en-ZA').replace(/,/g, ' ')} people`,
        })),
      ),
    'outlook-1': () =>
      gridLayer('outlook-1', `SPI-3 outlook ${monthLabel(LAST + 1)}`, 'spi', '', (i) => cellForecastSpi(i, 1)),
    'outlook-2': () =>
      gridLayer('outlook-2', `SPI-3 outlook ${monthLabel(LAST + 2)}`, 'spi', '', (i) => cellForecastSpi(i, 2)),
    'outlook-3': () =>
      gridLayer('outlook-3', `SPI-3 outlook ${monthLabel(LAST + 3)}`, 'spi', '', (i) => cellForecastSpi(i, 3)),
    'forecast-6': () =>
      gridLayer('forecast-6', `Forecast drought class ${monthLabel(LAST + 6)}`, 'spi', '', (i) =>
        cellForecastSpi(i, 6),
      ),
  },

  forecast: {
    spi: (ctx) => {
      const s = regionSpi(ctx.scope, 3);
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 23; mi <= ctx.last; mi++) hist.push([mi, v2(s[tOf(mi)])]);
      const fc = dampedForecast(`spi-${ctx.scope.key}`, s[tOf(ctx.last)] ?? 0, {
        mu: 0,
        phi: 0.82,
        sigma: 0.95,
        horizon: Number(ctx.q('horizon') ?? 12),
        startMi: ctx.last,
        outlook: outlookShift(ctx.scope.key),
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'spi-forecast',
        [{ unit: '', label: 'SPI-3', min: -3, max: 3 }],
        [
          band('band', f.names.band, f.band, { color: '#E57373' }),
          line('obs', 'Observed SPI-3', f.observed, { color: '#13233A', symbol: true }),
          line('median', f.names.median, f.median, { color: '#E53935', dash: true, symbol: true }),
        ],
        { asOf: miToIso(ctx.last), bands: DROUGHT_BANDS },
      );
    },
    area: (ctx) => {
      const from = Math.max(ctx.last - 23, END_MI - 46);
      const hist: [number, number | null][] = [];
      for (let mi = from; mi <= ctx.last; mi++)
        hist.push([mi, areaInDrought(droughtAreaFractions(ctx.scope, 3, mi), 'D1') * 100]);
      const x0 = hist[hist.length - 1][1] ?? 0;
      const spi = regionSpi(ctx.scope, 3)[tOf(ctx.last)] ?? 0;
      const fc = dampedForecast(`area-${ctx.scope.key}`, x0, {
        mu: 22,
        phi: 0.85,
        sigma: 18,
        horizon: 12,
        startMi: ctx.last,
        outlook: -outlookShift(ctx.scope.key) * 15 + (spi < -1 ? 4 : 0),
        min: 0,
        max: 100,
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'area-forecast',
        [{ unit: '%', label: 'Area in drought', min: 0, max: 100 }],
        [
          band('band', f.names.band, f.band, { color: '#FFB74D' }),
          area('obs', 'Observed', f.observed, { color: '#E65100' }),
          line('median', f.names.median, f.median, { color: '#E65100', dash: true }),
        ],
        { asOf: miToIso(ctx.last) },
      );
    },
    settlements: (ctx) => {
      const sets = settlementsIn(ctx.scope);
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 11; mi <= ctx.last; mi++) hist.push([mi, atRisk(sets, mi).length]);
      const x0 = hist[hist.length - 1][1] ?? 0;
      const fc = dampedForecast(`sets-${ctx.scope.key}`, x0, {
        mu: sets.length * 0.12,
        phi: 0.88,
        sigma: Math.max(3, sets.length * 0.08),
        horizon: 12,
        startMi: ctx.last,
        outlook: -outlookShift(ctx.scope.key) * 4,
        min: 0,
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'settlements-forecast',
        [{ unit: 'settlements', label: 'At risk', min: 0 }],
        [
          band('band', f.names.band, f.band, { color: '#CE93D8' }),
          bar('obs', 'Observed', f.observed, { color: '#7B1FA2' }),
          line('median', f.names.median, f.median, { color: '#7B1FA2', dash: true, symbol: true }),
        ],
        { asOf: miToIso(ctx.last) },
      );
    },
    population: (ctx) => {
      const sets = settlementsIn(ctx.scope);
      const pop = (mi: number) => atRisk(sets, mi).reduce((s, x) => s + x.population, 0) / 1000;
      const hist: [number, number | null][] = [];
      for (let mi = ctx.last - 11; mi <= ctx.last; mi++) hist.push([mi, pop(mi)]);
      const x0 = hist[hist.length - 1][1] ?? 0;
      const fc = dampedForecast(`pop-${ctx.scope.key}`, x0, {
        mu: x0 * 0.6,
        phi: 0.88,
        sigma: Math.max(20, x0 * 0.35),
        horizon: 12,
        startMi: ctx.last,
        outlook: -outlookShift(ctx.scope.key) * 30,
        min: 0,
      });
      const f = forecastSeries(hist, fc);
      return seriesSet(
        'population-forecast',
        [{ unit: 'thousand people', label: 'Population at risk', min: 0 }],
        [
          band('band', f.names.band, f.band, { color: '#90CAF9' }),
          area('obs', 'Observed', f.observed, { color: '#1565C0' }),
          line('median', f.names.median, f.median, { color: '#1565C0', dash: true }),
        ],
        { asOf: miToIso(ctx.last) },
      );
    },
  },
};

// province × horizon risk heatmap (probability of D2+), registered as a matrix
drought.matrix!['province-risk'] = (ctx) => {
  const horizons = [3, 6, 12, 24];
  return {
    id: 'province-risk',
    rows: PROVINCE_ORDER.map(provinceName),
    cols: horizons.map((h) => `${h} months`),
    values: PROVINCE_ORDER.map((p) => {
      const sc = resolveScope({ province: p });
      const spi = regionSpi(sc, 3)[tOf(ctx.last)] ?? 0;
      const fc = dampedForecast(`spi-${sc.key}`, spi, {
        mu: 0,
        phi: 0.82,
        sigma: 0.95,
        horizon: 24,
        startMi: ctx.last,
        outlook: outlookShift(sc.key),
      });
      return horizons.map((h) => {
        const m = fc[h - 1];
        const sd = (m.p90 - m.p10) / 2.5632;
        return round(0.5 * (1 + erf((-1.3 - m.median) / (sd * Math.SQRT2))), 2);
      });
    }),
    unit: 'probability',
    scale: 'index01',
  };
};

function monthLabel(mi: number) {
  return `${MONTH_NAMES[miMonth(mi)]} ${miYear(mi)}`;
}

/** Error function (Abramowitz–Stegun 7.1.26). */
export function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

function regionSeriesCell(i: number, v: 'rain' | 'sm' | 'ndvi') {
  return cellSeries(v, i);
}

export {
  damsIn,
  boreholesIn,
  settlementsIn,
  muniSpi,
  regionalSgi,
  rainAnomalyPct,
  soilAnomalyPct,
  runoffAnomalyPct,
  monthLabel,
  outlookShift,
  cellForecastSpi,
  simulateDam,
  damT,
};
