/**
 * Fetch wrapper for the NIWIS API.
 * - Live paths (isLivePath) go to VITE_API_BASE_URL (empty in dev: the Vite proxy forwards /api); sample paths stay
 *   same-origin, where MSW answers them.
 * - Every response is validated with zod and stamped with its provenance (live / sample / mock), so a panel can always
 *   tell the user where its numbers come from.
 * - 501 DATA_UNAVAILABLE is not an error: in `sample` mode the client fetches the sample version (marked Sample); in
 *   `empty` mode it throws a typed DataUnavailable that panels render as "Not yet available".
 * - Network failures and 5xx on live modules are errors (with the X-Request-Id). They never fall back to sample data.
 * - Auth header hook: call setAuthTokenProvider() once the identity provider is integrated.
 */
import type { ZodType, ZodTypeDef } from 'zod';
import { APP, isLivePath, usesMsw } from '@/config/app';
import { ApiErrorBodySchema, type ApiErrorBody } from '@/types/api';
import { normalizeVegClasses } from '@/lib/vegClasses';
import { liveParams } from './scope';

export type ApiErrorKind =
  'network' | 'timeout' | 'http' | 'schema' | 'auth' | 'not-found' | 'bad-request' | 'rate-limited' | 'unavailable';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public details?: unknown,
    /** X-Request-Id of the failed response, for support */
    public requestId?: string,
    public url?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 501 DATA_UNAVAILABLE: the database does not hold this data yet. Not a failure; panels show "Not yet available". */
export class DataUnavailable extends ApiError {
  constructor(
    public detail: string,
    public missing: string[],
    requestId?: string,
    url?: string,
  ) {
    super('unavailable', detail, 501, undefined, requestId, url);
    this.name = 'DataUnavailable';
  }
}

export const isUnavailable = (e: unknown): e is DataUnavailable =>
  e instanceof DataUnavailable || (e as ApiError | null)?.kind === 'unavailable';

/** Network errors, timeouts and 5xx are worth retrying; 4xx and 501 are answers. */
export function isRetryable(e: unknown): boolean {
  const err = e as ApiError | null;
  if (!err?.kind) return false;
  if (err.kind === 'network' || err.kind === 'timeout') return true;
  return err.kind === 'http' && (err.status ?? 0) >= 500 && err.status !== 501;
}

// ------------------------------------------------------------------ provenance
export type ProvenanceKind = 'live' | 'sample' | 'mock';
export interface Provenance {
  kind: ProvenanceKind;
  /** 501 detail when a live panel shows its sample version */
  detail?: string;
  missing?: string[];
  requestId?: string;
}
export const PROVENANCE_KEY = '_provenance';

/** Where a response came from (set by apiGet on every parsed response). */
export function provenanceOf(data: unknown): Provenance | undefined {
  if (!data || typeof data !== 'object') return undefined;
  return (data as Record<string, unknown>)[PROVENANCE_KEY] as Provenance | undefined;
}

function stamp<T>(data: T, p: Provenance): T {
  // enumerable string key: survives TanStack Query's structural sharing (symbols and non-enumerables don't)
  if (data && typeof data === 'object') (data as Record<string, unknown>)[PROVENANCE_KEY] = p;
  return data;
}

// ------------------------------------------------------------------ requests
let tokenProvider: (() => string | null | Promise<string | null>) | null = null;
export function setAuthTokenProvider(fn: typeof tokenProvider) {
  tokenProvider = fn;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Header asking MSW for the sample version of a live endpoint (see src/mocks/browser.ts). */
export const SAMPLE_HEADER = 'x-niwis-sample';

export function buildUrl(path: string, params: QueryParams = {}, live = isLivePath(path)): string {
  // live paths go to the backend origin (empty in dev: the Vite proxy forwards /api); sample paths stay same-origin for MSW
  const base = live ? APP.apiBaseUrl.replace(/\/$/, '') : '';
  const qs = new URLSearchParams();
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => qs.set(k, String(v)));
  const q = qs.toString();
  return `${base}${path}${q ? `?${q}` : ''}`;
}

