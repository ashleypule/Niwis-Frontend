/**
 * Generic MSW router for /api/v1/{module}/{kind}. Dispatches to the module registries in ./modules.
 * Responses are validated against the same zod schemas the client uses, so a mock that drifts from the
 * contract fails loudly (HTTP 500 with the zod issues) instead of silently rendering wrong data.
 */
import { delay, http, HttpResponse } from 'msw';
import type { ZodTypeAny } from 'zod';
import { APP } from '@/config/app';
import { isoToMi } from '@/lib/time';
import {
  AlertListSchema,
  CategorySetSchema,
  EntityDetailSchema,
  EntityListSchema,
  KpiSetSchema,
  MapLayerSchema,
  MatrixSetSchema,
  RefListSchema,
  SearchResultSchema,
  SeriesSetSchema,
  TableSetSchema,
} from '@/types/api';
import { resolveScope } from '../generators/scope';
import { END_MI } from '../generators/climate';
import { LAST_MONTH, asOfIso, periodMonths, type Ctx, type ModuleHandlers } from './build';
import { MODULE_HANDLERS } from './modules';
import { alertsHandler } from './alerts';
import { referenceHandler, searchHandler } from './reference';

function ctxOf(request: Request): Ctx {
  const url = new URL(request.url);
  const params = url.searchParams;
  const scope = resolveScope(params);
  const n = periodMonths(params, 12);
  let to = LAST_MONTH;
  let from = n === 0 ? LAST_MONTH - 12 * 30 : LAST_MONTH - n + 1;
  if (params.get('from')) from = Math.max(isoToMi(params.get('from')!), 1960 * 12);
  if (params.get('to')) to = Math.min(isoToMi(params.get('to')!), END_MI);
  if (from > to) from = to - 11;
  return { params, scope, last: LAST_MONTH, from, to, q: (k) => params.get(k) ?? undefined };
}

function ok(schema: ZodTypeAny, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error('[mock] response failed schema validation', parsed.error.issues.slice(0, 5), body);
    return HttpResponse.json({ error: 'Mock response failed schema validation', issues: parsed.error.issues.slice(0, 10) }, { status: 500 });
  }
  return HttpResponse.json(parsed.data);
}

const notFound = (what: string) => HttpResponse.json({ error: `Not found: ${what}` }, { status: 404 });

async function latency() {
  if (APP.mockLatencyMs > 0) await delay(APP.mockLatencyMs * (0.6 + Math.random() * 0.8));
}

type Kind = 'timeseries' | 'forecast' | 'breakdown' | 'table' | 'matrix' | 'map';
const KIND_SCHEMA: Record<Kind, ZodTypeAny> = {
  timeseries: SeriesSetSchema,
  forecast: SeriesSetSchema,
  breakdown: CategorySetSchema,
  table: TableSetSchema,
  matrix: MatrixSetSchema,
  map: MapLayerSchema,
};

function run<T>(fn: () => T): T | Response {
  try {
    return fn();
  } catch (e) {
    console.error('[mock] handler error', e);
    return HttpResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const handlers = [
  http.get('*/api/v1/alerts', async ({ request }) => {
    await latency();
    const r = run(() => alertsHandler(ctxOf(request)));
    return r instanceof Response ? r : ok(AlertListSchema, r);
  }),
  http.get('*/api/v1/reference/:type', async ({ request, params }) => {
    await latency();
    const r = run(() => referenceHandler(String(params.type), ctxOf(request)));
    return r instanceof Response ? r : r ? ok(RefListSchema, r) : notFound(String(params.type));
  }),
  http.get('*/api/v1/search', async ({ request }) => {
    await delay(Math.min(120, APP.mockLatencyMs));
    const r = run(() => searchHandler(new URL(request.url).searchParams.get('q') ?? ''));
    return r instanceof Response ? r : ok(SearchResultSchema, r);
  }),
  http.get('*/api/v1/:module/summary', async ({ request, params }) => {
    await latency();
    const mod = MODULE_HANDLERS[String(params.module)] as ModuleHandlers | undefined;
    if (!mod?.summary) return notFound(`${params.module}/summary`);
    const ctx = ctxOf(request);
    const r = run(() => ({ module: String(params.module), asOf: asOfIso(), scope: { level: ctx.scope.level, id: ctx.scope.id, name: ctx.scope.name }, kpis: mod.summary!(ctx) }));
    return r instanceof Response ? r : ok(KpiSetSchema, r);
  }),
  http.get('*/api/v1/:module/entities', async ({ request, params }) => {
    await latency();
    const mod = MODULE_HANDLERS[String(params.module)];
    if (!mod?.entities) return notFound(`${params.module}/entities`);
    const r = run(() => mod.entities!(ctxOf(request)));
    return r instanceof Response ? r : ok(EntityListSchema, r);
  }),
  http.get('*/api/v1/:module/entities/:id', async ({ request, params }) => {
    await latency();
    const mod = MODULE_HANDLERS[String(params.module)];
    if (!mod?.entity) return notFound(`${params.module}/entity`);
    const r = run(() => mod.entity!(ctxOf(request), String(params.id)));
    return r instanceof Response ? r : ok(EntityDetailSchema, r);
  }),
  http.get('*/api/v1/:module/:kind', async ({ request, params }) => {
    await latency();
    const kind = String(params.kind) as Kind;
    const mod = MODULE_HANDLERS[String(params.module)];
    const schema = KIND_SCHEMA[kind];
    if (!mod || !schema) return notFound(`${params.module}/${kind}`);
    const ctx = ctxOf(request);
    const key = kind === 'map' ? ctx.q('layer') : ctx.q('metric');
    const fn = (mod[kind] as Record<string, (c: Ctx) => unknown> | undefined)?.[key ?? ''];
    if (!fn) return notFound(`${params.module}/${kind}?${kind === 'map' ? 'layer' : 'metric'}=${key}`);
    const r = run(() => fn(ctx));
    return r instanceof Response ? r : ok(schema, r);
  }),
];

export { END_MI };
