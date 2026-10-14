/**
 * npm run contract:check — calls every live endpoint the pages use (src/api/liveManifest.ts) on the running backend and
 *   1. validates each response with the zod schemas the client uses (failures = the page would show an error), and
 *   2. compares its structure with the mock response for the same request (table columns, series, KPI ids, map
 *      geometry), because a panel can validate and still render nothing if, say, a column key differs.
 * Writes docs/backend/CONTRACT_CHECK.md. Exit code 1 on schema failures or unexpected 4xx / 5xx.
 *
 *   BACKEND_URL=http://localhost:8000 npm run contract:check [-- --filter=drought]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ZodTypeAny } from 'zod';
import {
  CategorySetSchema,
  EntityDetailSchema,
  EntityListSchema,
  HealthSchema,
  KpiSetSchema,
  MapLayerSchema,
  MatrixSetSchema,
  MetaCoverageSchema,
  MetaSourcesSchema,
  MetaVariablesSchema,
  RefListSchema,
  SeriesSetSchema,
  TableSetSchema,
} from '@/types/api';
import { LIVE_REQUESTS, manifestParams, manifestPath, type ManifestEntry } from '@/api/liveManifest';
import { MODULE_HANDLERS } from '@/mocks/handlers/modules';
import { ctxFromParams } from '@/mocks/handlers/router';
import { referenceHandler } from '@/mocks/handlers/reference';

const BASE = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const filter = process.argv.find((a) => a.startsWith('--filter='))?.slice(9);
const ROOT = resolve(import.meta.dirname, '..');

const SCHEMA: Record<ManifestEntry['kind'], ZodTypeAny | ((e: ManifestEntry) => ZodTypeAny)> = {
  summary: KpiSetSchema,
  timeseries: SeriesSetSchema,
  forecast: SeriesSetSchema,
  breakdown: CategorySetSchema,
  table: TableSetSchema,
  matrix: MatrixSetSchema,
  map: MapLayerSchema,
  entities: EntityListSchema,
  entity: EntityDetailSchema,
  reference: RefListSchema,
  health: HealthSchema,
  meta: (e) =>
    e.key === 'sources' ? MetaSourcesSchema : e.key === 'coverage' ? MetaCoverageSchema : MetaVariablesSchema,
};

type Any = Record<string, unknown>;
type Status = 'ok' | 'diff' | 'unavailable' | 'schema' | 'error';
interface Result {
  e: ManifestEntry;
  url: string;
  status: Status;
  http: number;
  ms: number;
  notes: string[];
}

function mockFor(e: ManifestEntry, qs: URLSearchParams): Any | undefined {
  try {
    const ctx = ctxFromParams(qs);
    if (e.kind === 'reference') return (referenceHandler(e.key!, ctx) ?? undefined) as Any | undefined;
    const mod = MODULE_HANDLERS[e.module ?? ''];
    if (!mod) return undefined;
    if (e.kind === 'summary') return { kpis: mod.summary?.(ctx) };
    if (e.kind === 'entities') return mod.entities?.(ctx) as Any | undefined;
    if (e.kind === 'entity') return undefined; // mock ids are stations, not districts
    const fn = (mod[e.kind as 'table'] as Record<string, (c: unknown) => unknown> | undefined)?.[e.key ?? ''];
    return fn ? (fn(ctx) as Any) : undefined;
  } catch {
    return undefined;
  }
}

const keys = (xs: unknown, k = 'key') => ((xs as Any[] | undefined) ?? []).map((x) => String(x[k]));
const missingFrom = (want: string[], got: string[]) => want.filter((w) => !got.includes(w));

/** Tables a custom component reads by column key (CascadeFlow, ClimateInsights, DroughtOutlook). */
const CUSTOM_TABLES = [
  'drought/cascade',
  'drought/affected',
  'drought/early-warning',
  'climate/signal-chain',
  'climate/provinces',
];

