/** Application-level configuration. */

// import.meta.env is undefined when generators run under node (scripts, tests)
const env: Record<string, string | undefined> =
  (import.meta.env as Record<string, string | undefined> | undefined) ?? {};

/**
 * mock   = MSW answers everything with seeded sample data (demos, offline work, tests)
 * hybrid = the modules in VITE_LIVE_MODULES (and /meta, /health, reference lists) come from the backend; MSW answers the rest
 * api    = everything from the backend (no MSW)
 */
export type DataSource = 'mock' | 'api' | 'hybrid';
/** What a panel shows when the backend answers 501 DATA_UNAVAILABLE. */
export type UnavailableMode = 'sample' | 'empty';

const LIVE_MODULES = (env.VITE_LIVE_MODULES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function resolveDataSource(v: string | undefined): DataSource {
  if (v === 'api' || v === 'mock' || v === 'hybrid') return v;
  return LIVE_MODULES.length ? 'hybrid' : 'mock';
}
const dataSource = resolveDataSource(env.VITE_DATA_SOURCE);

export const APP = {
  name: 'NIWIS',
  fullName: 'National Integrated Water Information System',
  department: 'Department of Water and Sanitation',
  country: 'Republic of South Africa',
  dataSource,
  /** Modules served by the backend in hybrid mode. */
  liveModules: LIVE_MODULES,
  /** /meta/* and /health from the backend (hybrid mode). */
  liveMeta: env.VITE_LIVE_META !== 'false',
  apiBaseUrl: env.VITE_API_BASE_URL ?? '',
  /** Sample needs MSW to answer the re-request, so without it (api mode) the only option is an empty panel. */
  unavailableMode: (dataSource === 'api'
    ? 'empty'
    : env.VITE_UNAVAILABLE_MODE === 'empty' || env.VITE_UNAVAILABLE_MODE === 'sample'
      ? env.VITE_UNAVAILABLE_MODE
      : env.PROD
        ? 'empty'
        : 'sample') as UnavailableMode,
  /** Marker text for backend data ("Live"; "Database" if the data team says the data are not measured). */
  liveLabel: env.VITE_LIVE_LABEL || 'Live',
  /** Serve live paths from recorded fixtures instead of the backend (Playwright hybrid project). */
  fixtures: env.VITE_FIXTURES === 'true',
  /** Timeout for one backend request (first requests after a backend restart can take ~20 s). */
  requestTimeoutMs: Number(env.VITE_REQUEST_TIMEOUT_MS ?? 30_000),
  mockLatencyMs: Number(env.VITE_MOCK_LATENCY_MS ?? 300),
  /**
   * "As-of" date of the data. Defaults to today (SAST). Set VITE_AS_OF=YYYY-MM-DD to pin it
   * (used by tests so screenshots are reproducible).
   */
  asOf: resolveAsOf(env.VITE_AS_OF),
  timezone: 'Africa/Johannesburg',
  /** Climatological baseline used for anomalies and SPI calibration (spec §6.1, §4.1). */
  baseline: { from: 1981, to: 2010 },
  /** First year of the monthly climate record. */
  climateStartYear: 1960,
  /** First year of the daily operational record. */
  dailyStartYear: 2020,
};

function resolveAsOf(pinned?: string): Date {
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return new Date(`${pinned}T08:00:00+02:00`);
  const now = new Date();
  // Normalise to 08:00 SAST of the current SAST day so data is stable within a day.
  const sast = new Date(now.getTime() + 2 * 3600_000);
  const y = sast.getUTCFullYear();
  const m = sast.getUTCMonth();
  const d = sast.getUTCDate();
  return new Date(Date.UTC(y, m, d, 6, 0, 0));
}

export const isMock = APP.dataSource === 'mock';
export const isHybrid = APP.dataSource === 'hybrid';
/** MSW runs in mock and hybrid mode. */
export const usesMsw = APP.dataSource !== 'api';
/** Per-panel Live / Sample markers replace the global "Sample data" badge whenever some data is real. */
export const showProvenance = APP.dataSource !== 'mock';

/** Reference lists the backend serves (the 52 districts are its `municipalities`). */
const LIVE_REFERENCE = ['provinces', 'wmas', 'municipalities'];

/** True when this module's data comes from the backend. */
export function isLive(module: string): boolean {
  if (APP.dataSource === 'api') return true;
  if (APP.dataSource === 'mock') return false;
  return APP.liveModules.includes(module);
}

/** True when an /api/v1 path is answered by the backend (used by the client and by the MSW passthrough). */
export function isLivePath(pathname: string): boolean {
  if (APP.dataSource === 'mock') return false;
  const m = /\/api\/v1\/([^/?]+)(?:\/([^/?]+))?/.exec(pathname);
  if (!m) return false;
  const [, first, second] = m;
  if (APP.dataSource === 'api') return true;
  if (first === 'health' || first === 'meta') return APP.liveMeta;
  if (first === 'reference') return LIVE_REFERENCE.includes(second ?? '');
  return isLive(first);
}

/** Module id of an /api/v1 path (undefined for alerts, search, reference, meta). */
export function moduleOfPath(pathname: string): string | undefined {
  const m = /\/api\/v1\/([^/?]+)\/([^/?]+)/.exec(pathname);
  if (!m || ['reference', 'meta'].includes(m[1])) return undefined;
  return m[1];
}
