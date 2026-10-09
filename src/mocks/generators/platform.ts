/**
 * Platform data (spec §21–24): data feeds, quality dimensions, programme phases and budget.
 * One source for the Overview, Data Integration, Governance and Roadmap pages.
 */
import { APP } from '@/config/app';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';

export type FeedStatus = 'Online' | 'Delayed' | 'Degraded' | 'Offline';
export interface Provider {
  id: string;
  name: string;
  short: string;
  type:
    | 'Meteorological'
    | 'Satellite / EO'
    | 'Hydrological'
    | 'Groundwater'
    | 'Water quality'
    | 'Municipal / WSA'
    | 'Socio-economic'
    | 'Ecological'
    | 'Bulk water'
    | 'Global';
  protocol: string;
  format: string;
  feeds: number;
  cadence: string;
  latencyMin: number;
  lat: number;
  lon: number;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'saws',
    name: 'South African Weather Service',
    short: 'SAWS',
    type: 'Meteorological',
    protocol: 'REST API / MQTT',
    format: 'BUFR / NetCDF / JSON',
    feeds: 118,
    cadence: '15 min',
    latencyMin: 12,
    lat: -25.75,
    lon: 28.24,
  },
  {
    id: 'sansa',
    name: 'South African National Space Agency',
    short: 'SANSA',
    type: 'Satellite / EO',
    protocol: 'FTP / THREDDS / S3',
    format: 'GeoTIFF / NetCDF',
    feeds: 34,
    cadence: 'Daily / dekadal',
    latencyMin: 720,
    lat: -25.89,
    lon: 27.69,
  },
  {
    id: 'dws-hyd',
    name: 'DWS Hydstra / Telemetry',
    short: 'DWS Hydstra',
    type: 'Hydrological',
    protocol: 'WISKI / REST API',
    format: 'WaterML 2.0',
    feeds: 142,
    cadence: '15 min',
    latencyMin: 18,
    lat: -25.75,
    lon: 28.19,
  },
  {
    id: 'dws-nga',
    name: 'DWS National Groundwater Archive',
    short: 'NGA',
    type: 'Groundwater',
    protocol: 'REST API / CSV',
    format: 'CSV / JSON',
    feeds: 30,
    cadence: 'Daily / weekly',
    latencyMin: 1440,
    lat: -25.73,
    lon: 28.2,
  },
  {
    id: 'labs',
    name: 'Accredited laboratories (NWQMS)',
    short: 'Laboratories',
    type: 'Water quality',
    protocol: 'NWQMS DB',
    format: 'NWQMS XML',
    feeds: 38,
    cadence: 'Monthly',
    latencyMin: 4320,
    lat: -26.2,
    lon: 28.04,
  },
  {
    id: 'wsa',
    name: 'Municipalities / Water Services Authorities',
    short: 'Municipalities / WSAs',
    type: 'Municipal / WSA',
    protocol: 'DWS WSNIS API',
    format: 'JSON / CSV',
    feeds: 60,
    cadence: 'Monthly',
    latencyMin: 2880,
    lat: -29.12,
    lon: 26.21,
  },
  {
    id: 'statssa',
    name: 'Statistics South Africa',
    short: 'Stats SA',
    type: 'Socio-economic',
    protocol: 'API / shapefile',
    format: 'CSV / SHP',
    feeds: 6,
    cadence: 'Annual',
    latencyMin: 10080,
    lat: -25.74,
    lon: 28.19,
  },
  {
    id: 'sanbi',
    name: 'South African National Biodiversity Institute',
    short: 'SANBI',
    type: 'Ecological',
    protocol: 'OGC WFS',
    format: 'GeoJSON',
    feeds: 8,
    cadence: 'Quarterly',
    latencyMin: 10080,
    lat: -33.98,
    lon: 18.43,
  },
  {
    id: 'wb',
    name: 'Water boards (Rand Water, Umgeni-uThukela, Magalies …)',
    short: 'Water boards',
    type: 'Bulk water',
    protocol: 'SCADA export / API',
    format: 'CSV / JSON',
    feeds: 9,
    cadence: 'Daily',
    latencyMin: 240,
    lat: -29.6,
    lon: 30.38,
  },
  {
    id: 'global',
    name: 'Global (NASA GRACE-FO, NOAA ENSO, CHIRPS, TAMSAT, Copernicus)',
    short: 'Global / other',
    type: 'Global',
    protocol: 'Earthdata / OPeNDAP',
    format: 'NetCDF',
    feeds: 5,
    cadence: 'Daily / monthly',
    latencyMin: 2880,
    lat: -34.6,
    lon: 31.9,
  },
];

export interface Feed {
  id: string;
  provider: string;
  name: string;
  status: FeedStatus;
  latencyMin: number;
  recordsPerDay: number;
  completeness: number;
  accuracy: number;
  timeliness: number;
  consistency: number;
  validity: number;
  metadata: boolean;
  standard: string;
}

