/** AI & Predictive Analytics (spec §22), Data Integration (§21), Governance (§23) and Roadmap (§24) extensions. */
import { APP } from '@/config/app';
import { Rng } from '@/lib/prng';
import { clamp, mean } from '@/lib/stats';
import { formatDate } from '@/lib/format';
import { DAY_MS, miToIso } from '@/lib/time';
import { PROVINCES, provinceName } from '../../reference/regions';
import {
  FEEDS,
  PROVIDERS,
  SUB_PHASES,
  platformSummary,
  programmeMonth,
  subPhaseProgress,
} from '../../generators/platform';
import { regionSpi, tOf } from '../../generators/hydromet';
import { dampedForecast } from '../../generators/forecast';
import { resolveScope } from '../../generators/scope';
import { band, bar, categories, col, kpi, line, seriesSet, table, type ModuleHandlers } from '../build';
import { choropleth, pointsLayer } from '../common';
import { drought, erf, outlookShift } from './drought';
import { dams } from './dams';
import { runoff } from './surface';
import { groundwater } from './groundwater';
import { governance as govBase, roadmap as roadBase } from './platform';
import { services } from './resources';
import { waterQuality } from './quality';

// =================================================================== AI
export const AI_MODELS = [
  {
    id: 'drought',
    name: 'Drought forecast',
    model: 'LSTM + Transformer ensemble',
    inputs: 'SPI, SPEI, NDVI, soil moisture, SST',
    output: '1–6 month drought class',
    rmse: 0.38,
    nse: 0.81,
    mae: 0.29,
    r2: 0.83,
    unit: 'SPI',
  },
  {
    id: 'streamflow',
    name: 'Streamflow forecast',
    model: 'CNN-LSTM (spatio-temporal)',
    inputs: 'Rainfall, soil moisture, land use',
    output: '7–90 day river flow',
    rmse: 18.4,
    nse: 0.78,
    mae: 11.2,
    r2: 0.8,
    unit: 'm³/s',
  },
  {
    id: 'reservoir',
    name: 'Reservoir forecast',
    model: 'Random Forest + LSTM',
    inputs: 'Inflow, demand, evaporation, rain',
    output: '30–180 day dam level',
    rmse: 4.1,
    nse: 0.88,
    mae: 3.0,
    r2: 0.9,
    unit: '% FSC',
  },
  {
    id: 'quality',
    name: 'Water quality',
    model: 'Gradient Boosting + LSTM',
    inputs: 'Flow, rainfall, upstream activity',
    output: 'WQ exceedance probability',
    rmse: 6.8,
    nse: 0.71,
    mae: 5.1,
    r2: 0.74,
    unit: 'WQI',
  },
  {
    id: 'vegetation',
    name: 'Vegetation forecast',
    model: 'CNN (spatial) + LSTM (temporal)',
    inputs: 'SPI, NDVI, LST, soil moisture',
    output: '30-day vegetation health map',
    rmse: 0.045,
    nse: 0.76,
    mae: 0.034,
    r2: 0.78,
    unit: 'NDVI',
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure failure',
    model: 'Isolation Forest + LSTM',
    inputs: 'Pressure, flow, pipe age, soil',
    output: 'Pipe break prediction score',
    rmse: 0.12,
    nse: 0.66,
    mae: 0.09,
    r2: 0.69,
    unit: 'score',
  },
  {
    id: 'demand',
    name: 'Demand forecast',
    model: 'XGBoost + regression',
    inputs: 'Population, temperature, tariffs',
    output: 'Monthly demand by WSA',
    rmse: 21.5,
    nse: 0.86,
    mae: 14.8,
    r2: 0.88,
    unit: 'Ml/day',
  },
  {
    id: 'groundwater',
    name: 'Groundwater level',
    model: 'LSTM autoregressive',
    inputs: 'Rainfall, ET, abstraction, recharge',
    output: '6–12 month GW level',
    rmse: 1.9,
    nse: 0.74,
    mae: 1.4,
    r2: 0.77,
    unit: 'm',
  },
  {
    id: 'flood',
    name: 'Flood early warning',
    model: 'Hydrological model + gradient boosting',
    inputs: 'Rainfall forecast, streamflow, DEM, soil moisture',
    output: '1–7 day flood exceedance',
    rmse: 0.21,
    nse: 0.7,
    mae: 0.15,
    r2: 0.72,
    unit: 'probability',
  },
];

