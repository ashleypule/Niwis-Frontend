/**
 * npm run fixtures:record — calls every live endpoint the pages use (src/api/liveManifest.ts) on the running backend,
 * with the default filters and three scopes (a province, a district, a WMA), and saves the responses to
 * tests/fixtures/backend. The Playwright "hybrid" project serves them through MSW (VITE_FIXTURES=true). Re-record
 * whenever the backend changes.
 *
 *   BACKEND_URL=http://localhost:8000 npm run fixtures:record
 *   npm run fixtures:record -- --only=seasonal-total   (re-record the matching requests, keep the rest)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIVE_REQUESTS, expandCategories, manifestParams, manifestPath } from '@/api/liveManifest';
import { liveParams } from '@/api/scope';
import { fixtureFile, fixtureKey, type Fixture } from '@/mocks/fixtures';
import { runBody, type RunRequest } from '@/types/forecast';
import { getPaced, withCategoryGroups } from './lib/paced';

const BASE = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
/** --only=<text>: re-record only the requests whose fixture key contains <text>, merged into the existing set. */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const DIR = resolve(import.meta.dirname, '../tests/fixtures/backend');

/** Location filters as the UI holds them; liveParams() turns them into what the client sends. */
const SCOPES: Record<string, string>[] = [{}, { province: 'WC' }, { district: 'DC32' }, { wma: 'WMA5' }];
const SPI3 = { table: '6.2_rainfall_derived_drought_indices_master', column: 'SPI_3_Short_Term_Agricultural_Drought' };
/** Forecasting Studio runs recorded for tests/e2e/hybrid/studio.spec.ts: the Studio's default choices, and a shared link. */
const STUDIO_RUNS: RunRequest[] = [
  { ...SPI3, scope: { level: 'national' }, model: 'auto', horizon: 12, inputs: [], resolution: 'monthly' },
  { ...SPI3, scope: { level: 'province', id: 'WC' }, model: 'ets', horizon: 6, inputs: [], resolution: 'monthly' },
];

/** POST a Studio run, wait for it, and save both the accepted answer (keyed by the body) and the finished run. */
async function recordStudioRun(r: RunRequest, index: Record<string, string>, failed: string[]) {
  const body = runBody(r);
  const postKey = fixtureKey(new URL(`${BASE}/api/v1/forecast/runs`), body);
  if (ONLY && !postKey.includes(ONLY)) return;
  const save = (key: string, f: Fixture) => {
    const file = fixtureFile(key);
    writeFileSync(resolve(DIR, file), JSON.stringify(f));
    index[key] = file;
  };
  try {
    const res = await fetch(`${BASE}/api/v1/forecast/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const accepted = (await res.json()) as { runId?: string; statusUrl?: string };
    save(postKey, { status: res.status, requestId: res.headers.get('x-request-id') ?? undefined, body: accepted });
    if (!res.ok || !accepted.statusUrl) {
      failed.push(`${res.status} ${postKey}`);
      return;
    }
    let final: Response | undefined;
    let fb: { status: string } = { status: 'queued' };
    for (let i = 0; i < 150 && fb.status !== 'done' && fb.status !== 'failed'; i++) {
      if (i) await new Promise((ok) => setTimeout(ok, 2000));
      final = await fetch(`${BASE}${accepted.statusUrl}`);
      fb = (await final.json()) as { status: string };
    }
    save(fixtureKey(new URL(`${BASE}${accepted.statusUrl}`)), { status: final!.status, body: fb });
    if (fb.status !== 'done') failed.push(`run ${fb.status}: ${postKey}`);
  } catch (err) {
    failed.push(`${postKey}: ${(err as Error).message}`);
  }
}

async function main() {
  const urls = new Set<string>();
  const requests = await withCategoryGroups(BASE, LIVE_REQUESTS, manifestPath, expandCategories);
  for (const e of requests) {
    const base: Record<string, string> = {};
    // the pages send the period on every module request (useFilterParams); not on reference / meta / entity cards
    if (!['entity', 'reference', 'health', 'meta', 'categories', 'forecast-api'].includes(e.kind) && !e.params?.from)
      base.period = '12M';
    for (const scope of e.scoped === false ? [{}] : SCOPES) {
      const p = liveParams({ ...base, ...scope, ...manifestParams(e) }) as Record<string, string>;
      const sp = new URLSearchParams(
        Object.entries(p)
          .filter(([, v]) => v !== '' && v != null)
          .map(([k, v]) => [k, String(v)]),
      );
      urls.add(`${BASE}${manifestPath(e)}${sp.size ? `?${sp}` : ''}`);
    }
  }
  if (ONLY) for (const u of urls) if (!fixtureKey(new URL(u)).includes(ONLY)) urls.delete(u);
  console.log(`fixtures:record — ${urls.size} requests against ${BASE}${ONLY ? ` (only "${ONLY}")` : ''}`);
  const indexFile = resolve(DIR, 'index.json');
  const index: Record<string, string> =
    ONLY && existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, 'utf8')) as Record<string, string>) : {};
  if (!ONLY) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const queue = [...urls];
  let done = 0;
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        const key = fixtureKey(new URL(url));
        try {
          const res = await getPaced(url);
          const f: Fixture = {
            status: res.status,
            requestId: res.headers.get('x-request-id') ?? undefined,
            body: await res.json(),
          };
          // 429: the backend was busy (another client shares the per-IP limit): a recorded 429 would fail a test later
          if ((res.status >= 500 && res.status !== 501) || res.status === 429) failed.push(`${res.status} ${key}`);
          const file = fixtureFile(key);
          writeFileSync(resolve(DIR, file), JSON.stringify(f));
          index[key] = file;
        } catch (err) {
          failed.push(`${key}: ${(err as Error).message}`);
        }
        if (++done % 50 === 0) console.log(`  ${done} / ${urls.size}`);
      }
    }),
  );
  for (const r of STUDIO_RUNS) await recordStudioRun(r, index, failed);
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(resolve(DIR, 'index.json'), `${JSON.stringify(sorted, null, 1)}\n`);
  console.log(`${Object.keys(index).length} fixtures → tests/fixtures/backend (${readdirSync(DIR).length - 1} files)`);
  if (failed.length) {
    console.error(`${failed.length} failed:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
}

void main();
