/**
 * Recorded backend responses (tests/fixtures/backend, `npm run fixtures:record`) served through MSW when
 * VITE_FIXTURES=true, so the hybrid Playwright project is fast and deterministic without a running backend.
 * The dev / preview server serves the files under /__fixtures (vite.config.ts).
 */
import { HttpResponse } from 'msw';

export interface Fixture {
  status: number;
  requestId?: string;
  body: unknown;
}

/** "rainfall/timeseries?metric=anomaly&period=12M&window=1" — path below /api/v1 + sorted query. */
export function fixtureKey(url: URL): string {
  const sp = new URLSearchParams([...url.searchParams].sort(([a], [b]) => a.localeCompare(b)));
  const q = sp.toString();
  return `${url.pathname.replace(/^.*\/api\/v1\//, '')}${q ? `?${q}` : ''}`;
}

export const fixtureFile = (key: string) => `${key.replace(/[^A-Za-z0-9.-]+/g, '_')}.json`;

let index: Promise<Record<string, string>> | null = null;

export async function fixtureResponse(url: URL): Promise<Response> {
  index ??= fetch('/__fixtures/index.json').then((r) => r.json() as Promise<Record<string, string>>);
  const key = fixtureKey(url);
  const file = (await index)[key];
  if (!file) {
    console.warn(`[fixtures] missing ${key} (add it to src/api/liveManifest.ts and re-record)`);
    return HttpResponse.json({ error: `No fixture for ${key}` }, { status: 404 });
  }
  const f = (await (await fetch(`/__fixtures/${file}`)).json()) as Fixture;
  return HttpResponse.json(f.body as Record<string, unknown>, {
    status: f.status,
    headers: { 'x-request-id': f.requestId ?? 'fixture' },
  });
}
