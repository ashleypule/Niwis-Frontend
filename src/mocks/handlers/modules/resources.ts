/** IWRM (spec §16), Water Quantity (§17), Water Services (§18), Tariffs (§19), Drought-Affected Settlements (§20). */
import { NRW_TARGET_PCT } from '@/config/thresholds';
import { MONTH_NAMES } from '@/lib/format';
import { Rng } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { miMonth, miToIso, miYear, monthIndex } from '@/lib/time';
import { CATCHMENTS, PROVINCE_ORDER, WMAS, municipalityById, provinceName, wmaName } from '../../reference/regions';
import { LAST } from '../../generators/hydromet';
import { aggregatePctAt, aggregateFlows, aggregateStorage } from '../../generators/dams';
import { AQUIFER_UNITS } from '../../generators/groundwater';
import { MUNI_SERVICES, accessSummary, muniServiceById, svcWeighted, type MuniServices } from '../../generators/services';
import { WSSS, WWTWS } from '../../generators/compliance';
import { SETTLEMENTS, settlementById, settlementNow, type Settlement } from '../../generators/settlements';
import { TRANSFERS, transferVolume, waterBalance, type Balance } from '../../generators/wrm';
import { dampedForecast, forecastSeries } from '../../generators/forecast';
import { resolveScope } from '../../generators/scope';
import { band, bar, categories, col, kpi, line, monthly, seriesSet, table, type Ctx, type ModuleHandlers } from '../build';
import { choropleth, pointsLayer } from '../common';
import { outlookShift } from './drought';
import { damsIn } from './dams';

const yearOf = (ctx: Ctx) => miYear(ctx.last);
const years = (ctx: Ctx, n = 9) => Array.from({ length: n }, (_, k) => yearOf(ctx) - n + 1 + k);
const yEnd = (y: number, ctx: Ctx) => Math.min(monthIndex(y, 11), ctx.last);
const stressLabel = (x: number) => (x >= 1 ? 'Extreme' : x >= 0.8 ? 'Very High' : x >= 0.6 ? 'High' : x >= 0.4 ? 'Moderate' : 'Low');

function waterfall(id: string, b: Balance, withLosses: boolean) {
  const cats: [string, number, boolean][] = [
    ['Surface runoff (MAR)', b.mar, false],
    ['Groundwater recharge', b.recharge, false],
    ['Inter-basin transfers', b.ibt, false],
    ['Return flows / recycled', b.returnFlows, false],
    ['Total renewable', b.renewable, true],
    ['Ecological reserve', -b.reserve, false],
    ['Non-utilisable (floods, spills, evaporation)', -b.nonUtilisable, false],
    ['Utilisable yield', b.utilisable, true],
    ['Municipal demand', -b.municipal, false],
    ['Agricultural demand', -b.agricultural, false],
    ['Industrial demand', -b.industrial, false],
    ['Mining & power', -b.miningPower, false],
    ...(withLosses ? ([['System losses (NRW)', -b.losses, false]] as [string, number, boolean][]) : []),
    ['Surplus / (deficit)', withLosses ? b.balance : b.balance + b.losses, true],
  ];
  return categories(id, 'Mm³/yr', cats.map((c) => c[0]), [
    { key: 'v', name: 'Volume', values: cats.map((c) => round(c[1], 0)) },
    { key: 'isTotal', name: 'isTotal', values: cats.map((c) => (c[2] ? 1 : 0)) },
  ]);
}

function catchmentRows(ctx: Ctx) {
  const uniq = [...new Map(CATCHMENTS.map((c) => [c.id, c])).values()].filter((c) => ctx.scope.level === 'national' || ctx.scope.includes({ province: c.province ?? undefined, wma: c.wma ?? undefined, lat: c.lat, lon: c.lon }));
  return uniq.map((c) => {
    const b = waterBalance(resolveScope({ catchment: c.id }));
    return { id: c.id, name: `${c.id} (${wmaName(c.wma ?? '')})`, mar: b.mar, avail: b.utilisable, demand: b.demand + b.losses, reserve: b.reserve, wsi: b.stress, status: stressLabel(b.stress) };
  });
}