const status = (nse: number) => (nse >= 0.8 ? 'Excellent' : nse >= 0.7 ? 'Good' : nse >= 0.6 ? 'Moderate' : 'Poor');

const SCEN = {
  baseline: { label: 'Baseline (current trends)', rain: 0, temp: 0 },
  rcp26: { label: 'Low emissions (RCP 2.6)', rain: 0.04, temp: -0.3 },
  rcp85: { label: 'High emissions (RCP 8.5)', rain: -0.12, temp: 0.8 },
} as const;
type ScenId = keyof typeof SCEN;

export const ai: ModuleHandlers = {
  summary: (ctx) => {
    const spi = regionSpi(ctx.scope, 3)[tOf(ctx.last)] ?? 0;
    const fc = dampedForecast(`spi-${ctx.scope.key}`, spi, {
      mu: 0,
      phi: 0.82,
      sigma: 0.95,
      horizon: 6,
      startMi: ctx.last,
      outlook: outlookShift(ctx.scope.key),
    });
    const pDrought = 0.5 * (1 + erf((-0.8 - fc[5].median) / (((fc[5].p90 - fc[5].p10) / 2.5632) * Math.SQRT2)));
    return [
      kpi('models', 'modelSkill', AI_MODELS.length, {
        label: 'Operational AI Models',
        sublabel: 'Spec §22.1 domains',
        unit: '',
        decimals: 0,
      }),
      kpi('nse', 'modelSkill', mean(AI_MODELS.map((m) => m.nse)), {
        label: 'Mean Model Skill (NSE)',
        sublabel: 'Hold-out validation 2019–2024',
      }),
      kpi('drought', 'areaInDrought', pDrought * 100, {
        label: 'Drought Probability (6 months)',
        sublabel: 'P(SPI-3 ≤ −0.8)',
        unit: '%',
        decimals: 0,
      }),
      kpi('reservoir', 'storagePct', null, {
        label: 'Reservoir Outlook (12 months)',
        text: fc[5].median < -0.5 ? 'Declining' : 'Stable',
        status: { scale: 'trendClass', id: fc[5].median < -0.5 ? 'Declining' : 'Stable', label: 'National storage' },
      }),
      kpi('alerts', 'damAlerts', 14, { label: 'AI Early Warnings (Active)', sublabel: 'Across all modules' }),
      kpi('runs', 'recordsIngested', 1248, {
        label: 'Forecast Runs (30 days)',
        unit: '',
        sublabel: 'Automated + on-demand',
      }),
    ];
  },
  table: {
    models: () =>
      table(
        'models',
        [
          col.text('name', 'Model'),
          col.text('model', 'Algorithm'),
          col.text('output', 'Output'),
          col.num('rmse', 'RMSE', '', 2),
          col.num('nse', 'NSE', '', 2),
          col.num('mae', 'MAE', '', 2),
          col.num('r2', 'R²', '', 2),
          col.cls('status', 'Status', 'wq'),
        ],
        AI_MODELS.map((m) => ({
          ...m,
          status:
            status(m.nse) === 'Excellent' || status(m.nse) === 'Good'
              ? 'Good'
              : status(m.nse) === 'Moderate'
                ? 'Moderate'
                : 'Poor',
        })),
      ),
    'early-warning': (ctx) => {
      const r = new Rng(`aiew-${ctx.scope.key}-${ctx.last}`);
      const rows = [
        {
          module: 'Drought',
          area: 'Northern Cape interior',
          signal: 'SPI-3 forecast ≤ −1.3 (D2)',
          lead: '3 months',
          prob: 72,
        },
        {
          module: 'Reservoir',
          area: 'Theewaterskloof / Western Cape system',
          signal: 'Storage < 30% FSC',
          lead: '6 months',
          prob: 41,
        },
        { module: 'Streamflow', area: 'Upper Vaal', signal: 'Flow < Q90', lead: '2 months', prob: 58 },
        {
          module: 'Water quality',
          area: 'Olifants (Mpumalanga)',
          signal: 'Sulphate / pH exceedance',
          lead: '1 month',
          prob: 64,
        },
        { module: 'Groundwater', area: 'Kalahari (Northern Cape)', signal: 'SGI ≤ −1.5', lead: '6 months', prob: 55 },
        {
          module: 'Infrastructure',
          area: 'Emfuleni (Gauteng)',
          signal: 'Pipe-burst cluster risk',
          lead: '30 days',
          prob: 47,
        },
        { module: 'Flood', area: 'eThekwini coastal catchments', signal: 'Q10 exceedance', lead: '5 days', prob: 23 },
        { module: 'Demand', area: 'City of Tshwane', signal: 'Peak demand > 95% capacity', lead: '2 months', prob: 39 },
      ].map((x) => ({
        ...x,
        prob: clamp(x.prob + r.int(-6, 6), 5, 95),
        sev: x.prob >= 60 ? 'High' : x.prob >= 40 ? 'Moderate' : 'Low',
      }));
      return table(
        'ai-ew',
        [
          col.text('module', 'Domain'),
          col.text('area', 'Area'),
          col.text('signal', 'Signal'),
          col.text('lead', 'Lead time'),
          col.bar('prob', 'Probability', '%'),
          col.cls('sev', 'Risk', 'risk'),
        ],
        rows,
      );
    },
  },
  breakdown: {
    importance: () =>
      categories(
        'importance',
        '%',
        [
          'Antecedent rainfall (SPI-6)',
          'Soil moisture',
          'SST / ENSO (Niño 3.4)',
          'NDVI anomaly',
          'Reservoir storage',
          'Temperature / PET',
          'Groundwater (SGI)',
        ],
        [{ key: 'v', name: 'Relative importance (drought model)', values: [27, 19, 15, 12, 11, 10, 6] }],
        { colors: ['#1565C0', '#0FA3B1', '#8E44AD', '#2E9E5B', '#F2A900', '#E95F35', '#6D4C41'] },
      ),
  },
  forecast: {
    drought: drought.forecast!.spi,
    reservoir: dams.forecast!.storage,
    streamflow: runoff.forecast!.flow,
    groundwater: groundwater.forecast!.level,
    demand: services.forecast!.demand,
    quality: waterQuality.forecast!.wqi,
    scenario: (ctx) => {
      const scen = (ctx.q('scenario') ?? 'all') as ScenId | 'all';
      const horizon = Number(ctx.q('horizon') ?? 24);
      const target = ctx.q('target') ?? 'reservoir';
      const base =
        target === 'drought'
          ? drought.forecast!.spi(ctx)
          : target === 'groundwater'
            ? groundwater.forecast!.level(ctx)
            : dams.forecast!.storage(ctx);
      const obs = base.series.find((s) => s.key === 'obs')!;
      const last = obs.data[obs.data.length - 1];
      const x0 = Number(last[1] ?? 0);
      const L = ctx.last;
      const unit = base.axes[0];
      const ids: ScenId[] = scen === 'all' ? ['baseline', 'rcp26', 'rcp85'] : [scen];
      const colors: Record<ScenId, string> = { baseline: '#1565C0', rcp26: '#2E9E5B', rcp85: '#E53935' };
      const series = ids.flatMap((id) => {
        const s = SCEN[id];
        const scale = target === 'drought' ? 1.6 : target === 'groundwater' ? -6 : 55;
        const mu = (target === 'drought' ? 0 : x0) + (s.rain - s.temp * 0.05) * scale;
        const fc = dampedForecast(`scen-${target}-${id}-${ctx.scope.key}`, x0, {
          mu,
          phi: 0.93,
          sigma: Math.abs(scale) * 0.12,
          horizon,
          startMi: L,
          min: target === 'reservoir' ? 0 : undefined,
          max: target === 'reservoir' ? 100 : undefined,
        });
        return [
          band(
            `${id}-b`,
            `${s.label} (10th–90th)`,
            fc.map((p) => [miToIso(p.mi), p.p10, p.p90]),
            { color: colors[id] },
          ),
          line(
            `${id}-m`,
            s.label,
            [[miToIso(L), x0], ...fc.map((p) => [miToIso(p.mi), p.median] as [string, number])],
            { color: colors[id], dash: id !== 'baseline' },
          ),
        ];
      });
      return seriesSet(
        'scenario',
        [unit],
        [
          line(
            'obs',
            'Historical',
            obs.data.map((p) => [p[0] as string, p[1] as number | null]),
            { color: '#13233A' },
          ),
          ...series,
        ],
        { asOf: miToIso(L), note: `${ctx.scope.name} · ${target}` },
      );
    },
  },
};

