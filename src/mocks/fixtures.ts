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

/** FNV-1a (32-bit) of a string as 8 hex digits: a short, stable suffix for long fixture names. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * File name of a fixture: the key with unsafe characters replaced; names over 120 characters are cut to 100 plus a
 * hash of the whole key (Windows rejects paths over 260 characters; the index maps every key to its file).
 */
export const fixtureFile = (key: string) => {
  const name = key.replace(/[^A-Za-z0-9.-]+/g, '_');
  return `${name.length > 120 ? `${name.slice(0, 100)}_${fnv1a(key)}` : name}.json`;
};

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