export const FEEDS: Feed[] = (() => {
  const out: Feed[] = [];
  for (const p of PROVIDERS) {
    const r = new Rng(`feeds-${p.id}`);
    for (let i = 0; i < p.feeds; i++) {
      const status = r.weighted<FeedStatus>(
        ['Online', 'Delayed', 'Degraded', 'Offline'],
        p.id === 'wsa'
          ? [0.78, 0.12, 0.05, 0.05]
          : p.id === 'dws-nga'
            ? [0.85, 0.1, 0.03, 0.02]
            : [0.95, 0.03, 0.01, 0.01],
      );
      const lat = p.latencyMin * r.range(0.6, 1.5) * (status === 'Delayed' ? 3 : 1);
      const recs = Math.round(
        (p.cadence.startsWith('15')
          ? 96 * r.range(8, 30)
          : p.cadence.startsWith('Daily')
            ? r.range(200, 4000)
            : r.range(20, 600)) * (p.id === 'sansa' ? 50 : 1),
      );
      const base = p.id === 'saws' || p.id === 'dws-hyd' ? 96 : p.id === 'wsa' ? 84 : 92;
      out.push({
        id: `${p.id}-${String(i + 1).padStart(3, '0')}`,
        provider: p.id,
        name: `${p.short} feed ${i + 1}`,
        status,
        latencyMin: Math.round(lat),
        recordsPerDay: status === 'Offline' ? 0 : recs,
        completeness: round(clamp(base + r.normal(0, 3) - (status === 'Offline' ? 25 : 0), 50, 100), 1),
        accuracy: round(clamp(base - 2 + r.normal(0, 2.5), 60, 100), 1),
        timeliness: round(clamp(base - 4 + r.normal(0, 4) - (status === 'Delayed' ? 15 : 0), 40, 100), 1),
        consistency: round(clamp(base - 1 + r.normal(0, 2.5), 60, 100), 1),
        validity: round(clamp(base - 1 + r.normal(0, 2.2), 60, 100), 1),
        metadata: r.bool(p.id === 'wsa' ? 0.85 : 0.97),
        standard: p.format.split(' / ')[0],
      });
    }
  }
  return out;
})();

export function qualityDims(feeds: Feed[] = FEEDS) {
  return {
    completeness: round(mean(feeds.map((f) => f.completeness)), 0),
    accuracy: round(mean(feeds.map((f) => f.accuracy)), 0),
    timeliness: round(mean(feeds.map((f) => f.timeliness)), 0),
    consistency: round(mean(feeds.map((f) => f.consistency)), 0),
    validity: round(mean(feeds.map((f) => f.validity)), 0),
  };
}

export function platformSummary() {
  const active = FEEDS.filter((f) => f.status === 'Online' || f.status === 'Delayed').length;
  const q = qualityDims();
  return {
    feeds: FEEDS.length,
    active,
    providers: PROVIDERS.length,
    records: FEEDS.reduce((s, f) => s + f.recordsPerDay, 0),
    latency: round(mean(FEEDS.filter((f) => f.status !== 'Offline').map((f) => Math.min(f.latencyMin, 1440))), 0),
    quality: round((q.completeness + q.accuracy + q.timeliness + q.consistency + q.validity) / 5, 0),
    metadata: round((FEEDS.filter((f) => f.metadata).length / FEEDS.length) * 100, 0),
    openIssues: FEEDS.filter((f) => f.status !== 'Online').length,
  };
}

// ------------------------------------------------------------------ programme (spec §24)
/** Programme start: assumed 1 September 2024 (36-month programme). */
export const PROGRAMME_START = new Date(Date.UTC(2024, 8, 1));
export const programmeMonth = () =>
  Math.max(0, Math.floor((APP.asOf.getTime() - PROGRAMME_START.getTime()) / (30.44 * 86400_000)) + 1);

export interface SubPhase {
  id: string;
  phase: 1 | 2 | 3;
  name: string;
  from: number;
  to: number;
  deliverables: string[];
  /** delivery efficiency (actual vs planned) */
  efficiency: number;
}

export const PHASES = [
  {
    id: 1,
    name: 'Phase 1: Foundation',
    months: 'M1–M9',
    from: 1,
    to: 9,
    focus: 'Data audit & agreements, core infrastructure, priority data feeds, core indices, basic dashboard',
  },
  {
    id: 2,
    name: 'Phase 2: Expansion',
    months: 'M10–M24',
    from: 10,
    to: 24,
    focus:
      'EO integration (SANSA), water quality (NWQMS), groundwater (NGA), municipal services (WSNIS), AI models v1, full portal',
  },
  {
    id: 3,
    name: 'Phase 3: Intelligence',
    months: 'M25–M36',
    from: 25,
    to: 36,
    focus: 'Advanced AI (8 domains), digital twin, CMIP6 scenarios, mobile platform, open data API, evaluation',
  },
] as const;