/** Structural differences that would make a panel render wrongly even though the schema validates. */
function compare(e: ManifestEntry, live: Any, mock: Any | undefined): string[] {
  const out: string[] = [];
  if (!mock) return out;
  switch (e.kind) {
    case 'summary': {
      // the strip renders whatever KPIs arrive; null values must carry a reason
      const noReason = ((live.kpis as Any[]) ?? []).filter((k) => k.value == null && !k.text && !k.unavailableReason);
      if (noReason.length) out.push(`null KPIs without unavailableReason: ${noReason.map((k) => k.id).join(', ')}`);
      break;
    }
    case 'table': {
      // generic tables render whatever columns arrive; only tables read by custom components need the mock's keys
      if (!CUSTOM_TABLES.includes(`${e.module}/${e.key}`)) {
        if (!(live.rows as Any[]).length) out.push('no rows');
        break;
      }
      const m = keys(mock.columns);
      const l = keys(live.columns);
      const gone = missingFrom(m, l);
      if (gone.length) out.push(`columns missing vs mock: ${gone.join(', ')} (live has ${l.join(', ')})`);
      // row fields the UI reads without a column (e.g. cascade: metric, scale, cls, bar)
      const mRow = Object.keys(((mock.rows as Any[]) ?? [])[0] ?? {});
      const lRow = Object.keys(((live.rows as Any[]) ?? [])[0] ?? {});
      const extra = missingFrom(mRow, lRow).filter((k) => !gone.includes(k));
      if (extra.length && lRow.length) out.push(`row fields missing vs mock: ${extra.join(', ')}`);
      if (!(live.rows as Any[]).length) out.push('no rows');
      break;
    }
    case 'timeseries':
    case 'forecast': {
      if (mock.xType !== live.xType) out.push(`xType ${String(live.xType)} (mock ${String(mock.xType)})`);
      const ls = (live.series as Any[]) ?? [];
      if (!ls.length) out.push('no series');
      const allNull = ls.filter((s) => (s.data as unknown[][]).every((p) => p.slice(1).every((v) => v == null)));
      if (allNull.length) out.push(`all-null series (hidden in UI): ${allNull.map((s) => s.name).join(', ')}`);
      break;
    }
    case 'breakdown': {
      if (!(live.categories as unknown[]).length) out.push('no categories');
      break;
    }
    case 'map': {
      if (live.kind === 'choropleth' && live.level === 'municipality' && live.geometry !== 'districts')
        out.push(`municipality choropleth without geometry: "districts"`);
      if (live.kind === 'grid' || live.kind === 'points')
        out.push(`kind ${String(live.kind)} (district data expected)`);
      break;
    }
  }
  // provenance rules from docs/backend/CONTRACT_CHANGES.md
  const text = `${String(live.title ?? '')} ${String(live.note ?? '')}`;
  if (/1981–2010/.test(text) && !live.baseline) out.push('response mentions 1981–2010 but has no `baseline`');
  return out;
}

// pace requests under the backend's per-IP limit (120 / minute) and honour Retry-After on 429
const GAP_MS = Number(process.env.CONTRACT_GAP_MS ?? 650);
let nextSlot = 0;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}
export async function getPaced(url: string): Promise<Response> {
  for (let i = 0; ; i++) {
    await slot();
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    if (res.status !== 429 || i >= 3) return res;
    const wait = Math.min(Number(res.headers.get('retry-after') ?? 10), 60) * 1000;
    nextSlot = Date.now() + wait;
  }
}

