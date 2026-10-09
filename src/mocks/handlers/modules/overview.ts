/** National Overview — every figure is pulled from the owning module's generators (no separate numbers). */
import { DROUGHT_CLASSES, droughtClassFromSpi } from '@/config/thresholds';
import { mean } from '@/lib/stats';
import { miMonth } from '@/lib/time';
import { PROVINCE_ORDER, municipalityById } from '../../reference/regions';
import { regionClimatology, regionSeries, regionSpi, sumMonths, normalMonths, tOf } from '../../generators/hydromet';
import { aggregatePctAt, aggregateStorage } from '../../generators/dams';
import { boreholeNow, boreholeLevels, gwT } from '../../generators/groundwater';
import { SETTLEMENTS, settlementNow } from '../../generators/settlements';
import { WQ_STATIONS, wqComplianceRate, wqComplianceRateAt } from '../../generators/quality';
import { DEMAND_ANCHORS, MUNI_SERVICES, accessSummary } from '../../generators/services';
import { bar, categories, col, kpi, line, monthly, seriesSet, table, type ModuleHandlers } from '../build';
import { spark } from '../common';
import { boreholesIn, damsIn, drought, runoffAnomalyPct } from './drought';
import { dams } from './dams';

export const overview: ModuleHandlers = {
  summary: (ctx) => {
    const s = ctx.scope;
    const L = ctx.last;
    const rain = regionSeries(s, 'rain');
    const clim = regionClimatology(s, 'rain');
    const r12 = sumMonths(rain, L, 12);
    const n12 = normalMonths(clim, L, 12);
    const spi6 = regionSpi(s, 6)[tOf(L)] ?? 0;
    const cls = droughtClassFromSpi(spi6);
    const dl = damsIn(s);
    const stor = aggregateStorage(dl);
    const storLy = aggregatePctAt(dl, L - 12);
    const bhs = boreholesIn(s).slice(0, 250);
    const gwA = mean(bhs.map((b) => boreholeNow(b.id).anomaly));
    const gwAPrev = mean(bhs.map((b) => boreholeNow(b.id).longTerm - boreholeLevels(b.id)[gwT(L - 1)]));
    const wq = WQ_STATIONS.filter((x) => s.includes(x));
    const wqRate = wqComplianceRate(wq);
    const svc = MUNI_SERVICES.filter((x) => s.includes(x));
    const acc = accessSummary(svc);
    const prodShare = svc.reduce((a, x) => a + x.productionMld, 0) / MUNI_SERVICES.reduce((a, x) => a + x.productionMld, 0);
    const demandBn = s.level === 'national' ? (DEMAND_ANCHORS.municipal + DEMAND_ANCHORS.agricultural + DEMAND_ANCHORS.industrial + DEMAND_ANCHORS.mining + DEMAND_ANCHORS.power) / 1000 : ((DEMAND_ANCHORS.municipal + DEMAND_ANCHORS.agricultural) * prodShare) / 1000;
    return [
      kpi('rain', 'rainfall', r12, { label: s.level === 'national' ? 'Rainfall (National)' : 'Rainfall', sublabel: 'Last 12 months', delta: ((r12 - n12) / n12) * 100, deltaUnit: '%', deltaLabel: 'vs long-term average', spark: spark((mi) => sumMonths(rain, mi, 12), L) }),
      kpi('drought', 'droughtClass', null, { label: 'Drought Status', sublabel: `SPI-6 ${spi6.toFixed(2)}`, text: cls === 'None' ? 'None' : cls, status: { scale: 'drought', id: cls, label: cls === 'None' ? 'No drought' : DROUGHT_CLASSES.find((d) => d.id === cls)!.label }, spark: spark((mi) => regionSpi(s, 6)[tOf(mi)], L), goodDirection: 'down' }),
      kpi('dams', 'storagePct', stor.pct, { label: 'Dam Storage (FSC)', sublabel: `${dl.length} major dams`, delta: stor.pct - storLy, deltaLabel: 'vs last year', spark: spark((mi) => aggregatePctAt(dl, mi), L) }),
      kpi('streamflow', 'runoffAnomaly', runoffAnomalyPct(s, L, 3), { label: 'Streamflow (Key Gauges)', sublabel: 'vs normal, 3 months', delta: runoffAnomalyPct(s, L, 3) - runoffAnomalyPct(s, L - 1, 3), deltaUnit: ' pp', deltaLabel: 'vs last month', spark: spark((mi) => runoffAnomalyPct(s, mi, 3), L) }),
      kpi('gw', 'gwLevelAnomaly', gwA, { label: 'Groundwater Levels', sublabel: 'vs seasonal average', delta: gwA - gwAPrev, deltaUnit: ' m', deltaLabel: 'vs last month' }),
      kpi('wq', 'wqCompliance', wqRate, { label: 'Water Quality (Compliance)', sublabel: `${wq.length} stations within guideline`, delta: wqRate - wqComplianceRateAt(wq, L - 12), deltaUnit: ' pp', deltaLabel: 'vs last year' }),
      kpi('services', 'pipedAccess', acc.piped, { label: 'Water Services Access', sublabel: 'Households with piped water', delta: 0.9, deltaUnit: ' pp', deltaLabel: 'vs last year (GHS)' }),
      kpi('demand', 'demand', demandBn, { label: 'Water Demand', sublabel: s.level === 'national' ? 'National, all sectors' : 'Municipal + agricultural', unit: 'bn m³/yr', decimals: 1, delta: 1.4, deltaUnit: '%', deltaLabel: 'vs last year', goodDirection: 'neutral' }),
    ];
  },

  timeseries: {
    'key-indicators': (ctx) => {
      const tab = ctx.q('tab') ?? 'rainfall';
      const s = ctx.scope;
      const from = ctx.last - 11;
      if (tab === 'streamflow') {
        const ro = regionSeries(s, 'runoff');
        const c = regionClimatology(s, 'runoff');
        return seriesSet('ki-streamflow', [{ unit: 'mm', label: 'Runoff' }], [bar('ro', 'Monthly runoff', monthly(from, ctx.last, (mi) => ro[tOf(mi)]), { color: '#0FA3B1' }), line('lt', 'Long-term average', monthly(from, ctx.last, (mi) => c[miMonth(mi)]), { color: '#E53935', symbol: true })]);
      }
      if (tab === 'groundwater') {
        const bhs = boreholesIn(s).slice(0, 200);
        return seriesSet('ki-gw', [{ unit: 'm bgl', label: 'Mean level', inverse: true }], [
          line('lvl', 'Mean borehole level', monthly(from, ctx.last, (mi) => mean(bhs.map((b) => boreholeLevels(b.id)[gwT(mi)]))), { color: '#1565C0', symbol: true }),
          line('lt', 'Long-term mean', monthly(from, ctx.last, () => mean(bhs.map((b) => boreholeNow(b.id).longTerm))), { color: '#E53935', dash: true }),
        ]);
      }
      if (tab === 'quality') {
        const wq = WQ_STATIONS.filter((x) => s.includes(x));
        return seriesSet('ki-wq', [{ unit: '%', label: 'Compliance', min: 0, max: 100 }], [bar('c', 'Stations compliant', monthly(from, ctx.last, (mi) => wqComplianceRateAt(wq, mi)), { color: '#2E9E5B' })]);
      }
      if (tab === 'demand') {
        const svc = MUNI_SERVICES.filter((x) => s.includes(x));
        const base = svc.reduce((a, x) => a + x.productionMld, 0);
        return seriesSet('ki-demand', [{ unit: 'Ml/day', label: 'Municipal production' }], [bar('p', 'Municipal water production', monthly(from, ctx.last, (mi) => base * (1 + 0.07 * Math.cos(((miMonth(mi) - 0.5) / 12) * 2 * Math.PI))), { color: '#8E44AD' })]);
      }
      const rain = regionSeries(s, 'rain');
      const clim = regionClimatology(s, 'rain');
      return seriesSet('ki-rainfall', [{ unit: 'mm', label: 'Rainfall' }], [bar('rain', 'Monthly rainfall', monthly(from, ctx.last, (mi) => rain[tOf(mi)]), { color: '#1E88E5' }), line('lt', 'Long-term average', monthly(from, ctx.last, (mi) => clim[miMonth(mi)]), { color: '#E53935', symbol: true })]);
    },
  },

  forecast: {
    ai: (ctx) => {
      const tab = ctx.q('tab') ?? 'drought';
      if (tab === 'reservoir') return dams.forecast!.storage(ctx);
      if (tab === 'settlements') return drought.forecast!.settlements(ctx);
      if (tab === 'area') return drought.forecast!.area(ctx);
      return drought.forecast!.spi(ctx);
    },
  },

  breakdown: {
    'services-access': () => {
      const cats = ['Piped (dwelling)', 'Piped (site)', 'Communal (< 200 m)', 'Below RDP'];
      const rows = PROVINCE_ORDER.map((p) => {
        const list = MUNI_SERVICES.filter((m) => m.province === p);
        const w = list.reduce((a, m) => a + m.households, 0);
        const f = (k: 'inDwelling' | 'onSite' | 'communal' | 'belowRdp') => list.reduce((a, m) => a + m[k] * m.households, 0) / w;
        return [f('inDwelling'), f('onSite'), f('communal'), f('belowRdp')];
      });
      return categories('services-access', '% of households', PROVINCE_ORDER, cats.map((c, i) => ({ key: `k${i}`, name: c, values: rows.map((r) => r[i]), color: ['#1565C0', '#2E9E5B', '#F2A900', '#E4572E'][i], stack: 's' })));
    },
  },

  table: {
    settlements: (ctx) => {
      const list = SETTLEMENTS.filter((x) => ctx.scope.includes(x))
        .map((x) => ({ x, n: settlementNow(x.id) }))
        .sort((a, b) => b.n.score - a.n.score)
        .slice(0, Number(ctx.q('limit') ?? 10));
      return table(
        'settlements',
        [col.rank(), col.text('name', 'Settlement'), col.text('province', 'Prov.'), col.cls('risk', 'Risk', 'risk'), col.num('population', 'Population'), col.cls('status', 'Status', 'response')],
        list.map(({ x, n }) => ({ id: x.id, name: x.name, municipality: muniName(x.municipality), province: x.province, risk: n.risk, population: x.population, status: n.status })),
        { rowKey: 'id' },
      );
    },
  },
};

function muniName(id: string) {
  return municipalityById.get(id)?.name ?? id;
}