const MESSAGES: Record<number, string> = {
  400: 'The request was not valid.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have access to this data.',
  404: 'This dataset is not available.',
  429: 'Too many requests. Please wait a moment.',
  500: 'The data service returned an error.',
  502: 'The data service is unavailable.',
  503: 'The data service is temporarily unavailable.',
  504: 'The data service took too long to respond.',
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** fetch with a timeout that also honours the caller's AbortSignal. */
async function fetchWithTimeout(url: string, init: RequestInit, signal: AbortSignal | undefined, timeoutMs: number) {
  const ctl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctl.abort(signal?.reason);
  if (signal?.aborted) ctl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ((timedOut = true), ctl.abort()), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (timedOut)
      throw new ApiError('timeout', 'The data service took too long to respond.', undefined, undefined, undefined, url);
    if (signal?.aborted || (e as Error).name === 'AbortError') throw e;
    throw new ApiError(
      'network',
      'Could not reach the data service. Check your connection.',
      undefined,
      undefined,
      undefined,
      url,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function readBody(res: Response): Promise<ApiErrorBody | undefined> {
  try {
    const parsed = ApiErrorBodySchema.safeParse(await res.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined; // body not JSON
  }
}

function retryAfterMs(res: Response): number {
  const h = res.headers.get('retry-after');
  const s = h ? Number(h) : NaN;
  if (Number.isFinite(s)) return Math.min(Math.max(s, 1), 30) * 1000;
  const d = h ? Date.parse(h) - Date.now() : NaN;
  return Number.isFinite(d) ? Math.min(Math.max(d, 1000), 30_000) : 2000;
}

export async function apiGet<T>(
  path: string,
  params: QueryParams,
  schema: ZodType<T, ZodTypeDef, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const live = isLivePath(path);
  const url = buildUrl(path, live ? liveParams(params) : params, live);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await fetchWithTimeout(url, { headers }, signal, APP.requestTimeoutMs);
  // 429: back off as the server asks (twice at most), then give up with a rate-limited error
  for (let i = 0; res.status === 429 && i < 2; i++) {
    await sleep(retryAfterMs(res), signal);
    res = await fetchWithTimeout(url, { headers }, signal, APP.requestTimeoutMs);
  }
  const requestId = res.headers.get('x-request-id') ?? undefined;

  if (!res.ok) {
    const body = await readBody(res);
    const rid = requestId ?? body?.requestId;
    if (res.status === 501 && (body?.code === 'DATA_UNAVAILABLE' || live)) {
      const detail = body?.detail ?? body?.error ?? 'This data is not available yet.';
      const missing = body?.missing ?? [];
      if (APP.unavailableMode === 'sample' && usesMsw) {
        const sample = await fetchSample(path, params, schema, signal);
        if (sample !== undefined) return stamp(sample, { kind: 'sample', detail, missing, requestId: rid });
      }
      throw new DataUnavailable(detail, missing, rid, url);
    }
    if (res.status === 400) console.warn('[api] 400 Bad Request', url, body);
    if (res.status === 404 && live) console.warn('[api] 404 on a live endpoint', url, body);
    const kind: ApiErrorKind =
      res.status === 401 || res.status === 403
        ? 'auth'
        : res.status === 404
          ? 'not-found'
          : res.status === 400
            ? 'bad-request'
            : res.status === 429
              ? 'rate-limited'
              : 'http';
    throw new ApiError(kind, MESSAGES[res.status] ?? `Request failed (${res.status}).`, res.status, body, rid, url);
  }

  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error('[api] schema validation failed', url, parsed.error.issues.slice(0, 5));
    throw new ApiError(
      'schema',
      'The data received did not match the expected format.',
      res.status,
      parsed.error.issues,
      requestId,
      url,
    );
  }
  const kind: ProvenanceKind = live ? 'live' : APP.dataSource === 'mock' ? 'mock' : 'sample';
  return stamp(normalizeVegClasses(parsed.data), { kind, requestId });
}

/** The sample (MSW) version of a live endpoint, with the user's original filters. Undefined if there is none. */
async function fetchSample<T>(
  path: string,
  params: QueryParams,
  schema: ZodType<T, ZodTypeDef, unknown>,
  signal?: AbortSignal,
): Promise<T | undefined> {
  try {
    const res = await fetch(buildUrl(path, params, false), {
      headers: { Accept: 'application/json', [SAMPLE_HEADER]: '1' },
      signal,
    });
    if (!res.ok) return undefined;
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? normalizeVegClasses(parsed.data) : undefined;
  } catch (e) {
    if (signal?.aborted) throw e;
    return undefined;
  }
}
