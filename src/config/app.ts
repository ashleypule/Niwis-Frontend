/** Application-level configuration. */

// import.meta.env is undefined when generators run under node (scripts, tests)
const env: Record<string, string | undefined> =
  (import.meta.env as Record<string, string | undefined> | undefined) ?? {};

export type DataSource = 'mock' | 'api';

export const APP = {
  name: 'NIWIS',
  fullName: 'National Integrated Water Information System',
  department: 'Department of Water and Sanitation',
  country: 'Republic of South Africa',
  dataSource: (env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock') as DataSource,
  apiBaseUrl: env.VITE_API_BASE_URL ?? '',
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