async function run(e: ManifestEntry): Promise<Result> {
  const params = new URLSearchParams();
  if (!['entity', 'reference', 'health', 'meta'].includes(e.kind)) params.set('period', '12M');
  for (const [k, v] of Object.entries(manifestParams(e))) if (v !== '') params.set(k, String(v));
  params.sort();
  const url = `${BASE}${manifestPath(e)}${params.size ? `?${params}` : ''}`;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await getPaced(url);
  } catch (err) {
    return { e, url, status: 'error', http: 0, ms: Date.now() - t0, notes: [`network: ${(err as Error).message}`] };
  }
  const ms = Date.now() - t0;
  const body = (await res.json().catch(() => ({}))) as Any;
  const rid = res.headers.get('x-request-id') ?? '';
  if (res.status === 501)
    return { e, url, status: 'unavailable', http: 501, ms, notes: [String(body.detail ?? body.error)] };
  if (!res.ok)
    return { e, url, status: 'error', http: res.status, ms, notes: [`${String(body.error ?? '')} [${rid}]`] };
  const s = SCHEMA[e.kind];
  const schema = typeof s === 'function' ? s(e) : s;
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return {
      e,
      url,
      status: 'schema',
      http: res.status,
      ms,
      notes: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  const notes = compare(e, body, mockFor(e, params));
  return { e, url, status: notes.length ? 'diff' : 'ok', http: res.status, ms, notes };
}

async function main() {
  const reqs = LIVE_REQUESTS.filter((e) => !filter || `${e.module}/${e.kind}/${e.key}`.includes(filter));
  console.log(`contract:check — ${reqs.length} requests against ${BASE}`);
  const results: Result[] = [];
  const queue = [...reqs];
  // 3 at a time keeps well under the backend's 120 requests / minute limit on a warm cache
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const e = queue.shift()!;
        const r = await run(e);
        results.push(r);
        const mark = { ok: '✔', diff: '△', unavailable: '·', schema: '✘', error: '✘' }[r.status];
        console.log(
          `${mark} ${String(r.http).padEnd(3)} ${r.url.replace(BASE, '')}${r.notes.length && r.status !== 'unavailable' ? `\n      ${r.notes.join('\n      ')}` : ''}`,
        );
      }
    }),
  );
  results.sort((a, b) => LIVE_REQUESTS.indexOf(a.e) - LIVE_REQUESTS.indexOf(b.e));
  const count = (s: Status) => results.filter((r) => r.status === s).length;
  const summary = `${count('ok')} ok · ${count('diff')} structural differences · ${count('unavailable')} unavailable (501) · ${count('schema')} schema failures · ${count('error')} errors`;
  console.log(`\n${summary}`);

  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const row = (r: Result) =>
    `| ${r.e.page} | \`${esc(r.url.replace(BASE, '').replace('/api/v1', ''))}\` | ${r.http} | ${r.status} | ${esc(r.notes.join('; '))} |`;
  const md = [
    '# Contract check',
    '',
    `Generated by \`npm run contract:check\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against ${BASE}.`,
    'Every request in `src/api/liveManifest.ts` is validated with the zod schemas in `src/types/api.ts` and compared',
    'with the mock response for the same request.',
    '',
    `**${summary}**`,
    '',
    '`diff` = validates, but differs structurally from what the UI expects (see notes). `unavailable` = 501',
    'DATA_UNAVAILABLE (the panel shows Sample / Not yet available).',
    '',
    '## Problems',
    '',
    '| Page | Request | HTTP | Status | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...results.filter((r) => ['schema', 'error', 'diff'].includes(r.status)).map(row),
    '',
    '## Unavailable (501)',
    '',
    '| Page | Request | HTTP | Status | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...results.filter((r) => r.status === 'unavailable').map(row),
    '',
    '## OK',
    '',
    results
      .filter((r) => r.status === 'ok')
      .map((r) => `\`${r.url.replace(BASE, '').replace('/api/v1', '')}\``)
      .join(' · '),
    '',
  ].join('\n');
  writeFileSync(resolve(ROOT, 'docs/backend/CONTRACT_CHECK.md'), md);
  console.log('→ docs/backend/CONTRACT_CHECK.md');
  if (count('schema') || count('error')) process.exitCode = 1;
}

void main();