export const SUB_PHASES: SubPhase[] = [
  {
    id: '1A',
    phase: 1,
    name: 'Inception & data audit',
    from: 1,
    to: 4,
    deliverables: ['Data inventory (SAWS, SANSA, DWS, municipalities)', 'Data-sharing MOUs', 'Architecture blueprint'],
    efficiency: 1,
  },
  {
    id: '1B',
    phase: 1,
    name: 'Core platform & priority feeds',
    from: 5,
    to: 9,
    deliverables: [
      'Cloud data lake & API gateway',
      'SAWS stations, flow gauges & dam levels',
      'SPI/SPEI/VCI/SSI/SGI pipelines',
      'Phase 1 dashboard',
    ],
    efficiency: 0.98,
  },
  {
    id: '2A',
    phase: 2,
    name: 'Earth observation & quality',
    from: 10,
    to: 16,
    deliverables: ['SANSA NDVI/LST/soil-moisture pipelines', 'NWQMS water quality integration'],
    efficiency: 0.95,
  },
  {
    id: '2B',
    phase: 2,
    name: 'Groundwater, services & AI v1',
    from: 17,
    to: 24,
    deliverables: [
      'NGA boreholes & SGI products',
      'WSNIS municipal supply data',
      'LSTM drought & reservoir forecasts',
      'Full NIWIS portal',
    ],
    efficiency: 0.86,
  },
  {
    id: '3A',
    phase: 3,
    name: 'Advanced AI & digital twin',
    from: 25,
    to: 30,
    deliverables: ['Ensemble models for 8 domains', 'National water digital twin', 'CMIP6 scenario integration'],
    efficiency: 0.8,
  },
  {
    id: '3B',
    phase: 3,
    name: 'Rollout, open data & evaluation',
    from: 31,
    to: 36,
    deliverables: ['Mobile app for field officers', 'Public open-data API', 'Independent evaluation'],
    efficiency: 1,
  },
];

export function subPhaseProgress(
  p: SubPhase,
  month = programmeMonth(),
): { planned: number; actual: number; status: 'Completed' | 'On Track' | 'At Risk' | 'Delayed' | 'Not Started' } {
  const planned = clamp(((month - p.from + 1) / (p.to - p.from + 1)) * 100, 0, 100);
  const actual = round(month > p.to + 3 ? 100 : planned * p.efficiency, 0);
  const status =
    actual >= 100
      ? 'Completed'
      : planned === 0
        ? 'Not Started'
        : planned - actual > 12
          ? 'Delayed'
          : planned - actual > 5
            ? 'At Risk'
            : 'On Track';
  return { planned: round(planned, 0), actual, status };
}

export function phaseProgress(phase: 1 | 2 | 3) {
  const subs = SUB_PHASES.filter((s) => s.phase === phase);
  const w = subs.map((s) => s.to - s.from + 1);
  const tw = w.reduce((a, b) => a + b, 0);
  const actual = subs.reduce((s, x, i) => s + subPhaseProgress(x).actual * w[i], 0) / tw;
  const planned = subs.reduce((s, x, i) => s + subPhaseProgress(x).planned * w[i], 0) / tw;
  return { actual: round(actual, 0), planned: round(planned, 0) };
}

/** Budget (R million) — resource categories from spec §24.4. */
export const BUDGET = [
  { id: 'infra', name: 'Data & infrastructure (cloud, 10 PB storage, telemetry)', planned: 120.1, color: '#1565C0' },
  { id: 'software', name: 'Software & licences (GIS, modelling)', planned: 51.5, color: '#2E9E5B' },
  { id: 'personnel', name: 'Personnel (engineers, AI/ML, GIS/EO, domain experts)', planned: 74.4, color: '#F2A900' },
  { id: 'training', name: 'Training & capacity building', planned: 22.9, color: '#8E44AD' },
  { id: 'operations', name: 'Operations & support', planned: 17.1, color: '#0FA3B1' },
];
export const BUDGET_TOTAL = round(
  BUDGET.reduce((s, b) => s + b.planned, 0),
  1,
);

export const budgetSpent = memo(
  (): { id: string; spent: number }[] => {
    const m = programmeMonth();
    const r = new Rng('budget-spent');
    return BUDGET.map((b) => ({
      id: b.id,
      spent: round(b.planned * clamp((m / 36) * (b.id === 'infra' ? 1.25 : 0.95) * r.range(0.9, 1.05), 0, 1), 1),
    }));
  },
  () => 'b',
);

/** Human resources (spec §24.4). */
export const ROLES = [
  { role: 'Data engineers', required: '4–6', allocated: 5 },
  { role: 'AI / ML scientists', required: '2–3', allocated: 2 },
  { role: 'GIS / EO specialists', required: '2', allocated: 2 },
  { role: 'Water domain experts', required: '3–4', allocated: 3 },
  { role: 'IT security & cloud architects', required: '2', allocated: 1 },
];
