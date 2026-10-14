/**
 * Every backend request the live pages make (incl. tab variants), for `npm run contract:check` and
 * `npm run fixtures:record`. Keep in sync with the pages: a panel added to a live page belongs here.
 *
 * `scoped: false` = the request ignores the location filters (maps, entity cards), so fixtures record it once.
 */
export type ManifestKind =
  | 'summary'
  | 'timeseries'
  | 'forecast'
  | 'breakdown'
  | 'table'
  | 'matrix'
  | 'map'
  | 'entities'
  | 'entity'
  | 'reference'
  | 'meta'
  | 'health';

export interface ManifestEntry {
  page: string;
  kind: ManifestKind;
  module?: string;
  /** metric / layer / entity id / reference type / meta name */
  key?: string;
  params?: Record<string, string | number>;
  scoped?: boolean;
}

type P = Record<string, string | number>;
const ts = (page: string, module: string, key: string, params?: P): ManifestEntry => ({
  page,
  kind: 'timeseries',
  module,
  key,
  params,
});
const fc = (page: string, module: string, key: string, params?: P): ManifestEntry => ({
  page,
  kind: 'forecast',
  module,
  key,
  params,
});
const bd = (page: string, module: string, key: string, params?: P): ManifestEntry => ({
  page,
  kind: 'breakdown',
  module,
  key,
  params,
});
const tb = (page: string, module: string, key: string, params?: P): ManifestEntry => ({
  page,
  kind: 'table',
  module,
  key,
  params,
});
const mx = (page: string, module: string, key: string, params?: P): ManifestEntry => ({
  page,
  kind: 'matrix',
  module,
  key,
  params,
});
const mp = (page: string, module: string, key: string, params?: P): ManifestEntry => ({
  page,
  kind: 'map',
  module,
  key,
  params,
  scoped: false,
});
const sum = (page: string, module: string): ManifestEntry => ({ page, kind: 'summary', module });
const ents = (page: string, module: string): ManifestEntry => ({
  page,
  kind: 'entities',
  module,
  params: { limit: 500 },
});
const ent = (page: string, module: string, id: string): ManifestEntry => ({
  page,
  kind: 'entity',
  module,
  key: id,
  scoped: false,
});
const many = (f: (k: string) => ManifestEntry, keys: (string | number)[]) => keys.map((k) => f(String(k)));
const PROVINCE_TAB_IDS = ['', 'WC', 'EC', 'NC', 'FS', 'GP', 'KZN'];

/** District used for entity-specific requests (the first entity in the backend's alphabetical list). */
export const SAMPLE_DISTRICT = 'DC44';

const R = '/rainfall';
const RF = '/rainfall/forecast';
const D = '/drought';
const DF = '/drought/forecast';
const C = '/climate';
const CF = '/climate/forecast';
const V = '/vegetation';
const VF = '/vegetation/forecast';
const RO = '/runoff';
const ROF = '/runoff/forecast';

