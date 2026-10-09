import '@testing-library/jest-dom/vitest';

// jsdom + Node fetch: resolve relative API URLs against the jsdom origin so MSW (node) can intercept them.
const nodeFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('/')) input = `${window.location.origin}${input}`;
  return nodeFetch(input, init);
}) as typeof fetch;

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