// =================================================================== Data integration
const TYPES = ['DWS stations', 'Satellite data', 'Municipal data', 'Research data', 'Other sources'];
export const dataIntegration: ModuleHandlers = {
  summary: () => {
    const s = platformSummary();
    return [
      kpi('sources', 'recordsIngested', PROVIDERS.length, {
        label: 'Data Providers',
        unit: '',
        sublabel: 'Primary custodians (spec §21.1)',
      }),
      kpi('feeds', 'recordsIngested', s.active, {
        label: 'Active Data Feeds',
        unit: '',
        sublabel: `of ${s.feeds} (${Math.round((s.active / s.feeds) * 100)}% operational)`,
      }),
      kpi('records', 'recordsIngested', (s.records * 365) / 1e9, {
        label: 'Records (12 Months)',
        unit: 'billion',
        decimals: 2,
        delta: 18,
        deltaUnit: '%',
        deltaLabel: 'vs previous year',
      }),
      kpi('domains', 'recordsIngested', 13, {
        label: 'Data Domains',
        unit: '',
        sublabel: 'Spec §1 summary of domains',
      }),
      kpi('latency', 'feedLatency', s.latency, {
        label: 'Average Data Latency',
        delta: -40,
        deltaUnit: '%',
        deltaLabel: 'vs last year',
      }),
      kpi('quality', 'dataQuality', s.quality, {
        label: 'Data Quality Score',
        delta: 5,
        deltaUnit: ' pp',
        deltaLabel: 'vs last year',
      }),
    ];
  },
  breakdown: {
    'source-status': () => {
      const st = ['Online', 'Delayed', 'Degraded', 'Offline'];
      return categories(
        'source-status',
        'feeds',
        ['Operational', 'Delayed', 'Degraded', 'Offline'],
        [{ key: 'n', name: 'Feeds', values: st.map((x) => FEEDS.filter((f) => f.status === x).length) }],
        {
          colors: ['#2E9E5B', '#F2A900', '#E95F35', '#7B8794'],
          center: { value: String(FEEDS.length), label: 'Feeds' },
        },
      );
    },
    'by-type': () => {
      const v = [0, 0, 0, 0, 0];
      FEEDS.forEach((f) => {
        const k =
          f.provider.startsWith('dws') || f.provider === 'saws'
            ? 0
            : f.provider === 'sansa' || f.provider === 'global'
              ? 1
              : f.provider === 'wsa' || f.provider === 'wb'
                ? 2
                : f.provider === 'labs' || f.provider === 'sanbi'
                  ? 3
                  : 4;
        v[k] += (f.recordsPerDay * 365) / 1e6;
      });
      return categories('by-type', 'M records/yr', TYPES, [{ key: 'v', name: 'Records', values: v }], {
        colors: ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD', '#94A3B8'],
      });
    },
  },
  timeseries: {
    ingestion: (ctx) => {
      const r = new Rng('ingestion');
      const months = Array.from({ length: 12 }, (_, k) => ctx.last - 11 + k);
      const grow = (k: number) => 1 + k * 0.07;
      const base = [110, 45, 28, 18, 10];
      return seriesSet(
        'ingestion',
        [{ unit: 'M records', label: 'Records ingested' }],
        TYPES.map((t, i) =>
          bar(
            t,
            t,
            months.map((mi, k) => [miToIso(mi), base[i] * grow(k) * r.range(0.9, 1.1)]),
            { stack: 's', color: ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD', '#94A3B8'][i] },
          ),
        ),
      );
    },
  },
  table: {
    pipelines: () => {
      const pipes = [
        ['Hydro-met (real-time)', 'DWS / SAWS', ['saws', 'dws-hyd']],
        ['Satellite ingestion', 'SANSA / CHIRPS / GRACE-FO', ['sansa', 'global']],
        ['Groundwater (NGA)', 'DWS NGA', ['dws-nga']],
        ['Municipal reports (WSNIS)', 'All municipalities', ['wsa']],
        ['Water quality (NWQMS)', 'DWS / accredited labs', ['labs']],
        ['Bulk water & transfers', 'Water boards / TCTA', ['wb']],
        ['Socio-economic data', 'Stats SA', ['statssa']],
        ['Ecological data', 'SANBI', ['sanbi']],
        ['Model forecast outputs', 'NIWIS Analytics', []],
      ] as [string, string, string[]][];
      return table(
        'pipelines',
        [
          col.text('p', 'Pipeline'),
          col.text('s', 'Source'),
          col.num('r', 'Records (24 h)', 'M', 2),
          col.text('t', 'Last updated'),
          col.cls('st', 'Status', 'feed'),
        ],
        pipes.map(([p, s, ids], k) => {
          const f = FEEDS.filter((x) => ids.includes(x.provider));
          const bad = f.filter((x) => x.status !== 'Online').length / Math.max(1, f.length);
          const lat = f.length ? Math.min(...f.map((x) => x.latencyMin)) : 240;
          return {
            p,
            s,
            r: f.length ? f.reduce((a, x) => a + x.recordsPerDay, 0) / 1e6 : 0.2,
            t: formatDate(new Date(APP.asOf.getTime() - lat * 60_000 - k * 600_000), 'datetime'),
            st: bad > 0.15 ? 'Degraded' : bad > 0.05 ? 'Delayed' : 'Online',
          };
        }),
      );
    },
    providers: govBase.table!.providers,
    quality: govBase.table!.quality,
  },
  map: {
    coverage: () => {
      const r = new Rng('coverage-pts');
      const pts = PROVIDERS.flatMap((p) =>
        Array.from({ length: Math.min(60, p.feeds) }, (_, k) => {
          const prov = PROVINCES[r.int(0, PROVINCES.length - 1)];
          return {
            id: `${p.id}-${k}`,
            name: `${p.short} feed ${k + 1}`,
            lat: prov.lat + r.range(-1.6, 1.6),
            lon: prov.lon + r.range(-1.6, 1.6),
            value: FEEDS.find((f) => f.id === `${p.id}-${String(k + 1).padStart(3, '0')}`)?.status ?? 'Online',
            size: 0.15,
            kind: p.type,
            sub: p.name,
          };
        }),
      );
      return pointsLayer(
        'coverage',
        'Data feeds by status',
        'feed',
        '',
        pts.filter((x) => x.lat < -22 && x.lat > -34.8 && x.lon > 16.5 && x.lon < 32.8),
      );
    },
  },
};

// =================================================================== Governance
export const governance: ModuleHandlers = {
  ...govBase,
  summary: () => {
    const s = platformSummary();
    return [
      kpi('datasets', 'recordsIngested', 512, {
        label: 'Total Datasets',
        unit: '',
        delta: 5,
        deltaUnit: '%',
        deltaLabel: 'vs last year',
      }),
      kpi('providers', 'recordsIngested', PROVIDERS.length, { label: 'Data Providers', unit: '' }),
      kpi('feeds', 'recordsIngested', s.active, {
        label: 'Active Data Feeds',
        unit: '',
        sublabel: `${Math.round((s.active / s.feeds) * 100)}% operational`,
      }),
      kpi('meta', 'dataQuality', s.metadata, { label: 'Datasets with Metadata', sublabel: 'ISO 19115 records' }),
      kpi('quality', 'dataQuality', s.quality, { label: 'Data Quality Score (Overall)' }),
      kpi('standards', 'dataQuality', 95, { label: 'Standards Compliance' }),
      kpi('access', 'recordsIngested', 1284, {
        label: 'Access Requests (This Year)',
        unit: '',
        delta: 12,
        deltaUnit: '%',
        deltaLabel: 'vs last year',
        goodDirection: 'neutral',
      }),
      kpi('incidents', 'damAlerts', 4, {
        label: 'Data Incidents',
        sublabel: 'POPIA / security, this year',
        delta: -50,
        deltaUnit: '%',
        deltaLabel: 'vs last year',
      }),
    ];
  },
  breakdown: {
    standards: () => {
      const st = [
        'WaterML 2.0 (hydrology)',
        'NetCDF / BUFR (climate)',
        'OGC WMS / WFS / WCS',
        'NWQMS XML (water quality)',
        'ISO 19115 (metadata)',
        'REST / JSON (APIs)',
        'GeoJSON / GeoTIFF (spatial)',
      ];
      const v = [96, 94, 97, 92, 95, 98, 96];
      return categories('standards', '%', st, [{ key: 'v', name: 'Compliance', values: v }], {
        colors: v.map((x) => (x >= 95 ? '#2E9E5B' : x >= 90 ? '#8BC34A' : '#F2A900')),
      });
    },
    inventory: () =>
      categories(
        'inventory',
        'datasets',
        [
          'Climate',
          'Surface water',
          'Groundwater',
          'Water quality',
          'Infrastructure',
          'Socio-economic',
          'Ecosystems',
          'Operational',
          'Other',
        ],
        [{ key: 'v', name: 'Datasets', values: [142, 128, 96, 76, 68, 54, 38, 46, 22] }],
        { colors: ['#1565C0', '#2E9E5B', '#0FA3B1', '#F2A900', '#E95F35', '#8E44AD', '#6D4C41', '#94A3B8', '#B0BEC5'] },
      ),
    frequency: () =>
      categories(
        'frequency',
        'datasets',
        ['Real-time', '15-minute', 'Hourly', 'Daily', 'Weekly', 'Monthly', 'Other'],
        [{ key: 'v', name: 'Datasets', values: [164, 92, 61, 113, 41, 31, 10] }],
        {
          colors: ['#1565C0', '#2E9E5B', '#F2A900', '#8E44AD', '#E95F35', '#0FA3B1', '#94A3B8'],
          center: { value: '512', label: 'Datasets' },
        },
      ),
    metadata: () => {
      const m = platformSummary().metadata;
      return categories(
        'metadata',
        '%',
        ['Complete', 'Partial', 'Missing'],
        [{ key: 'v', name: 'Datasets', values: [m, 100 - m - 1, 1] }],
        { colors: ['#2E9E5B', '#F2A900', '#C62828'], center: { value: `${m}%`, label: 'Complete' } },
      );
    },
    access: () =>
      categories(
        'access',
        'requests',
        ['Approved', 'Pending', 'Rejected', 'Expired'],
        [{ key: 'v', name: 'Requests', values: [1002, 154, 77, 51] }],
        { colors: ['#2E9E5B', '#1565C0', '#E95F35', '#F2A900'], center: { value: '1 284', label: 'Requests' } },
      ),
  },
  table: {
    ...govBase.table,
    issues: () => {
      const r = new Rng('qissues');
      const items = [
        ['River flow gauges', 'DWS', 'Missing data (> 3 days)', 'High', 'Open'],
        ['Rainfall (automatic)', 'SAWS', 'Outlier values (spike test)', 'Medium', 'Investigating'],
        ['Water quality labs', 'NWQMS', 'Invalid unit / format', 'High', 'Resolved'],
        ['Dam storage', 'DWS', 'Delayed update', 'Medium', 'Monitoring'],
        ['Municipal production', 'WSNIS', 'Inconsistent totals', 'High', 'Open'],
        ['Groundwater levels', 'DWS NGA', 'Gap in time series', 'Medium', 'Resolved'],
        ['Satellite NDVI', 'SANSA', 'Cloud contamination', 'Low', 'Resolved'],
        ['Census data', 'Stats SA', 'Schema mismatch', 'Medium', 'Resolved'],
      ];
      const day = Math.floor(APP.asOf.getTime() / DAY_MS);
      return table(
        'issues',
        [
          col.date('d', 'Date'),
          col.text('ds', 'Dataset'),
          col.text('p', 'Provider'),
          col.text('t', 'Issue type'),
          col.cls('sev', 'Severity', 'risk'),
          col.text('st', 'Status'),
        ],
        items.map(([ds, p, t, sev, st], k) => ({
          d: new Date((day - k - r.int(0, 1)) * DAY_MS).toISOString().slice(0, 10),
          ds,
          p,
          t,
          sev: sev === 'Medium' ? 'Moderate' : sev,
          st,
        })),
      );
    },
    usage: () =>
      table(
        'usage',
        [
          col.rank(),
          col.text('u', 'User / organisation'),
          col.text('c', 'Dataset category'),
          col.num('n', 'Requests'),
          col.text('s', 'Status'),
        ],
        [
          { u: 'DWS (national)', c: 'Hydrology', n: 328, s: 'Approved' },
          { u: 'Municipalities', c: 'Water supply', n: 214, s: 'Approved' },
          { u: 'Research institutions', c: 'Climate & EO', n: 186, s: 'Approved' },
          { u: 'Water boards', c: 'Bulk supply', n: 142, s: 'Approved' },
          { u: 'Universities', c: 'Water quality', n: 138, s: 'Approved' },
        ],
      ),
    retention: () =>
      table(
        'retention',
        [col.text('d', 'Data class'), col.text('p', 'Retention (spec §23.3)')],
        [
          { d: 'Real-time data (15-min to daily)', p: '2 years in operational database' },
          { d: 'Historical archive', p: 'Indefinitely (National Data Archive)' },
          { d: 'Satellite imagery', p: 'SANSA archive, 30-year reanalysis' },
          { d: 'Model outputs', p: '5 years (validation)' },
          { d: 'Audit logs', p: '7 years' },
        ],
      ),
  },
  map: {
    providers: () =>
      pointsLayer(
        'providers',
        'Data providers',
        'feed',
        '',
        PROVIDERS.map((p) => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          value:
            FEEDS.filter((f) => f.provider === p.id && f.status !== 'Online').length / Math.max(1, p.feeds) > 0.1
              ? 'Delayed'
              : 'Online',
          size: Math.min(1, p.feeds / 140),
          kind: p.type,
          sub: `${p.feeds} feeds · ${p.protocol}`,
        })),
      ),
  },
};