// =================================================================== IWRM
export const iwrm: ModuleHandlers = {
  summary: (ctx) => {
    const b = waterBalance(ctx.scope);
    const prev = waterBalance(ctx.scope, ctx.last - 60);
    return [
      kpi('avail', 'availability', b.utilisable, { label: 'Utilisable Water Availability', sublabel: `of ${Math.round(b.renewable).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr renewable`, delta: ((b.utilisable - prev.utilisable) / prev.utilisable) * 100, deltaUnit: '%', deltaLabel: 'vs 5 years ago' }),
      kpi('demand', 'demand', b.demand, { label: 'Total Water Demand', delta: ((b.demand - prev.demand) / prev.demand) * 100, deltaUnit: '%', deltaLabel: 'vs 5 years ago' }),
      kpi('balance', 'waterBalance', b.balance, { label: 'Supply–Demand Balance', sublabel: b.balance >= 0 ? 'Surplus' : 'Deficit' }),
      kpi('reserve', 'ecologicalReserve', b.reserve, { label: 'Ecological Reserve Requirement', sublabel: `${Math.round((b.reserve / b.mar) * 100)}% of MAR` }),
      kpi('recycled', 'recycled', b.returnFlows, { label: 'Recycled & Return Flows', delta: 3, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('wsi', 'stressIndex', b.stress, { label: 'Water Stress Index', sublabel: 'Demand / utilisable yield', status: { scale: 'stress', id: b.stress >= 0.8 ? 'Extreme' : b.stress >= 0.6 ? 'High' : b.stress >= 0.4 ? 'Medium' : b.stress >= 0.2 ? 'Low-medium' : 'Low', label: `${stressLabel(b.stress)} risk` } }),
      kpi('status', 'programmeProgress', null, { label: 'IWRM Sustainability Status', text: b.balance > 0 ? 'On Track' : 'At Risk', status: { scale: 'progress', id: b.balance > 0 ? 'On Track' : 'At Risk', label: b.balance > 0 ? 'Balance positive' : 'Demand exceeds yield' } }),
    ];
  },
  breakdown: {
    waterfall: (ctx) => waterfall('iwrm-waterfall', waterBalance(ctx.scope), false),
    sector: (ctx) => {
      const b = waterBalance(ctx.scope);
      const cats = ['Agricultural', 'Municipal', 'Industrial', 'Mining & power'];
      const v = [b.agricultural, b.municipal, b.industrial, b.miningPower];
      return categories('iwrm-sector', 'Mm³/yr', cats, [{ key: 'v', name: 'Demand', values: v }], { colors: ['#2E9E5B', '#1565C0', '#F2A900', '#8E44AD'], center: { value: `${Math.round(b.demand).toLocaleString('en-ZA').replace(/,/g, ' ')}`, label: 'Mm³/yr demand' } });
    },
    transfers: () => categories('transfers', 'Mm³/yr', TRANSFERS.map((t) => t.name.replace(/ \(.*\)$/, '')), [{ key: 'v', name: 'Transfer volume (last 12 months)', values: TRANSFERS.map((t) => transferVolume(t)) }], { colors: TRANSFERS.map((_, k) => ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD', '#0FA3B1', '#E95F35', '#6D4C41'][k]) }),
    'reserve-compliance': (ctx) => {
      const ys = years(ctx);
      const req = ys.map((y) => waterBalance(ctx.scope, yEnd(y, ctx)).reserve);
      const prov = ys.map((y, k) => req[k] * clamp(0.62 + 0.25 * Math.min(1.4, waterBalance(ctx.scope, yEnd(y, ctx)).mar / waterBalance(ctx.scope).mar) * 0.8, 0.4, 1.05));
      return categories('reserve-compliance', 'Mm³/yr', ys.map(String), [{ key: 'r', name: 'Ecological reserve requirement', values: req, color: '#1565C0' }, { key: 'p', name: 'Provided (e-flows & quality)', values: prov, color: '#2E9E5B' }, { key: 'c', name: 'Compliance (%)', values: prov.map((p, k) => (p / req[k]) * 100), kind: 'line', axis: 1, color: '#E53935' }], { axis2Unit: '%' });
    },
    recycled: (ctx) => {
      const ys = years(ctx);
      return categories('recycled', 'Mm³/yr', ys.map(String), [{ key: 'r', name: 'Recycled water use', values: ys.map((y) => 640 * Math.pow(1.055, y - 2018) * (ctx.scope.level === 'national' ? 1 : 0.15)), color: '#2E9E5B' }, { key: 'f', name: 'Return flows', values: ys.map((y) => waterBalance(ctx.scope, yEnd(y, ctx)).returnFlows), color: '#1565C0' }]);
    },
  },
  timeseries: {
    availability: (ctx) => {
      const ys = Array.from({ length: 17 }, (_, k) => yearOf(ctx) - 16 + k);
      const b = ys.map((y) => waterBalance(ctx.scope, yEnd(y, ctx)));
      const x = (y: number) => `${y}-07-01`;
      return seriesSet('availability', [{ unit: 'Mm³/yr', label: 'Volume' }], [line('t', 'Total utilisable', ys.map((y, k) => [x(y), b[k].utilisable]), { color: '#1565C0', symbol: true }), line('s', 'Surface water', ys.map((y, k) => [x(y), b[k].surfaceAvailable]), { color: '#2E9E5B', symbol: true }), line('g', 'Groundwater', ys.map((y, k) => [x(y), b[k].gwAvailable]), { color: '#F2A900', symbol: true }), line('r', 'Recycled / return flows', ys.map((y, k) => [x(y), b[k].returnFlows]), { color: '#8E44AD', symbol: true }), line('d', 'Total demand', ys.map((y, k) => [x(y), b[k].demand + b[k].losses]), { color: '#E53935', dash: true })]);
    },
    nrw: (ctx) => {
      const svc = MUNI_SERVICES.filter((m) => ctx.scope.includes(m));
      const cur = svcWeighted(svc, (m) => m.nrw, (m) => m.productionMld);
      const ys = years(ctx);
      return { ...seriesSet('nrw', [{ unit: '%', label: 'Non-revenue water', min: 0, max: 60 }], [line('n', 'NRW (%)', ys.map((y) => [`${y}-07-01`, cur + (yearOf(ctx) - y) * 0.45]), { color: '#E53935', symbol: true })]), refLines: [{ y: NRW_TARGET_PCT, label: `Target ${NRW_TARGET_PCT}%`, color: '#1565C0' }] };
    },
  },
  table: {
    catchments: (ctx) =>
      table('catchments', [col.rank(), col.text('name', 'Catchment'), col.num('mar', 'MAR', 'Mm³/yr'), col.num('demand', 'Demand', 'Mm³/yr'), col.num('reserve', 'Ecological reserve', 'Mm³/yr'), col.num('wsi', 'WSI', '', 2, { scale: 'stress' }), col.cls('status', 'Status', 'risk')], catchmentRows(ctx).sort((a, b) => b.wsi - a.wsi).slice(0, Number(ctx.q('limit') ?? 10)).map((r) => ({ ...r, status: r.status === 'Extreme' ? 'Extreme' : r.status })), { rowKey: 'id' }),
    wmas: () =>
      table('wmas', [col.text('name', 'Water Management Area'), col.num('avail', 'Utilisable yield', 'Mm³/yr'), col.num('demand', 'Demand', 'Mm³/yr'), col.num('balance', 'Balance', 'Mm³/yr'), col.num('wsi', 'WSI', '', 2, { scale: 'stress' })], WMAS.map((w) => {
        const b = waterBalance(resolveScope({ wma: w.id }));
        return { name: w.name, avail: b.utilisable, demand: b.demand + b.losses, balance: b.balance, wsi: b.stress };
      })),
    summary: (ctx) => {
      const b = waterBalance(ctx.scope);
      const dams = damsIn(ctx.scope);
      return table('summary', [col.text('k', 'Indicator'), col.text('v', 'Value')], [
        { k: 'Area', v: ctx.scope.name },
        { k: 'Mean annual runoff (current year)', v: `${Math.round(b.mar).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr` },
        { k: 'Groundwater recharge', v: `${Math.round(b.recharge).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr` },
        { k: 'Utilisable yield', v: `${Math.round(b.utilisable).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr` },
        { k: 'Total demand (incl. losses)', v: `${Math.round(b.demand + b.losses).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr` },
        { k: 'Ecological reserve', v: `${Math.round(b.reserve).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr` },
        { k: 'Recycled / return flows', v: `${Math.round(b.returnFlows).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr` },
        { k: 'Water stress index', v: `${b.stress} (${stressLabel(b.stress)})` },
        { k: 'Major dams / storage', v: `${dams.length} dams · ${Math.round(aggregateStorage(dams).pct)}% FSC` },
        { k: 'Data sources', v: 'DWS, CMAs, SAWS, SANSA, municipalities' },
      ]);
    },
  },
  map: {
    stress: () => choropleth('stress', 'Water stress index (demand / utilisable yield)', 'municipality', 'stress', '', (id) => {
      const m = municipalityById.get(id)!;
      const b = waterBalance(resolveScope({ municipality: id }));
      const svc = muniServiceById.get(id);
      return clamp(b.stress * (svc?.distressed ? 1.15 : 1) * (m.areaKm2 < 1000 ? 1.3 : 1), 0, 1.5);
    }),
    'wma-stress': () => choropleth('wma-stress', 'Water stress index by WMA', 'wma', 'stress', '', (id) => waterBalance(resolveScope({ wma: id })).stress),
    'catchment-stress': () => choropleth('catchment-stress', 'Water stress index by catchment', 'catchment', 'stress', '', (id) => waterBalance(resolveScope({ catchment: id })).stress),
    availability: () => choropleth('availability', 'Utilisable yield per catchment (Mm³/yr)', 'catchment', 'runoff', 'Mm³/yr', (id) => waterBalance(resolveScope({ catchment: id })).utilisable, 0),
    transfers: () => pointsLayer('transfers', 'Inter-basin transfer schemes (Mm³/yr)', 'percent', '% of capacity', TRANSFERS.map((t) => ({ id: t.id, name: t.name, lat: t.lat, lon: t.lon, value: round((transferVolume(t) / t.capacity) * 100, 0), size: Math.min(1, t.capacity / 800), kind: 'transfer', sub: `${t.from} → ${t.to} · ${transferVolume(t)} Mm³/yr` }))),
  },
};

// =================================================================== Water quantity
export const waterQuantity: ModuleHandlers = {
  summary: (ctx) => {
    const b = waterBalance(ctx.scope);
    const units = AQUIFER_UNITS.filter((u) => ctx.scope.level === 'national' || ctx.scope.includes({ province: u.province }));
    const abstraction = b.demand * 0.92;
    const licensed = b.demand * 1.08;
    const tr = TRANSFERS.reduce((a, t) => a + transferVolume(t), 0);
    return [
      kpi('total', 'availability', b.utilisable, { label: 'Total Water Availability', sublabel: 'Utilisable yield' }),
      kpi('surface', 'availability', b.surfaceAvailable, { label: 'Surface Water Availability' }),
      kpi('gw', 'availability', b.gwAvailable, { label: 'Groundwater Availability', sublabel: `${units.length} aquifer units` }),
      kpi('abstraction', 'abstraction', abstraction, { label: 'Total Abstraction', delta: 4, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('allocation', 'allocationUse', (abstraction / licensed) * 100, { label: 'Licensed Allocation Utilised', sublabel: `${Math.round(licensed).toLocaleString('en-ZA').replace(/,/g, ' ')} Mm³/yr licensed`, goodDirection: 'neutral' }),
      kpi('transfers', 'transfers', ctx.scope.level === 'national' ? tr : b.ibt, { label: 'Inter-basin Transfers', sublabel: ctx.scope.level === 'national' ? `${TRANSFERS.length} schemes` : 'Net inflow' }),
      kpi('demand', 'demand', b.demand + b.losses, { label: 'Total Water Demand', sublabel: 'Incl. system losses' }),
      kpi('security', 'stressIndex', b.stress, { label: 'Water Security Index', sublabel: 'Demand / yield', status: { scale: 'stress', id: b.stress >= 0.8 ? 'Extreme' : b.stress >= 0.6 ? 'High' : b.stress >= 0.4 ? 'Medium' : 'Low', label: `${stressLabel(b.stress)} risk` } }),
    ];
  },
  breakdown: {
    waterfall: (ctx) => waterfall('wq-waterfall', waterBalance(ctx.scope), true),
    transfers: iwrm.breakdown!.transfers,
    sector: (ctx) => {
      const ys = years(ctx, 6);
      const b = ys.map((y) => waterBalance(ctx.scope, yEnd(y, ctx)));
      return categories('sector', 'Mm³/yr', ys.map(String), [{ key: 'm', name: 'Municipal', values: b.map((x) => x.municipal), color: '#1565C0', stack: 's' }, { key: 'a', name: 'Agricultural', values: b.map((x) => x.agricultural), color: '#2E9E5B', stack: 's' }, { key: 'i', name: 'Industrial', values: b.map((x) => x.industrial), color: '#F2A900', stack: 's' }, { key: 'p', name: 'Mining & power', values: b.map((x) => x.miningPower), color: '#8E44AD', stack: 's' }]);
    },
    allocation: (ctx) => {
      const ys = years(ctx, 6);
      const b = ys.map((y) => waterBalance(ctx.scope, yEnd(y, ctx)));
      return categories('allocation', 'Mm³/yr', ys.map(String), [{ key: 'l', name: 'Licensed allocation', values: b.map((x) => x.demand * 1.08), color: '#94A3B8' }, { key: 'u', name: 'Actual abstraction', values: b.map((x) => x.demand * 0.92), color: '#1565C0' }, { key: 'p', name: 'Utilisation (%)', values: b.map(() => (0.92 / 1.08) * 100), kind: 'line', axis: 1, color: '#E53935' }], { axis2Unit: '%' });
    },
  },
  timeseries: {
    surface: (ctx) => {
      const dams = damsIn(ctx.scope);
      const from = Math.min(ctx.from, ctx.to - 23);
      return seriesSet('surface', [{ unit: 'Mm³/month', label: 'Volume' }], [bar('in', 'Inflow', monthly(from, ctx.to, (mi) => aggregateFlows(dams, mi).inflow), { color: '#1565C0' }), bar('out', 'Outflow', monthly(from, ctx.to, (mi) => aggregateFlows(dams, mi).outflow), { color: '#E53935' }), line('net', 'Net flow', monthly(from, ctx.to, (mi) => { const f = aggregateFlows(dams, mi); return f.inflow - f.outflow - f.evap; }), { color: '#2E9E5B', symbol: true })]);
    },
    groundwater: (ctx) => {
      const b = waterBalance(ctx.scope);
      const from = Math.min(ctx.from, ctx.to - 23);
      const r = new Rng(`gwq-${ctx.scope.key}`);
      const rech = monthly(from, ctx.to, (mi) => (b.recharge / 12) * (0.4 + 1.2 * Math.max(0, Math.cos(((miMonth(mi) - 1) / 12) * 2 * Math.PI))) * r.range(0.8, 1.2));
      const abs = b.gwAvailable * 0.6;
      return seriesSet('gw-quantity', [{ unit: 'Mm³/month', label: 'Volume' }], [bar('r', 'Recharge', rech, { color: '#1565C0' }), line('a', 'Abstraction', rech.map(([x]) => [x, abs / 12]), { color: '#E53935' }), line('n', 'Net recharge', rech.map(([x, y]) => [x, (y ?? 0) - abs / 12]), { color: '#2E9E5B' })]);
    },
    storage: (ctx) => {
      const dams = damsIn(ctx.scope);
      const cap = dams.reduce((a, d) => a + d.capacity, 0);
      const from = Math.min(ctx.from, ctx.to - 23);
      return seriesSet('quantity-storage', [{ unit: 'Mm³', label: 'Storage' }, { unit: '%', label: '% FSC', min: 0, max: 100 }], [bar('v', 'Total storage', monthly(from, ctx.to, (mi) => (aggregatePctAt(dams, mi) * cap) / 100), { color: '#1565C0' }), line('p', '% full supply capacity', monthly(from, ctx.to, (mi) => aggregatePctAt(dams, mi)), { axis: 1, color: '#E53935', symbol: true })], { note: `${dams.length} dams` });
    },
  },
  table: { catchments: iwrm.table!.catchments, summary: iwrm.table!.summary },
  map: {
    ...iwrm.map,
    'demand-density': () => choropleth('demand-density', 'Municipal water demand (Ml/day)', 'municipality', 'rainfall', 'Ml/day', (id) => muniServiceById.get(id)?.productionMld ?? null, 0),
  },
};

// =================================================================== Water services
const svcIn = (ctx: Ctx) => MUNI_SERVICES.filter((m) => ctx.scope.includes(m));
function pickMuni(ctx: Ctx): MuniServices {
  const id = ctx.q('entityId');
  if (id && muniServiceById.has(id)) return muniServiceById.get(id)!;
  return [...(svcIn(ctx).length ? svcIn(ctx) : MUNI_SERVICES)].sort((a, b) => b.population - a.population)[0];
}

function muniEntity(m: MuniServices) {
  const wtps = WSSS.filter((p) => p.municipality === m.id);
  const ww = WWTWS.filter((p) => p.municipality === m.id);
  return {
    id: m.id,
    name: m.name,
    title: `${m.name} (${provinceName(m.province)})`,
    type: 'municipality',
    province: m.province,
    image: 'wtp' as const,
    status: { scale: 'nrw', id: '', label: `NRW ${m.nrw}%` },
    fields: [
      { label: 'Municipality (WSA)', value: m.name },
      { label: 'Province', value: provinceName(m.province) },
      { label: 'Population', value: m.population },
      { label: 'Households', value: m.households },
      { label: 'Piped water (in dwelling / on site)', value: `${round(m.inDwelling + m.onSite, 0)}%` },
      { label: 'At least RDP level (≤ 200 m)', value: `${round(m.inDwelling + m.onSite + m.communal, 0)}%` },
      { label: 'Sanitation access', value: `${round(m.sanitation, 0)}%` },
      { label: 'Water supply systems / WWTWs', value: `${wtps.length} / ${ww.length}` },
      { label: 'Reservoirs / pump stations', value: `${m.reservoirs} / ${m.pumpStations}` },
      { label: 'Pipeline network', value: m.pipelineKm, unit: 'km' },
      { label: 'Daily production', value: m.productionMld, unit: 'Ml/day' },
      { label: 'Non-revenue water', value: m.nrw, unit: '%', scale: 'nrw' },
      { label: 'Supply reliability', value: m.reliability, unit: '%' },
      { label: 'Pipe failure rate', value: m.breaksPer100km, unit: 'breaks/100 km/yr' },
      { label: 'Average supply hours', value: `${round(24 * (m.reliability / 100), 1)} h/day` },
      { label: 'Financially distressed', value: m.distressed ? 'Yes (MFMA list)' : 'No' },
      { label: 'Data sources', value: 'Stats SA GHS, municipal returns, Blue/Green Drop' },
    ],
  };
}

export const services: ModuleHandlers = {
  summary: (ctx) => {
    const l = svcIn(ctx);
    const a = accessSummary(l);
    const pop = l.reduce((s, m) => s + m.population, 0);
    return [
      kpi('pop', 'populationServed', (pop * a.rdp) / 100 / 1e6, { label: 'Population Served', sublabel: 'At least basic (RDP) level', unit: 'million', decimals: 1, delta: 1.5, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('piped', 'pipedAccess', a.piped, { label: 'Piped Water Access', sublabel: 'Households (dwelling or yard)', delta: 0.9, deltaUnit: ' pp', deltaLabel: 'vs last year' }),
      kpi('san', 'sanitationAccess', a.sanitation, { label: 'Sanitation Access (RDP)', delta: 1.4, deltaUnit: ' pp', deltaLabel: 'vs last year' }),
      kpi('wtp', 'boreholes', WSSS.filter((p) => ctx.scope.includes(p) && !p.process.startsWith('Borehole')).length, { label: 'Water Treatment Plants', unit: '' }),
      kpi('res', 'boreholes', l.reduce((s, m) => s + m.reservoirs, 0), { label: 'Reservoirs', unit: '' }),
      kpi('pump', 'boreholes', l.reduce((s, m) => s + m.pumpStations, 0), { label: 'Pump Stations', unit: '' }),
      kpi('pipe', 'boreholes', l.reduce((s, m) => s + m.pipelineKm, 0), { label: 'Pipelines', unit: 'km' }),
      kpi('nrw', 'nrw', a.nrw, { label: 'Non-Revenue Water', sublabel: `Target ≤ ${NRW_TARGET_PCT}%`, delta: -0.4, deltaUnit: ' pp', deltaLabel: 'vs last year' }),
      kpi('rel', 'reliability', a.reliability, { label: 'System Reliability', sublabel: 'Continuity of supply', delta: 0.6, deltaUnit: ' pp', deltaLabel: 'vs last year' }),
    ];
  },
  timeseries: {
    nrw: iwrm.timeseries!.nrw,
    interruptions: (ctx) => {
      const l = svcIn(ctx);
      const base = l.reduce((s, m) => s + m.interruptionsPerMonth, 0);
      const r = new Rng(`int-${ctx.scope.key}`);
      const from = Math.min(ctx.from, ctx.to - 23);
      return seriesSet('interruptions', [{ unit: 'events', label: 'Interruptions per month' }], [bar('p', 'Planned', monthly(from, ctx.to, () => base * 0.35 * r.range(0.8, 1.2)), { color: '#1565C0' }), bar('u', 'Unplanned', monthly(from, ctx.to, (mi) => base * 0.65 * r.range(0.8, 1.25) * (1 + 0.15 * Math.cos(((miMonth(mi) - 6) / 12) * 2 * Math.PI))), { color: '#E53935' })]);
    },
    'plant-performance': (ctx) => {
      const kind = ctx.q('kind') === 'wwtw' ? WWTWS : WSSS;
      const l = kind.filter((p) => ctx.scope.includes(p));
      const cap = l.reduce((s, p) => s + p.capacityMld, 0);
      const flow = l.reduce((s, p) => s + p.flowMld, 0);
      const ys = years(ctx);
      return { id: 'plant-performance', xType: 'category', axes: [{ unit: 'Ml/day', label: 'Flow' }, { unit: '%', label: 'Utilisation', min: 0 }], series: [bar('c', 'Design capacity', ys.map((y) => [String(y), cap * (1 - (yearOf(ctx) - y) * 0.012)]), { color: '#90CAF9' }), bar('f', 'Treated volume', ys.map((y) => [String(y), flow * (1 - (yearOf(ctx) - y) * 0.018)]), { color: '#1565C0' }), line('u', 'Utilisation (%)', ys.map((y) => [String(y), ((flow * (1 - (yearOf(ctx) - y) * 0.018)) / (cap * (1 - (yearOf(ctx) - y) * 0.012))) * 100]), { axis: 1, color: '#E53935', symbol: true })] };
    },
  },
  breakdown: {
    coverage: (ctx) => {
      const ys = years(ctx);
      const a = accessSummary(svcIn(ctx));
      return categories('coverage', '%', ys.map(String), [{ key: 'p', name: 'Piped water access', values: ys.map((y) => a.piped - (yearOf(ctx) - y) * 0.9), color: '#1565C0' }, { key: 's', name: 'Sanitation access', values: ys.map((y) => a.sanitation - (yearOf(ctx) - y) * 1.3), color: '#2E9E5B' }]);
    },
    'service-levels': () => {
      const cats = ['Piped (dwelling)', 'Piped (yard)', 'Communal (< 200 m)', 'Below RDP'];
      const rows = PROVINCE_ORDER.map((p) => {
        const l = MUNI_SERVICES.filter((m) => m.province === p);
        return [svcWeighted(l, (m) => m.inDwelling), svcWeighted(l, (m) => m.onSite), svcWeighted(l, (m) => m.communal), svcWeighted(l, (m) => m.belowRdp)];
      });
      return categories('service-levels', '% of households', PROVINCE_ORDER, cats.map((c, k) => ({ key: c, name: c, values: rows.map((r) => r[k]), color: ['#1565C0', '#2E9E5B', '#F2A900', '#E95F35'][k], stack: 's' })));
    },
    'asset-condition': (ctx) => {
      const l = svcIn(ctx);
      const ci = svcWeighted(l, (m) => m.conditionIndex);
      const n = l.reduce((s, m) => s + m.reservoirs + m.pumpStations + m.pipelineKm / 5, 0);
      const shares = [0.08 + (ci - 3) * 0.08, 0.3 + (ci - 3) * 0.05, 0.3, 0.2 - (ci - 3) * 0.06, 0.12 - (ci - 3) * 0.07].map((x) => clamp(x, 0.02, 0.6));
      const t = shares.reduce((a, b) => a + b, 0);
      return categories('asset-condition', 'assets', ['Excellent', 'Good', 'Fair', 'Poor', 'Very poor'], [{ key: 'n', name: 'Assets', values: shares.map((x) => Math.round((x / t) * n)) }], { colors: ['#1B7F3B', '#8BC34A', '#F6CF3E', '#F28C28', '#D7301F'], center: { value: Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' '), label: 'Assets' } });
    },
    maintenance: (ctx) => {
      const n = svcIn(ctx).reduce((s, m) => s + m.reservoirs * 2 + m.pumpStations * 3, 0);
      const sh = [0.74, 0.14, 0.08, 0.04];
      return categories('maintenance', 'work orders', ['Completed', 'In progress', 'Overdue', 'Cancelled'], [{ key: 'n', name: 'Work orders', values: sh.map((x) => Math.round(n * x)) }], { colors: ['#2E9E5B', '#1565C0', '#F2A900', '#E95F35'], center: { value: n.toLocaleString('en-ZA').replace(/,/g, ' '), label: 'Work orders' } });
    },
    pipelines: (ctx) => {
      const km = svcIn(ctx).reduce((s, m) => s + m.pipelineKm, 0);
      const d = ['< 100 mm', '100–200 mm', '200–400 mm', '400–800 mm', '> 800 mm'];
      const sh = [0.32, 0.36, 0.18, 0.1, 0.04];
      return categories('pipelines', 'km', d, [{ key: 'k', name: 'Network length', values: sh.map((x) => km * x) }], { colors: ['#90CAF9', '#64B5F6', '#1E88E5', '#1565C0', '#0D47A1'] });
    },
    'urban-rural': (ctx) => {
      const l = svcIn(ctx);
      const urban = l.filter((m) => m.metro || m.population > 300_000);
      const rural = l.filter((m) => !(m.metro || m.population > 300_000));
      const a = accessSummary(urban);
      const b = accessSummary(rural);
      return categories('urban-rural', '%', ['Piped water', 'Basic (RDP) water', 'Sanitation', 'Reliability'], [{ key: 'u', name: 'Urban', values: [a.piped, a.rdp, a.sanitation, a.reliability], color: '#1565C0' }, { key: 'r', name: 'Rural', values: [b.piped, b.rdp, b.sanitation, b.reliability], color: '#2E9E5B' }]);
    },
    projects: (ctx) => {
      const ys = years(ctx, 6);
      const r = new Rng(`proj-${ctx.scope.key}`);
      const n = Math.max(6, Math.round(svcIn(ctx).length * 1.8));
      return categories('projects', 'projects', ys.map(String), [{ key: 'p', name: 'Planned', values: ys.map(() => Math.round(n * r.range(0.9, 1.15))), color: '#94A3B8' }, { key: 'c', name: 'Completed', values: ys.map((y) => Math.round(n * r.range(0.55, 0.85) * (y === yearOf(ctx) ? (miMonth(ctx.last) + 1) / 12 : 1))), color: '#2E9E5B' }]);
    },
  },
  table: {
    plants: (ctx) =>
      table('plants', [col.rank(), col.text('name', 'Treatment works'), col.text('municipality', 'Municipality'), col.num('cap', 'Capacity', 'Ml/day', 1), col.num('flow', 'Flow', 'Ml/day', 1), col.num('util', 'Utilisation', '%'), col.num('score', 'Blue Drop', '%', 0, { scale: 'blueDrop' })], WSSS.filter((p) => ctx.scope.includes(p)).sort((a, b) => b.capacityMld - a.capacityMld).slice(0, 10).map((p) => ({ name: p.name, municipality: p.municipalityName, cap: p.capacityMld, flow: p.flowMld, util: (p.flowMld / p.capacityMld) * 100, score: p.score }))),
    nrw: (ctx) => {
      const high = ctx.q('order') !== 'lowest';
      return table('nrw', [col.rank(), col.text('name', 'Municipality'), col.text('province', 'Province'), col.num('nrw', 'NRW', '%', 0, { scale: 'nrw' }), col.cls('status', 'Status', 'risk')], [...svcIn(ctx)].sort((a, b) => (high ? b.nrw - a.nrw : a.nrw - b.nrw)).slice(0, 5).map((m) => ({ id: m.id, name: m.name, province: m.province, nrw: m.nrw, status: m.nrw >= 45 ? 'Critical' : m.nrw >= 35 ? 'High' : m.nrw >= 25 ? 'Moderate' : 'Low' })), { rowKey: 'id' });
    },
  },
  map: {
    coverage: () => choropleth('coverage', 'Piped water access (% of households)', 'municipality', 'coverage', '%', (id) => { const m = muniServiceById.get(id); return m ? m.inDwelling + m.onSite : null; }, 0),
    rdp: () => choropleth('rdp', 'Basic (RDP) water access (%)', 'municipality', 'coverage', '%', (id) => { const m = muniServiceById.get(id); return m ? m.inDwelling + m.onSite + m.communal : null; }, 0),
    sanitation: () => choropleth('sanitation', 'Sanitation access (%)', 'municipality', 'coverage', '%', (id) => muniServiceById.get(id)?.sanitation ?? null, 0),
    nrw: () => choropleth('nrw', 'Non-revenue water (%)', 'municipality', 'nrw', '%', (id) => muniServiceById.get(id)?.nrw ?? null, 0),
    reliability: () => choropleth('reliability', 'Supply reliability (%)', 'municipality', 'coverage', '%', (id) => muniServiceById.get(id)?.reliability ?? null, 0),
    'asset-condition': () => choropleth('asset-condition', 'Infrastructure condition index (1–5 → %)', 'municipality', 'coverage', '%', (id) => { const m = muniServiceById.get(id); return m ? (m.conditionIndex / 5) * 100 : null; }, 0),
    wtp: () => pointsLayer('wtp', 'Water treatment plants (Blue Drop %)', 'blueDrop', '%', WSSS.filter((p) => !p.process.startsWith('Borehole')).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, value: p.score, size: Math.min(1, Math.log10(p.capacityMld + 1) / 2.6), kind: 'wtp', sub: `${p.capacityMld} Ml/day` }))),
  },
  entities: (ctx) => ({ type: 'municipality', total: svcIn(ctx).length, items: [...svcIn(ctx)].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ id: m.id, name: m.name, type: 'municipality', province: m.province, sub: m.province })) }),
  entity: (_ctx, id) => muniEntity(muniServiceById.get(id) ?? MUNI_SERVICES[0]),
  forecast: {
    nrw: (ctx) => {
      const l = svcIn(ctx);
      const cur = svcWeighted(l, (m) => m.nrw, (m) => m.productionMld);
      const hist: [number, number | null][] = Array.from({ length: 24 }, (_, k) => [ctx.last - 23 + k, cur + ((23 - k) / 12) * 0.45 + new Rng(`nh-${k}`).normal(0, 0.3)]);
      const fc = dampedForecast(`nrwf-${ctx.scope.key}`, cur, { mu: cur - 2.5, phi: 0.95, sigma: 2.5, horizon: 24, startMi: ctx.last });
      const f = forecastSeries(hist, fc);
      return { ...seriesSet('nrw-forecast', [{ unit: '%', label: 'NRW', min: 0, max: 60 }], [band('band', f.names.band, f.band, { color: '#FFCDD2' }), line('obs', 'Historical', f.observed, { color: '#13233A' }), line('median', f.names.median, f.median, { color: '#E53935', dash: true })], { asOf: miToIso(ctx.last) }), refLines: [{ y: NRW_TARGET_PCT, label: 'Target 20%', color: '#1565C0' }] };
    },
    coverage: (ctx) => {
      const a = accessSummary(svcIn(ctx));
      const hist: [number, number | null][] = Array.from({ length: 24 }, (_, k) => [ctx.last - 23 + k, a.piped - ((23 - k) / 12) * 0.9]);
      const fc = dampedForecast(`covf-${ctx.scope.key}`, a.piped, { mu: Math.min(99, a.piped + 2.5), phi: 0.96, sigma: 1.2, horizon: 24, startMi: ctx.last, max: 100 });
      const f = forecastSeries(hist, fc);
      return seriesSet('coverage-forecast', [{ unit: '%', label: 'Piped water access' }], [band('band', f.names.band, f.band, { color: '#C8E6C9' }), line('obs', 'Historical', f.observed, { color: '#13233A' }), line('median', f.names.median, f.median, { color: '#2E9E5B', dash: true })], { asOf: miToIso(ctx.last) });
    },
    demand: (ctx) => {
      const prod = svcIn(ctx).reduce((s, m) => s + m.productionMld, 0);
      const seas = (mi: number) => 1 + 0.08 * Math.cos(((miMonth(mi) - 0.5) / 12) * 2 * Math.PI);
      const hist: [number, number | null][] = Array.from({ length: 24 }, (_, k) => [ctx.last - 23 + k, prod * seas(ctx.last - 23 + k) * (1 - (23 - k) * 0.0015)]);
      const fc = Array.from({ length: 24 }, (_, h) => {
        const mi = ctx.last + 1 + h;
        const m = prod * seas(mi) * (1 + h * 0.0015);
        return { mi, median: m, p10: m * (0.96 - h * 0.002), p90: m * (1.04 + h * 0.003) };
      });
      const f = forecastSeries(hist, fc);
      return seriesSet('demand-forecast', [{ unit: 'Ml/day', label: 'Municipal water demand' }], [band('band', f.names.band, f.band, { color: '#BBDEFB' }), line('obs', 'Historical', f.observed, { color: '#13233A' }), line('median', f.names.median, f.median, { color: '#1565C0', dash: true })], { asOf: miToIso(ctx.last) });
    },
  },
};

// =================================================================== Tariffs (spec §19)
const RAW_CHARGE = 0.74; // R/m³ average DWS raw water charge
const BULK_TARIFF = 11.8; // R/kL average bulk tariff (water boards)
const SCALE_INC = { raw: 6.2, bulk: 8.4, municipal: 9.6 };

function revenue(l: MuniServices[]) {
  const municipal = l.reduce((s, m) => s + m.productionMld * 365 * 1000 * (1 - m.nrw / 100) * m.avgTariff, 0) / 1e9; // R bn
  const bulk = l.reduce((s, m) => s + m.productionMld * 365 * 1000 * 0.55 * BULK_TARIFF, 0) / 1e9;
  const share = l.reduce((s, m) => s + m.productionMld, 0) / MUNI_SERVICES.reduce((s, m) => s + m.productionMld, 0);
  const raw = (17_950 * 1e6 * RAW_CHARGE * share) / 1e9;
  return { raw, bulk, municipal };
}

export const tariffs: ModuleHandlers = {
  summary: (ctx) => {
    const l = svcIn(ctx);
    const rev = revenue(l);
    return [
      kpi('raw', 'revenue', rev.raw, { label: 'Raw Water Revenue', unit: 'R bn', decimals: 1, delta: SCALE_INC.raw, deltaUnit: '%', deltaLabel: 'vs last year', goodDirection: 'up' }),
      kpi('bulk', 'revenue', rev.bulk, { label: 'Bulk Water Revenue', unit: 'R bn', decimals: 1, delta: SCALE_INC.bulk, deltaUnit: '%', deltaLabel: 'vs last year', goodDirection: 'up' }),
      kpi('muni', 'revenue', rev.municipal, { label: 'Municipal Water Revenue', unit: 'R bn', decimals: 1, delta: SCALE_INC.municipal, deltaUnit: '%', deltaLabel: 'vs last year', goodDirection: 'up' }),
      kpi('rawc', 'rawWaterTariff', RAW_CHARGE, { label: 'Average Raw Water Charge', unit: 'R/m³', delta: SCALE_INC.raw, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('bulkt', 'tariff', BULK_TARIFF, { label: 'Average Bulk Water Tariff', unit: 'R/kL', delta: SCALE_INC.bulk, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('munt', 'tariff', svcWeighted(l, (m) => m.avgTariff), { label: 'Average Municipal Tariff', unit: 'R/kL', delta: svcWeighted(l, (m) => m.tariffIncrease), deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('afford', 'affordability', svcWeighted(l, (m) => m.affordability), { label: 'Affordability', sublabel: 'Water bill as % of household income (15 kL)' }),
      kpi('recovery', 'costRecovery', svcWeighted(l, (m) => m.costRecovery, (m) => m.productionMld), { label: 'Cost Recovery Ratio' }),
    ];
  },
  breakdown: {
    comparison: (ctx) => {
      const ys = years(ctx);
      const mt = svcWeighted(svcIn(ctx), (m) => m.avgTariff);
      const f = (base: number, inc: number, y: number) => base / Math.pow(1 + inc / 100, yearOf(ctx) - y);
      return categories('comparison', 'R/kL', ys.map(String), [{ key: 'r', name: 'Raw water charge', values: ys.map((y) => f(RAW_CHARGE, SCALE_INC.raw, y)), color: '#1565C0' }, { key: 'b', name: 'Bulk water tariff', values: ys.map((y) => f(BULK_TARIFF, SCALE_INC.bulk, y)), color: '#2E9E5B' }, { key: 'm', name: 'Municipal tariff', values: ys.map((y) => f(mt, SCALE_INC.municipal, y)), color: '#F2A900' }]);
    },
    revenue: (ctx) => {
      const r = revenue(svcIn(ctx));
      const tot = r.raw + r.bulk + r.municipal;
      return categories('revenue', 'R bn', ['Raw water charges', 'Bulk water tariffs', 'Municipal tariffs'], [{ key: 'v', name: 'Revenue', values: [r.raw, r.bulk, r.municipal] }], { colors: ['#1565C0', '#2E9E5B', '#F2A900'], center: { value: `R${round(tot, 1)} bn`, label: 'Total revenue' } });
    },
    'cost-vs-tariff': (ctx) => {
      const ys = years(ctx);
      const l = svcIn(ctx);
      const t = svcWeighted(l, (m) => m.avgTariff);
      const c = svcWeighted(l, (m) => m.costOfSupply);
      const back = (v: number, inc: number, y: number) => v / Math.pow(1 + inc / 100, yearOf(ctx) - y);
      return categories('cost-vs-tariff', 'R/kL', ys.map(String), [{ key: 'c', name: 'Cost of supply', values: ys.map((y) => back(c, 10.5, y)), color: '#8E44AD' }, { key: 't', name: 'Average tariff', values: ys.map((y) => back(t, SCALE_INC.municipal, y)), color: '#E53935', kind: 'line' }, { key: 'r', name: 'Cost recovery (%)', values: ys.map((y) => (back(t, SCALE_INC.municipal, y) / back(c, 10.5, y)) * 100), color: '#2E9E5B', kind: 'line', axis: 1 }], { axis2Unit: '%' });
    },
    increases: (ctx) => {
      const ys = years(ctx);
      const r = new Rng(`inc-${ctx.scope.key}`);
      return categories('increases', '%', ys.map(String), [{ key: 'r', name: 'Raw water', values: ys.map(() => SCALE_INC.raw + r.normal(0, 1.2)), color: '#1565C0', kind: 'line' }, { key: 'b', name: 'Bulk water', values: ys.map(() => SCALE_INC.bulk + r.normal(0, 1.5)), color: '#2E9E5B', kind: 'line' }, { key: 'm', name: 'Municipal', values: ys.map(() => SCALE_INC.municipal + r.normal(0, 1.8)), color: '#F2A900', kind: 'line' }]);
    },
    blocks: (ctx) => {
      const m = pickMuni(ctx);
      return categories('blocks', 'R/kL', ['0–6 kL (FBW)', '6–10.5 kL', '10.5–20 kL', '20–35 kL', '35–50 kL', '> 50 kL'], [{ key: 'v', name: `${m.name} domestic tariff`, values: m.blocks }], { colors: ['#2E9E5B', '#8BC34A', '#F6CF3E', '#F2A900', '#F28C28', '#E95F35'] });
    },
    affordability: (ctx) => {
      const m = pickMuni(ctx);
      const ys = years(ctx);
      const inc = m.metro ? 21000 : 9500;
      return categories('affordability', 'R/month', ys.map(String), [{ key: 'i', name: 'Average household income', values: ys.map((y) => inc / Math.pow(1.05, yearOf(ctx) - y)), color: '#5C6BC0' }, { key: 'e', name: 'Water expenditure (% of income)', values: ys.map((y) => m.affordability / Math.pow(1.045 / 1.05, yearOf(ctx) - y)), color: '#E53935', kind: 'line', axis: 1 }], { axis2Unit: '%' });
    },
    'muni-nrw': (ctx) => {
      const m = pickMuni(ctx);
      const ys = years(ctx);
      const vol = m.productionMld * 365 / 1000;
      return categories('muni-nrw', 'Mm³/yr', ys.map(String), [{ key: 's', name: 'System input volume', values: ys.map((y) => vol * (1 - (yearOf(ctx) - y) * 0.015)), color: '#1565C0' }, { key: 'b', name: 'Billed authorised consumption', values: ys.map((y) => vol * (1 - (yearOf(ctx) - y) * 0.015) * (1 - (m.nrw + (yearOf(ctx) - y) * 0.4) / 100)), color: '#2E9E5B' }, { key: 'n', name: 'NRW (%)', values: ys.map((y) => m.nrw + (yearOf(ctx) - y) * 0.4), color: '#E53935', kind: 'line', axis: 1 }], { axis2Unit: '%' });
    },
  },
  table: {
    ranking: (ctx) => {
      const high = ctx.q('order') !== 'lowest';
      return table('tariff-ranking', [col.rank(), col.text('name', 'Municipality'), col.text('province', 'Province'), col.num('t', 'Average tariff', 'R/kL', 2), col.num('inc', 'Increase', '%', 1)], [...svcIn(ctx)].sort((a, b) => (high ? b.avgTariff - a.avgTariff : a.avgTariff - b.avgTariff)).slice(0, 5).map((m) => ({ id: m.id, name: m.name, province: m.province, t: m.avgTariff, inc: m.tariffIncrease })), { rowKey: 'id' });
    },
    'forecast-indicators': (ctx) => {
      const l = svcIn(ctx);
      const t = svcWeighted(l, (m) => m.avgTariff);
      const af = svcWeighted(l, (m) => m.affordability);
      const rev = revenue(l);
      const g = (v: number, rate: number, h: number) => v * Math.pow(1 + rate / 100, h / 12);
      const rows = [
        { ind: 'Average municipal tariff (R/kL)', f: (h: number) => g(t, SCALE_INC.municipal, h), d: 2 },
        { ind: 'Household affordability (% income)', f: (h: number) => g(af, 4.4, h), d: 1 },
        { ind: 'Municipal revenue (R bn)', f: (h: number) => g(rev.municipal, 11, h), d: 1 },
        { ind: 'Non-revenue water (%)', f: (h: number) => svcWeighted(l, (m) => m.nrw, (m) => m.productionMld) - h * 0.08, d: 1 },
        { ind: 'Raw water charge (R/m³)', f: (h: number) => g(RAW_CHARGE, SCALE_INC.raw, h), d: 2 },
      ];
      return table('tariff-forecast', [col.text('ind', 'Indicator'), col.num('cur', 'Current', '', 2), col.num('h3', '3 months', '', 2), col.num('h6', '6 months', '', 2), col.num('h12', '12 months', '', 2), col.num('h24', '24 months', '', 2)], rows.map((r) => ({ ind: r.ind, cur: round(r.f(0), r.d), h3: round(r.f(3), r.d), h6: round(r.f(6), r.d), h12: round(r.f(12), r.d), h24: round(r.f(24), r.d) })));
    },
  },
  matrix: {
    'province-increase': () => {
      const h = [3, 6, 12, 24];
      return { id: 'province-increase', rows: PROVINCE_ORDER.map(provinceName), cols: h.map((x) => `${x} months`), values: PROVINCE_ORDER.map((p) => { const inc = svcWeighted(MUNI_SERVICES.filter((m) => m.province === p), (m) => m.tariffIncrease); return h.map((x) => round((Math.pow(1 + inc / 100, x / 12) - 1) * 100, 1)); }), unit: '%', scale: 'days' };
    },
  },
  map: {
    tariff: () => choropleth('tariff', 'Average municipal tariff (R/kL)', 'municipality', 'tariff', 'R/kL', (id) => muniServiceById.get(id)?.avgTariff ?? null, 2),
    increase: () => choropleth('increase', 'Tariff increase (%)', 'municipality', 'days', '%', (id) => muniServiceById.get(id)?.tariffIncrease ?? null, 1),
    recovery: () => choropleth('recovery', 'Cost recovery ratio (%)', 'municipality', 'coverage', '%', (id) => muniServiceById.get(id)?.costRecovery ?? null, 0),
    affordability: () => choropleth('affordability', 'Water bill as % of household income', 'municipality', 'nrw', '%', (id) => { const m = muniServiceById.get(id); return m ? m.affordability * 8 : null; }, 1),
    nrw: services.map!.nrw,
  },
  entities: services.entities,
  entity: services.entity,
  forecast: {
    tariff: (ctx) => {
      const t = svcWeighted(svcIn(ctx), (m) => m.avgTariff);
      // tariffs step up each 1 July: count July boundaries between the as-of month and mi
      const julys = (from: number, to: number) => { let n = 0; for (let mi = Math.min(from, to) + 1; mi <= Math.max(from, to); mi++) if (miMonth(mi) === 6) n++; return n; };
      const g = 1 + SCALE_INC.municipal / 100;
      const hist: [number, number | null][] = Array.from({ length: 24 }, (_, k) => { const mi = ctx.last - 23 + k; return [mi, t / Math.pow(g, julys(mi, ctx.last))]; });
      const fc = Array.from({ length: 24 }, (_, h) => {
        const mi = ctx.last + 1 + h;
        const m = t * Math.pow(g, julys(ctx.last, mi));
        return { mi, median: m, p10: m * (1 - 0.004 * h), p90: m * (1 + 0.007 * h) };
      });
      const f = forecastSeries(hist, fc);
      return seriesSet('tariff-forecast', [{ unit: 'R/kL', label: 'Average municipal tariff' }], [band('band', f.names.band, f.band, { color: '#BBDEFB' }), line('obs', 'Historical', f.observed, { color: '#13233A' }), line('median', f.names.median, f.median, { color: '#E53935', dash: true })], { asOf: miToIso(ctx.last), note: 'Tariffs adjust each 1 July (municipal financial year)' });
    },
    affordability: (ctx) => {
      const a = svcWeighted(svcIn(ctx), (m) => m.affordability);
      const hist: [number, number | null][] = Array.from({ length: 18 }, (_, k) => [ctx.last - 17 + k, a * (1 - (17 - k) * 0.002)]);
      const fc = dampedForecast(`aff-${ctx.scope.key}`, a, { mu: a * 1.06, phi: 0.95, sigma: a * 0.08, horizon: 12, startMi: ctx.last, min: 0 });
      const f = forecastSeries(hist, fc);
      return seriesSet('affordability-forecast', [{ unit: '% of income', label: 'Water bill share', min: 0 }], [band('band', f.names.band, f.band, { color: '#BBDEFB' }), line('obs', 'Historical', f.observed, { color: '#13233A' }), line('median', f.names.median, f.median, { color: '#E53935', dash: true })], { asOf: miToIso(ctx.last) });
    },
    revenue: (ctx) => {
      const r = revenue(svcIn(ctx));
      const months = Array.from({ length: 24 }, (_, k) => ctx.last - 11 + k);
      const per = (mi: number) => (r.municipal / 12) * Math.pow(1.11, (mi - ctx.last) / 12) * (1 + 0.06 * Math.cos(((miMonth(mi) - 0.5) / 12) * 2 * Math.PI));
      return seriesSet('revenue-forecast', [{ unit: 'R bn', label: 'Monthly municipal revenue' }], [bar('d', 'Domestic', months.map((mi) => [miToIso(mi), per(mi) * 0.62]), { color: '#1565C0', stack: 'r' }), bar('i', 'Industrial', months.map((mi) => [miToIso(mi), per(mi) * 0.18]), { color: '#2E9E5B', stack: 'r' }), bar('c', 'Commercial', months.map((mi) => [miToIso(mi), per(mi) * 0.15]), { color: '#F2A900', stack: 'r' }), bar('a', 'Agricultural', months.map((mi) => [miToIso(mi), per(mi) * 0.05]), { color: '#8E44AD', stack: 'r' })], { asOf: miToIso(ctx.last) });
    },
  },
};

// =================================================================== Settlements (spec §20)
const setIn = (ctx: Ctx) => SETTLEMENTS.filter((s) => ctx.scope.includes(s));
const RISKS = ['Very High', 'High', 'Moderate', 'Low'] as const;
const affected = (l: Settlement[], mi = LAST) => l.filter((s) => settlementNow(s.id, mi).risk !== 'Low');

export const settlements: ModuleHandlers = {
  summary: (ctx) => {
    const l = setIn(ctx);
    const a = affected(l);
    const ap = affected(l, ctx.last - 12);
    const pop = a.reduce((s, x) => s + x.population, 0);
    const n = l.map((x) => settlementNow(x.id));
    return [
      kpi('n', 'settlementsAtRisk', a.length, { label: 'Drought-Affected Settlements', sublabel: `of ${l.length.toLocaleString('en-ZA').replace(/,/g, ' ')} monitored`, delta: ((a.length - ap.length) / Math.max(1, ap.length)) * 100, deltaUnit: '%', deltaLabel: 'vs last year' }),
      kpi('pop', 'populationAtRisk', pop / 1e6, { label: 'Population Affected', unit: 'million', decimals: 2 }),
      kpi('vuln', 'damsBelow', l.filter((x) => x.vulnerability >= 0.65).length, { label: 'High-Vulnerability Settlements', sublabel: 'Vulnerability index ≥ 0.65' }),
      kpi('rel', 'reliability', mean(n.map((x) => x.reliability)), { label: 'Water Supply Reliability' }),
      kpi('alt', 'altSupplyCoverage', mean(a.map((x) => settlementNow(x.id).altSupply)), { label: 'Alternative Supply Coverage', sublabel: 'Of affected settlements' }),
      kpi('exp', 'droughtExposure', mean(n.map((x) => x.exposure)), { label: 'Drought Exposure Index', sublabel: '0 = none, 1 = extreme' }),
      kpi('resp', 'programmeProgress', n.filter((x) => x.status === 'Intervention' || x.status === 'In progress').length, { label: 'Active Interventions', sublabel: 'Tankering, boreholes, storage', unit: '' }),
    ];
  },
  timeseries: {
    trend: (ctx) => {
      const l = setIn(ctx);
      const from = ctx.last - 11;
      return seriesSet('settlement-trend', [{ unit: 'settlements', label: 'Number affected', min: 0 }], [line('cur', 'Current year', monthly(from, ctx.last, (mi) => affected(l, mi).length), { color: '#E53935', symbol: true }), line('prev', 'Previous year', monthly(from, ctx.last, (mi) => affected(l, mi - 12).length), { color: '#1565C0', symbol: true })]);
    },
    population: (ctx) => {
      const l = setIn(ctx);
      const from = ctx.last - 11;
      return seriesSet('settlement-pop', [{ unit: 'million', label: 'Population affected', min: 0 }], [bar('cur', 'Current year', monthly(from, ctx.last, (mi) => affected(l, mi).reduce((s, x) => s + x.population, 0) / 1e6), { color: '#E53935' }), bar('prev', 'Previous year', monthly(from, ctx.last, (mi) => affected(l, mi - 12).reduce((s, x) => s + x.population, 0) / 1e6), { color: '#1565C0' })]);
    },
    'exposure-deficit': (ctx) => {
      const l = setIn(ctx).slice(0, 700);
      const pts = (risk: string) => l.filter((x) => settlementNow(x.id).risk === risk).map((x) => [round(clamp(-settlementNow(x.id).spi6 * 25, -40, 80), 1), settlementNow(x.id).exposure] as [number, number]);
      return { id: 'exposure-deficit', xType: 'value', xUnit: 'Rainfall deficit (% of normal, 6 months)', axes: [{ unit: '', label: 'Drought exposure index', min: 0, max: 1 }], series: RISKS.map((r, k) => ({ key: r, name: r, kind: 'scatter' as const, color: ['#B71C1C', '#F28C28', '#F2A900', '#2E9E5B'][k], data: pts(r) })) };
    },
  },
  breakdown: {
    'by-province': (ctx) => categories('settlement-prov', 'settlements', PROVINCE_ORDER, RISKS.map((r, k) => ({ key: r, name: r, stack: 's', color: ['#B71C1C', '#F28C28', '#F2A900', '#8BC34A'][k], values: PROVINCE_ORDER.map((p) => setIn(ctx).filter((x) => x.province === p && settlementNow(x.id).risk === r).length) }))),
    severity: (ctx) => {
      const l = setIn(ctx);
      return categories('severity', 'settlements', ['Very high', 'High', 'Moderate', 'Low / no risk'], [{ key: 'n', name: 'Settlements', values: RISKS.map((r) => l.filter((x) => settlementNow(x.id).risk === r).length) }], { colors: ['#B71C1C', '#F28C28', '#F2A900', '#2E9E5B'], center: { value: l.length.toLocaleString('en-ZA').replace(/,/g, ' '), label: 'Settlements' } });
    },
    'pop-severity': (ctx) => {
      const l = setIn(ctx);
      const v = RISKS.map((r) => l.filter((x) => settlementNow(x.id).risk === r).reduce((s, x) => s + x.population, 0) / 1e6);
      return categories('pop-severity', 'million people', ['Very high', 'High', 'Moderate', 'Low / no risk'], [{ key: 'n', name: 'Population', values: v }], { colors: ['#B71C1C', '#F28C28', '#F2A900', '#2E9E5B'], center: { value: `${round(v.reduce((a, b) => a + b, 0), 2)} M`, label: 'People' } });
    },
    'by-type': (ctx) => {
      const types = ['Rural village', 'Farming community', 'Informal settlement', 'Peri-urban', 'Small town'] as const;
      const a = affected(setIn(ctx));
      return categories('by-type', 'thousand people', [...types], [{ key: 'v', name: 'Population affected', values: types.map((t) => a.filter((x) => x.type === t).reduce((s, x) => s + x.population, 0) / 1000) }], { colors: ['#8E44AD', '#2E9E5B', '#E95F35', '#F2A900', '#1565C0'] });
    },
    supply: (ctx) => {
      const months = Array.from({ length: 12 }, (_, k) => ctx.last - 11 + k);
      const l = setIn(ctx).slice(0, 600);
      const cats = ['No disruption', 'Intermittent', 'Restricted', 'No supply'];
      const cls = (rel: number) => (rel >= 85 ? 0 : rel >= 70 ? 1 : rel >= 50 ? 2 : 3);
      return categories('supply', '%', months.map((mi) => MONTH_NAMES[miMonth(mi)]), cats.map((c, k) => ({ key: c, name: c, stack: 's', color: ['#2E9E5B', '#F6CF3E', '#F28C28', '#C62828'][k], values: months.map((mi) => l.filter((x) => cls(settlementNow(x.id, mi).reliability) === k).length) })));
    },
    'alt-supply': (ctx) => {
      const a = affected(setIn(ctx));
      const r = new Rng(`alt-${ctx.scope.key}`);
      const counts = [0, 0, 0, 0, 0];
      a.forEach(() => counts[r.weighted([0, 1, 2, 3, 4], [0.32, 0.28, 0.18, 0.1, 0.12])]++);
      return categories('alt-supply', 'settlements', ['Water tankers', 'Emergency boreholes', 'Storage tanks (JoJo)', 'Spring protection / rainwater', 'None yet'], [{ key: 'n', name: 'Settlements', values: counts }], { colors: ['#1565C0', '#2E9E5B', '#0FA3B1', '#8BC34A', '#C62828'], center: { value: String(a.length), label: 'Affected' } });
    },
    interventions: (ctx) => {
      const n = setIn(ctx).map((x) => settlementNow(x.id).status);
      const cats = ['Planned', 'In progress', 'Intervention', 'Monitoring'] as const;
      return categories('interventions', 'settlements', ['Planned', 'In progress', 'Active intervention', 'Monitoring only'], [{ key: 'n', name: 'Settlements', values: cats.map((c) => n.filter((x) => x === c).length) }], { colors: ['#94A3B8', '#1565C0', '#E95F35', '#8BC34A'] });
    },
    infrastructure: (ctx) => {
      const a = affected(setIn(ctx));
      const cats = ['Functional', 'Partially functional', 'Non-functional', 'No infrastructure'];
      const v = [0, 0, 0, 0];
      a.forEach((x) => v[x.waterBacklogPct > 45 ? 3 : x.vulnerability > 0.7 ? 2 : x.vulnerability > 0.5 ? 1 : 0]++);
      return categories('infrastructure', 'settlements', cats, [{ key: 'n', name: 'Settlements', values: v }], { colors: ['#2E9E5B', '#F2A900', '#E95F35', '#7B8794'] });
    },
  },
  table: {
    top: (ctx) => {
      const byPop = ctx.q('order') === 'population';
      const rows = affected(setIn(ctx))
        .sort((a, b) => (byPop ? b.population - a.population : settlementNow(b.id).score - settlementNow(a.id).score))
        .slice(0, Number(ctx.q('limit') ?? 10))
        .map((x) => ({ id: x.id, name: x.name, municipality: municipalityById.get(x.municipality)?.name ?? '', province: x.province, population: x.population, risk: settlementNow(x.id).risk, supply: settlementNow(x.id).reliability >= 85 ? 'Normal' : settlementNow(x.id).reliability >= 70 ? 'Intermittent' : settlementNow(x.id).reliability >= 50 ? 'Restricted' : 'Tankering' }));
      return table('top', [col.rank(), col.text('name', 'Settlement'), col.text('municipality', 'Municipality'), col.text('province', 'Prov.'), col.num('population', 'Population'), col.cls('risk', 'Risk', 'risk'), col.text('supply', 'Supply status')], rows, { rowKey: 'id' });
    },
    'forecast-indicators': (ctx) => {
      const l = setIn(ctx);
      const a = affected(l).length;
      const pop = affected(l).reduce((s, x) => s + x.population, 0) / 1e6;
      const sh = outlookShift(ctx.scope.key);
      const f = (v: number, h: number) => v * (1 - sh * 0.12 * Math.min(1, h / 6)) * (1 + h * 0.004);
      return table('set-forecast', [col.text('ind', 'Indicator'), col.num('cur', 'Current', '', 2), col.num('h3', '3 months', '', 2), col.num('h6', '6 months', '', 2), col.num('h12', '12 months', '', 2)], [
        { ind: 'Drought-affected settlements', cur: a, h3: Math.round(f(a, 3)), h6: Math.round(f(a, 6)), h12: Math.round(f(a, 12)) },
        { ind: 'Population affected (million)', cur: round(pop, 2), h3: round(f(pop, 3), 2), h6: round(f(pop, 6), 2), h12: round(f(pop, 12), 2) },
        { ind: 'Settlements needing tankers', cur: Math.round(a * 0.32), h3: Math.round(f(a, 3) * 0.32), h6: Math.round(f(a, 6) * 0.33), h12: Math.round(f(a, 12) * 0.3) },
      ]);
    },
  },
  matrix: {
    'province-horizon': (ctx) => {
      const h = [3, 6, 12, 24];
      return { id: 'province-horizon', rows: PROVINCE_ORDER.map(provinceName), cols: h.map((x) => `${x} months`), values: PROVINCE_ORDER.map((p) => { const l = SETTLEMENTS.filter((x) => x.province === p); const sh = outlookShift(`p:${p}`); const base = affected(l, ctx.last).length / Math.max(1, l.length); return h.map((x) => round(clamp(base * (1 - sh * 0.15 * Math.min(1, x / 6)) * (1 + x * 0.005), 0, 1), 2)); }), unit: 'share', scale: 'index01' };
    },
  },
  map: {
    risk: () => pointsLayer('risk', 'Settlement drought risk', 'risk', '', SETTLEMENTS.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, value: settlementNow(x.id).risk, size: Math.min(1, x.population / 30000), kind: 'settlement', sub: `${x.population.toLocaleString('en-ZA').replace(/,/g, ' ')} people · ${settlementNow(x.id).status}` }))),
    exposure: () => pointsLayer('exposure', 'Drought exposure index', 'index01', '', SETTLEMENTS.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, value: settlementNow(x.id).exposure, size: Math.min(1, x.population / 30000), kind: 'settlement' }))),
    reliability: () => pointsLayer('reliability', 'Supply reliability (%)', 'coverage', '%', SETTLEMENTS.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, value: settlementNow(x.id).reliability, size: Math.min(1, x.population / 30000), kind: 'settlement' }))),
    status: () => pointsLayer('status', 'Response status', 'response', '', SETTLEMENTS.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, value: settlementNow(x.id).status, size: Math.min(1, x.population / 30000), kind: 'settlement' }))),
    'municipal-share': () => choropleth('municipal-share', 'Share of settlements at High / Very High risk', 'municipality', 'index01', '', (id) => { const l = SETTLEMENTS.filter((x) => x.municipality === id); return l.length ? l.filter((x) => ['High', 'Very High'].includes(settlementNow(x.id).risk)).length / l.length : null; }),
  },
  entities: (ctx) => ({ type: 'settlement', total: setIn(ctx).length, items: [...setIn(ctx)].sort((a, b) => settlementNow(b.id).score - settlementNow(a.id).score).map((x) => ({ id: x.id, name: x.name, type: 'settlement', province: x.province, lat: x.lat, lon: x.lon, sub: settlementNow(x.id).risk })) }),
  entity: (_ctx, id) => {
    const x = settlementById.get(id) ?? SETTLEMENTS[0];
    const n = settlementNow(x.id);
    return {
      id: x.id,
      name: x.name,
      title: `${x.name} (${provinceName(x.province)})`,
      type: 'settlement',
      province: x.province,
      lat: x.lat,
      lon: x.lon,
      image: 'settlement',
      status: { scale: 'risk', id: n.risk, label: `${n.risk} risk` },
      fields: [
        { label: 'Settlement type', value: x.type },
        { label: 'Municipality', value: municipalityById.get(x.municipality)?.name ?? '—' },
        { label: 'Province', value: provinceName(x.province) },
        { label: 'Population / households', value: `${x.population.toLocaleString('en-ZA').replace(/,/g, ' ')} / ${x.households.toLocaleString('en-ZA').replace(/,/g, ' ')}` },
        { label: 'Primary water source', value: x.primarySource },
        { label: 'SPI-6 / drought class', value: `${n.spi6.toFixed(2)} (${n.droughtClass})` },
        { label: 'Vegetation condition (VCI)', value: `${Math.round(n.vci)}%` },
        { label: 'Nearest dams (storage)', value: `${n.damPct}% FSC` },
        { label: 'Groundwater (SGI)', value: n.sgi },
        { label: 'Drought exposure index', value: n.exposure },
        { label: 'Vulnerability index', value: x.vulnerability },
        { label: 'Poverty index', value: x.povertyIndex },
        { label: 'Water access backlog', value: `${x.waterBacklogPct}% of households` },
        { label: 'Supply reliability', value: `${n.reliability}%` },
        { label: 'Response status', value: n.status, scale: 'response' },
        { label: 'Tanker days (last 12 months)', value: n.tankerDays },
        { label: 'Data sources', value: 'Stats SA, DWS, SAWS, SANSA, municipalities' },
      ],
    };
  },
  forecast: {
    settlements: (ctx) => {
      const l = setIn(ctx);
      const hist: [number, number | null][] = Array.from({ length: 12 }, (_, k) => [ctx.last - 11 + k, affected(l, ctx.last - 11 + k).length]);
      const x0 = hist[11][1] ?? 0;
      const fc = dampedForecast(`setf-${ctx.scope.key}`, x0, { mu: x0 * 0.85, phi: 0.9, sigma: Math.max(10, x0 * 0.12), horizon: 12, startMi: ctx.last, outlook: -outlookShift(ctx.scope.key) * x0 * 0.06, min: 0 });
      const f = forecastSeries(hist, fc);
      return seriesSet('settlements-forecast', [{ unit: 'settlements', label: 'Affected settlements', min: 0 }], [band('band', f.names.band, f.band, { color: '#FFCDD2' }), line('obs', 'Historical', f.observed, { color: '#13233A', symbol: true }), line('median', f.names.median, f.median, { color: '#E53935', dash: true })], { asOf: miToIso(ctx.last) });
    },
    population: (ctx) => {
      const l = setIn(ctx);
      const hist: [number, number | null][] = Array.from({ length: 12 }, (_, k) => [ctx.last - 11 + k, affected(l, ctx.last - 11 + k).reduce((s, x) => s + x.population, 0) / 1e6]);
      const x0 = hist[11][1] ?? 0;
      const fc = dampedForecast(`setpf-${ctx.scope.key}`, x0, { mu: x0 * 0.85, phi: 0.9, sigma: Math.max(0.05, x0 * 0.12), horizon: 12, startMi: ctx.last, outlook: -outlookShift(ctx.scope.key) * x0 * 0.06, min: 0 });
      const f = forecastSeries(hist, fc);
      return seriesSet('pop-forecast', [{ unit: 'million', label: 'Population affected', min: 0 }], [band('band', f.names.band, f.band, { color: '#BBDEFB' }), line('obs', 'Historical', f.observed, { color: '#13233A', symbol: true }), line('median', f.names.median, f.median, { color: '#1565C0', dash: true })], { asOf: miToIso(ctx.last) });
    },
  },
};

