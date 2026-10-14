/**
 * Fetch wrapper for the NIWIS API.
 * - Base URL from VITE_API_BASE_URL (empty in mock mode: MSW intercepts same-origin /api/v1 calls).
 * - Auth header hook: call setAuthTokenProvider() once the identity provider is integrated.
 * - Every response is validated with zod; failures surface as ApiError('schema').
 */
import type { ZodType, ZodTypeDef } from 'zod';
import { APP, isLivePath } from '@/config/app';

export type ApiErrorKind = 'network' | 'http' | 'schema' | 'auth' | 'not-found';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let tokenProvider: (() => string | null | Promise<string | null>) | null = null;
export function setAuthTokenProvider(fn: typeof tokenProvider) {
  tokenProvider = fn;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, params: QueryParams = {}): string {
  // live paths go to the backend origin (empty in dev: the Vite proxy forwards /api); sample paths stay same-origin for MSW
  const base = isLivePath(path) ? APP.apiBaseUrl.replace(/\/$/, '') : '';
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
  500: 'The data service returned an error.',
  502: 'The data service is unavailable.',
  503: 'The data service is temporarily unavailable.',
};

export async function apiGet<T>(
  path: string,
  params: QueryParams,
  schema: ZodType<T, ZodTypeDef, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, params), { headers, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('network', 'Could not reach the data service. Check your connection.');
  }
  if (!res.ok) {
    let details: unknown;
    try {
      details = await res.json();
    } catch {
      /* body not JSON */
    }
    const kind: ApiErrorKind =
      res.status === 401 || res.status === 403 ? 'auth' : res.status === 404 ? 'not-found' : 'http';
    throw new ApiError(kind, MESSAGES[res.status] ?? `Request failed (${res.status}).`, res.status, details);
  }
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error('[api] schema validation failed', path, parsed.error.issues.slice(0, 5));
    throw new ApiError(
      'schema',
      'The data received did not match the expected format.',
      res.status,
      parsed.error.issues,
    );
  }
  return parsed.data;
}