// =================================================================== Roadmap
export const roadmap: ModuleHandlers = {
  ...roadBase,
  breakdown: {
    ...roadBase.breakdown,
    workstreams: () => {
      const ws = [
        'Data integration',
        'Infrastructure & cloud',
        'Analytics & AI',
        'Dashboards & UX',
        'Governance & standards',
        'Capacity building',
      ];
      const m = programmeMonth();
      const r = new Rng('ws');
      const planned = ws.map(() => clamp((m / 36) * 100, 0, 100));
      return categories('workstreams', '%', ws, [
        { key: 'p', name: 'Planned', values: planned, color: '#94A3B8' },
        {
          key: 'a',
          name: 'Actual',
          values: planned.map((p) => clamp(p * r.range(0.82, 1.05), 0, 100)),
          color: '#1565C0',
        },
      ]);
    },
    milestones: () => {
      const c = { Completed: 0, 'On Track': 0, 'At Risk': 0, Delayed: 0, 'Not Started': 0 } as Record<string, number>;
      SUB_PHASES.forEach((s) => s.deliverables.forEach(() => c[subPhaseProgress(s).status]++));
      return categories(
        'milestones',
        'milestones',
        Object.keys(c),
        [{ key: 'n', name: 'Milestones', values: Object.values(c) }],
        {
          colors: ['#2E9E5B', '#1565C0', '#F2A900', '#E95F35', '#94A3B8'],
          center: { value: String(Object.values(c).reduce((a, b) => a + b, 0)), label: 'Milestones' },
        },
      );
    },
  },
  table: {
    ...roadBase.table,
    upcoming: () => {
      const m = programmeMonth();
      const start = new Date(Date.UTC(2024, 8, 1));
      const rows = SUB_PHASES.flatMap((s) =>
        s.deliverables.map((d, k) => ({
          due: s.from + Math.round(((k + 1) / s.deliverables.length) * (s.to - s.from)),
          d,
          phase: s.id,
        })),
      )
        .filter((x) => x.due >= m)
        .slice(0, 8);
      return table(
        'upcoming',
        [
          col.date('date', 'Due'),
          col.text('d', 'Milestone'),
          col.text('phase', 'Sub-phase'),
          col.cls('st', 'Status', 'progress'),
        ],
        rows.map((x) => ({
          date: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + x.due - 1, 28))
            .toISOString()
            .slice(0, 10),
          d: x.d,
          phase: x.phase,
          st: x.due - m <= 1 ? 'At Risk' : 'On Track',
        })),
      );
    },
    risks: () =>
      table(
        'risks',
        [
          col.text('r', 'Risk'),
          col.cls('i', 'Impact', 'risk'),
          col.cls('l', 'Likelihood', 'risk'),
          col.text('m', 'Mitigation'),
        ],
        [
          {
            r: 'Delays in data-sharing MOUs (municipalities)',
            i: 'High',
            l: 'High',
            m: 'DWS Legal escalation; CoGTA support; phased onboarding',
          },
          {
            r: 'Municipal data quality and completeness',
            i: 'High',
            l: 'High',
            m: 'Data Quality Improvement Programme; automated QC',
          },
          {
            r: 'Telemetry outages / load shedding',
            i: 'Moderate',
            l: 'High',
            m: 'Solar + battery backup at stations; store-and-forward loggers',
          },
          {
            r: 'Scarce AI/ML and GIS skills',
            i: 'Moderate',
            l: 'Moderate',
            m: 'AI Centre of Excellence (TUT FICT / CSIR); bursaries',
          },
          {
            r: 'Cloud cost overrun (10 PB target)',
            i: 'Moderate',
            l: 'Moderate',
            m: 'Tiered storage; FinOps reviews each quarter',
          },
          {
            r: 'POPIA / cyber-security incident',
            i: 'High',
            l: 'Low',
            m: 'Zero-trust access, encryption, audit logging (7 years)',
          },
        ],
      ),
    outcomes: () =>
      table(
        'outcomes',
        [col.text('o', 'Expected outcome'), col.text('t', 'Target')],
        [
          { o: 'Real-time national drought and dam status', t: 'Daily, all 320 large dams' },
          { o: 'Integrated monitoring spine', t: '3 500+ flow gauges, 2 000 telemetered boreholes' },
          { o: 'AI forecasts for 8 domains', t: 'NSE ≥ 0.7 on validation' },
          { o: 'Open data API for researchers', t: 'Phase 3 (M25–M36)' },
          { o: 'WCAG 2.1 AA, POPIA-compliant portal', t: 'From launch' },
        ],
      ),
  },
  map: {
    status: () =>
      choropleth(
        'status',
        'Implementation status by province (% of feeds live)',
        'province',
        'coverage',
        '%',
        (id) => {
          const r = new Rng(`impl-${id}`);
          return clamp(
            (programmeMonth() / 36) * 100 * r.range(0.75, 1.15) + (id === 'GP' || id === 'WC' ? 10 : 0),
            5,
            100,
          );
        },
        0,
      ),
  },
};

