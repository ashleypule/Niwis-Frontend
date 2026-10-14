/**
 * API client behaviour against the backend (hybrid mode): routing (isLive), 501 → DataUnavailable / Sample, errors never
 * falling back to sample data, and provenance stamping. The env is stubbed per test and the modules re-imported, because
 * src/config/app.ts reads it at import time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const Body = z.object({ id: z.string(), value: z.number().nullable() });

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const app = await import('@/config/app');
  const client = await import('@/api/client');
  return { ...app, ...client };
}

const HYBRID = {
  VITE_DATA_SOURCE: 'hybrid',
  VITE_LIVE_MODULES: 'rainfall,drought,climate,vegetation,runoff',
  VITE_LIVE_META: 'true',
};

const UNAVAILABLE = {
  error: 'Forecasts are not available yet.',
  code: 'DATA_UNAVAILABLE',
  detail: 'Forecasts are not available yet.',
  missing: ['forecast:rainfall'],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('isLive routing', () => {
  it('hybrid: only the listed modules, meta and the three reference lists are live', async () => {
    const { isLive, isLivePath, APP } = await load(HYBRID);
    expect(APP.dataSource).toBe('hybrid');
    expect(isLive('rainfall')).toBe(true);
    expect(isLive('dams')).toBe(false);
    expect(isLivePath('/api/v1/drought/summary')).toBe(true);
    expect(isLivePath('/api/v1/groundwater/summary')).toBe(false);
    expect(isLivePath('/api/v1/alerts')).toBe(false);
    expect(isLivePath('/api/v1/search')).toBe(false);
    expect(isLivePath('/api/v1/health')).toBe(true);
    expect(isLivePath('/api/v1/meta/coverage')).toBe(true);
    expect(isLivePath('/api/v1/reference/municipalities')).toBe(true);
    expect(isLivePath('/api/v1/reference/catchments')).toBe(false);
  });

  it('hybrid is the default when VITE_LIVE_MODULES is set; mock still means everything is mocked', async () => {
    expect((await load({ VITE_DATA_SOURCE: '', VITE_LIVE_MODULES: 'rainfall' })).APP.dataSource).toBe('hybrid');
    const mock = await load({ VITE_DATA_SOURCE: 'mock', VITE_LIVE_MODULES: 'rainfall' });
    expect(mock.isLive('rainfall')).toBe(false);
    expect(mock.isLivePath('/api/v1/health')).toBe(false);
  });

  it('api mode: everything is live and 501 can only be "empty"', async () => {
    const { isLive, isLivePath, APP } = await load({ VITE_DATA_SOURCE: 'api', VITE_UNAVAILABLE_MODE: 'sample' });
    expect(isLive('dams')).toBe(true);
    expect(isLivePath('/api/v1/alerts')).toBe(true);
    expect(APP.unavailableMode).toBe('empty');
  });
});

describe('501 DATA_UNAVAILABLE', () => {
  it('empty mode → typed DataUnavailable with detail and missing (no retry)', async () => {
    const { apiGet, DataUnavailable, isUnavailable, isRetryable } = await load({
      ...HYBRID,
      VITE_UNAVAILABLE_MODE: 'empty',
    });
    fetchMock.mockResolvedValueOnce(json(501, UNAVAILABLE, { 'x-request-id': 'abc123' }));
    const err = await apiGet('/api/v1/rainfall/forecast', { metric: 'rainfall' }, Body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataUnavailable);
    expect(isUnavailable(err)).toBe(true);
    expect(isRetryable(err)).toBe(false);
    expect(err).toMatchObject({ detail: UNAVAILABLE.detail, missing: ['forecast:rainfall'], requestId: 'abc123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sample mode → the sample version, marked Sample with the backend detail', async () => {
    const { apiGet, provenanceOf, SAMPLE_HEADER } = await load({ ...HYBRID, VITE_UNAVAILABLE_MODE: 'sample' });
    fetchMock
      .mockResolvedValueOnce(json(501, UNAVAILABLE))
      .mockResolvedValueOnce(json(200, { id: 'rainfall', value: 12 }));
    const data = await apiGet('/api/v1/rainfall/forecast', { metric: 'rainfall' }, Body);
    expect(data.value).toBe(12);
    expect(provenanceOf(data)).toMatchObject({ kind: 'sample', detail: UNAVAILABLE.detail });
    const sampleInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect((sampleInit.headers as Record<string, string>)[SAMPLE_HEADER]).toBe('1');
  });

  it('sample mode without a sample version → DataUnavailable', async () => {
    const { apiGet, isUnavailable } = await load({ ...HYBRID, VITE_UNAVAILABLE_MODE: 'sample' });
    fetchMock.mockResolvedValueOnce(json(501, UNAVAILABLE)).mockResolvedValueOnce(json(404, { error: 'Not found' }));
    const err = await apiGet('/api/v1/rainfall/forecast', {}, Body).catch((e: unknown) => e);
    expect(isUnavailable(err)).toBe(true);
  });
});

describe('errors never fall back to sample data', () => {
  it('5xx on a live module → retryable http error with the request id; no sample request', async () => {
    const { apiGet, ApiError, isRetryable } = await load({ ...HYBRID, VITE_UNAVAILABLE_MODE: 'sample' });
    fetchMock.mockResolvedValueOnce(
      json(500, { error: 'Internal server error', requestId: 'r-500' }, { 'x-request-id': 'r-500' }),
    );
    const err = await apiGet('/api/v1/drought/summary', {}, Body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status: 500, requestId: 'r-500' });
    expect(isRetryable(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('network failure → network error, retryable', async () => {
    const { apiGet, isRetryable } = await load(HYBRID);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await apiGet('/api/v1/drought/summary', {}, Body).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'network' });
    expect(isRetryable(err)).toBe(true);
  });

  it('400 → bad-request, not retried', async () => {
    const { apiGet, isRetryable } = await load(HYBRID);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(json(400, { error: 'bad', code: 'BAD_REQUEST', issues: [] }));
    const err = await apiGet('/api/v1/rainfall/timeseries', { metric: 'station' }, Body).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'bad-request', status: 400 });
    expect(isRetryable(err)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('429 → waits Retry-After, then succeeds', async () => {
    const { apiGet } = await load(HYBRID);
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json(429, { error: 'Too many requests', code: 'RATE_LIMITED' }, { 'retry-after': '1' }))
      .mockResolvedValueOnce(json(200, { id: 'x', value: 1 }));
    const p = apiGet('/api/v1/drought/summary', {}, Body);
    await vi.advanceTimersByTimeAsync(1100);
    await expect(p).resolves.toMatchObject({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('provenance stamping', () => {
  it('live, sample (non-live module in hybrid) and mock', async () => {
    let m = await load(HYBRID);
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { id: 'x', value: 1 })));
    expect(m.provenanceOf(await m.apiGet('/api/v1/rainfall/summary', {}, Body))?.kind).toBe('live');
    expect(m.provenanceOf(await m.apiGet('/api/v1/dams/summary', {}, Body))?.kind).toBe('sample');
    m = await load({ VITE_DATA_SOURCE: 'mock' });
    expect(m.provenanceOf(await m.apiGet('/api/v1/rainfall/summary', {}, Body))?.kind).toBe('mock');
  });

  it('live requests go to VITE_API_BASE_URL; sample requests stay same-origin', async () => {
    const m = await load({ ...HYBRID, VITE_API_BASE_URL: 'https://niwis.example/' });
    expect(m.buildUrl('/api/v1/rainfall/summary', { period: '12M' })).toBe(
      'https://niwis.example/api/v1/rainfall/summary?period=12M',
    );
    expect(m.buildUrl('/api/v1/dams/summary', {})).toBe('/api/v1/dams/summary');
  });
});