export const LIVE_REQUESTS: ManifestEntry[] = [
  // ---------------------------------------------------------------- rainfall
  sum(R, 'rainfall'),
  ents(R, 'rainfall'),
  ent(R, 'rainfall', SAMPLE_DISTRICT),
  ...many(
    (k) => mp(R, 'rainfall', k),
    ['total', 'anomaly', 'monthly', 'map', 'spi1', 'spi3', 'spi6', 'spi12', 'spei6', 'r20', 'cdd', 'municipal-total'],
  ),
  ...many((k) => mp(R, 'rainfall', k), ['forecast-1', 'forecast-2', 'forecast-3']),
  ts(R, 'rainfall', 'monthly'),
  ...many((k) => ts(R, 'rainfall', 'anomaly', { window: k }), [1, 3, 6, 12]),
  ts(R, 'rainfall', 'spi-spei'),
  ts(R, 'rainfall', 'intensity'),
  ts(R, 'rainfall', 'dry-wet'),
  ts(R, 'rainfall', 'station', { entityId: SAMPLE_DISTRICT }),
  tb(R, 'rainfall', 'provinces'),
  tb(R, 'rainfall', 'extremes', { kind: 'wettest' }),
  tb(R, 'rainfall', 'extremes', { kind: 'driest' }),
  tb(R, 'rainfall', 'sources'),
  tb(R, 'rainfall', 'statistics'),
  bd(R, 'rainfall', 'seasonal'),
  bd(R, 'rainfall', 'events', { kind: 'count' }),
  bd(R, 'rainfall', 'events', { kind: 'max' }),
  ...many((p) => fc(RF, 'rainfall', 'rainfall', p ? { province: p } : {}), PROVINCE_TAB_IDS.slice(0, 2)),
  ...many((p) => fc(RF, 'rainfall', 'spi', p ? { province: p } : {}), PROVINCE_TAB_IDS.slice(0, 2)),
  tb(RF, 'drought', 'early-warning'),

  // ---------------------------------------------------------------- drought
  sum(D, 'drought'),
  ...many(
    (k) => mp(D, 'drought', k),
    [
      'drought-class',
      'municipal-class',
      'province-class',
      'spi1',
      'spi3',
      'spi6',
      'spi12',
      'spi24',
      'spei3',
      'spei12',
      'rain-anomaly',
      'soil-moisture',
      'ndvi',
      'vci',
    ],
  ),
  ...many((k) => mp(D, 'drought', k), ['dams', 'boreholes', 'settlements', 'outlook-1', 'outlook-2', 'outlook-3']),
  tb(D, 'drought', 'cascade'),
  tb(D, 'drought', 'affected', { level: 'province' }),
  tb(D, 'drought', 'affected', { level: 'catchment' }),
  tb(D, 'drought', 'municipalities'),
  tb(D, 'drought', 'sources'),
  ...many((k) => ts(D, 'drought', 'spi', { scale: k }), [3, 1, 6, 12, 24]),
  ts(D, 'drought', 'rain-spei'),
  ts(D, 'drought', 'dam-flows'),
  ts(D, 'drought', 'gw-sgi'),
  ts(D, 'drought', 'soil-moisture'),
  ...many((k) => ts(D, 'drought', 'drought-area', { scale: k }), [6, 3, 12]),
  ts(D, 'drought', 'storage-vs-spi'),
  ts(D, 'drought', 'vegetation'),
  ts(D, 'drought', 'population-at-risk'),
  mx(D, 'drought', 'veg-heatmap'),
  bd(D, 'drought', 'severity'),
  bd(D, 'drought', 'province-area'),
  bd(D, 'drought', 'restrictions'),
  tb(DF, 'drought', 'forecast-indicators'),
  mp(DF, 'drought', 'forecast-6'),
  fc(DF, 'drought', 'area'),
  ...many((k) => fc(DF, 'drought', 'spi', { horizon: k }), [3]),
  fc(DF, 'drought', 'settlements'),
  fc(DF, 'drought', 'population'),
  mx(DF, 'drought', 'province-risk'),
  ts(DF, 'drought', 'recovery-province'),
  bd(DF, 'drought', 'class-probability'),
  tb(DF, 'drought', 'recovery'),

  // ---------------------------------------------------------------- climate
  sum(C, 'climate'),
  ...many(
    (k) => mp(C, 'climate', k),
    ['temp-trend', 'temp-anomaly', 'mean-temp', 'rain-trend', 'cdd', 'hot-days', 'et0', 'vulnerability'],
  ),
  ts(C, 'climate', 'temperature-long'),
  ...many((k) => ts(C, 'climate', 'national-trend', { var: k }), ['temperature', 'rainfall', 'et', 'streamflow']),
  ts(C, 'climate', 'extremes'),
  bd(C, 'climate', 'map-seasonality'),
  tb(C, 'climate', 'statistics'),
  ...many((k) => bd(C, 'climate', 'seasonal-change', { var: k }), ['temperature', 'rainfall']),
  ...many((k) => ts(C, 'climate', 'projections', { var: k }), ['temperature', 'rainfall']),
  ...many((k) => ts(C, 'climate', 'heat-days', { kind: k }), ['hot', 'cold']),
  ...many((k) => ts(C, 'climate', 'extreme-rain', { kind: k }), ['r20', 'rx1']),
  ts(C, 'climate', 'evaporation'),
  ts(C, 'climate', 'irrigation'),
  ts(C, 'climate', 'streamflow-linkage'),
  ts(C, 'climate', 'drought-frequency'),
  tb(C, 'climate', 'signal-chain'),
  tb(C, 'climate', 'provinces'),
  bd(C, 'climate', 'risk-index'),
  tb(CF, 'climate', 'forecast-summary', { scenario: 'rcp85' }),
  tb(CF, 'climate', 'risk-outlook', { scenario: 'rcp85' }),
  ts(CF, 'climate', 'indicator-trends', { scenario: 'rcp85' }),
  ...many((k) => bd(CF, 'climate', 'projection-bars', { scenario: 'rcp85', kind: k }), ['heat', 'drought', 'extreme']),
  ...many(
    (k) => mp(CF, 'climate', k, { scenario: 'rcp85', year: '2050' }),
    ['proj-temp', 'proj-rain', 'proj-spi', 'proj-availability'],
  ),

  // ---------------------------------------------------------------- vegetation
  sum(V, 'vegetation'),
  ...many(
    (k) => mp(V, 'vegetation', k),
    [
      'ndvi',
      'evi',
      'savi',
      'msavi2',
      'vci',
      'vhi',
      'tci',
      'vpi',
      'asi',
      'svi',
      'ndwi',
      'ndii',
      'lst',
      'sm',
      'ndvi-anomaly',
      'ndvi-trend',
    ],
  ),
  ...many((k) => ts(V, 'vegetation', 'indices', { set: k }), ['ndvi,evi,savi,msavi2', 'vci,vhi,tci', 'ndwi,ndii']),
  ts(V, 'vegetation', 'anomaly'),
  ...many((k) => ts(V, 'vegetation', 'index-trend', { index: k }), ['ndvi', 'vci', 'vhi', 'evi', 'savi']),
  bd(V, 'vegetation', 'classification'),
  bd(V, 'vegetation', 'drivers'),
  ...many((k) => bd(V, 'vegetation', 'land-cover', { kind: k }), ['ndvi', 'share']),
  tb(V, 'vegetation', 'provinces'),
  bd(V, 'vegetation', 'by-province'),
  bd(V, 'vegetation', 'seasonal'),
  ...many((k) => ts(V, 'vegetation', 'drivers', { var: k }), ['rain', 'temp', 'pet', 'sm']),
  tb(V, 'vegetation', 'hotspots'),
  ...many((k) => mp(VF, 'vegetation', k), ['forecast-ndvi', 'forecast-anomaly']),
  fc(VF, 'vegetation', 'ndvi'),
  fc(VF, 'vegetation', 'recovery-probability'),
  tb(VF, 'vegetation', 'forecast-indicators'),

  // ---------------------------------------------------------------- runoff
  sum(RO, 'runoff'),
  ents(RO, 'runoff'),
  ent(RO, 'runoff', SAMPLE_DISTRICT),
  ...many(
    (k) => mp(RO, 'runoff', k),
    [
      'annual-runoff',
      'runoff-anomaly',
      'monthly-runoff',
      'runoff-coefficient',
      'catchment-runoff',
      'stations',
      'ssi',
      'flow-status',
    ],
  ),
  ts(RO, 'runoff', 'discharge', { entityId: SAMPLE_DISTRICT }),
  ts(RO, 'runoff', 'ssi'),
  ts(RO, 'runoff', 'runoff-anomaly'),
  ts(RO, 'runoff', 'rainfall-runoff'),
  ts(RO, 'runoff', 'water-balance'),
  ...many((k) => ts(RO, 'runoff', k, { entityId: SAMPLE_DISTRICT }), ['flood-frequency', 'fdc', 'seasonal']),
  ...many((k) => ts(RO, 'runoff', 'drivers', { var: k }), ['rain', 'aet', 'sm']),
  ts(RO, 'runoff', 'national-volume'),
  bd(RO, 'runoff', 'by-wma'),
  bd(RO, 'runoff', 'by-province'),
  tb(RO, 'runoff', 'statistics', { entityId: SAMPLE_DISTRICT }),
  ...many((k) => tb(RO, 'runoff', 'top-stations', { order: k }), ['highest', 'lowest']),
  tb(RO, 'runoff', 'events'),
  fc(ROF, 'runoff', 'runoff'),
  fc(ROF, 'runoff', 'flow', { entityId: SAMPLE_DISTRICT }),
  fc(ROF, 'runoff', 'flood-probability'),

  // ---------------------------------------------------------------- overview (live panels)
  ts('/', 'drought', 'drought-area', { period: '24M' }),
  ...many((k) => mp('/', 'drought', k), ['municipal-class', 'rain-anomaly', 'vci']),

  // ---------------------------------------------------------------- cross-module
  { page: '*', kind: 'reference', key: 'provinces', scoped: false },
  { page: '*', kind: 'reference', key: 'wmas', scoped: false },
  { page: '*', kind: 'reference', key: 'municipalities', scoped: false },
  { page: '*', kind: 'health', scoped: false },
  { page: '/data-integration', kind: 'meta', key: 'sources', scoped: false },
  { page: '/data-integration', kind: 'meta', key: 'coverage', scoped: false },
  { page: '/governance', kind: 'meta', key: 'variables', scoped: false },
];

/** API path for a manifest entry. */
export function manifestPath(e: ManifestEntry): string {
  switch (e.kind) {
    case 'reference':
      return `/api/v1/reference/${e.key}`;
    case 'meta':
      return `/api/v1/meta/${e.key}`;
    case 'health':
      return '/api/v1/health';
    case 'entity':
      return `/api/v1/${e.module}/entities/${e.key}`;
    case 'entities':
    case 'summary':
      return `/api/v1/${e.module}/${e.kind}`;
    default:
      return `/api/v1/${e.module}/${e.kind}`;
  }
}

/** Query params for a manifest entry (without the global filters). */
export function manifestParams(e: ManifestEntry): Record<string, string | number> {
  const keyParam =
    e.kind === 'map'
      ? 'layer'
      : ['timeseries', 'forecast', 'breakdown', 'table', 'matrix'].includes(e.kind)
        ? 'metric'
        : undefined;
  return { ...(keyParam && e.key ? { [keyParam]: e.key } : {}), ...e.params };
}