// =================================================================== Drought additions (forecast tab)
drought.timeseries!['recovery-province'] = (ctx) => {
  const months = Array.from({ length: 12 }, (_, k) => ctx.last + 1 + k);
  const provs = ['WC', 'EC', 'NC', 'FS', 'KZN', 'NW'];
  return seriesSet(
    'recovery-province',
    [{ unit: '%', label: 'Recovery probability', min: 0, max: 100 }],
    provs.map((p, i) => {
      const sc = resolveScope({ province: p });
      const spi = regionSpi(sc, 3)[tOf(ctx.last)] ?? 0;
      const fc = dampedForecast(`rec-${sc.key}`, spi, {
        mu: 0,
        phi: 0.8,
        sigma: 0.95,
        horizon: 12,
        startMi: ctx.last,
        outlook: outlookShift(sc.key),
      });
      return line(
        p,
        provinceName(p),
        months.map((mi, h) => [
          miToIso(mi),
          100 * (1 - 0.5 * (1 + erf((-0.5 - fc[h].median) / (((fc[h].p90 - fc[h].p10) / 2.5632) * Math.SQRT2)))),
        ]),
        { color: ['#1565C0', '#2E9E5B', '#E95F35', '#F2A900', '#8E44AD', '#0FA3B1'][i], symbol: true },
      );
    }),
  );
};
drought.table!['forecast-kpis'] = (ctx) => drought.table!['forecast-indicators'](ctx);
