/**
 * npm run fixtures:record — calls every live endpoint the pages use (src/api/liveManifest.ts) on the running backend,
 * with the default filters and three scopes (a province, a district, a WMA), and saves the responses to
 * tests/fixtures/backend. The Playwright "hybrid" project serves them through MSW (VITE_FIXTURES=true). Re-record
 * whenever the backend changes.
 *
 *   BACKEND_URL=http://localhost:8000 npm run fixtures:record
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIVE_REQUESTS, expandCategories, manifestParams, manifestPath } from '@/api/liveManifest';
import { liveParams } from '@/api/scope';
import { fixtureFile, fixtureKey, type Fixture } from '@/mocks/fixtures';
import { getPaced, withCategoryGroups } from './lib/paced';

const BASE = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const DIR = resolve(import.meta.dirname, '../tests/fixtures/backend');

/** Location filters as the UI holds them; liveParams() turns them into what the client sends. */
const SCOPES: Record<string, string>[] = [{}, { province: 'WC' }, { district: 'DC32' }, { wma: 'WMA5' }];

async function main() {
  const urls = new Set<string>();
  const requests = await withCategoryGroups(BASE, LIVE_REQUESTS, manifestPath, expandCategories);
  for (const e of requests) {
    const base: Record<string, string> = {};
    // the pages send the period on every module request (useFilterParams); not on reference / meta / entity cards
    if (!['entity', 'reference', 'health', 'meta', 'categories'].includes(e.kind)) base.period = '12M';
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
  console.log(`fixtures:record — ${urls.size} requests against ${BASE}`);
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const index: Record<string, string> = {};
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
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(resolve(DIR, 'index.json'), `${JSON.stringify(sorted, null, 1)}\n`);
  console.log(`${Object.keys(index).length} fixtures → tests/fixtures/backend (${readdirSync(DIR).length - 1} files)`);
  if (failed.length) {
    console.error(`${failed.length} failed:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
}

void main();
