/** fetch paced under the backend's per-IP rate limit (600 / minute), honouring Retry-After on 429. */
const GAP_MS = Number(process.env.BACKEND_GAP_MS ?? 120);
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
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      // a busy backend sometimes drops a connection (slow daily aggregates): one retry before reporting it
      if (i >= 1) throw e;
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (res.status !== 429 || i >= 3) return res;
    const wait = Math.min(Number(res.headers.get('retry-after') ?? 10), 60) * 1000;
    nextSlot = Date.now() + wait;
  }
}

/** LIVE_REQUESTS with every catalogue's chart groups added (one request per /categories entry). */
export async function withCategoryGroups<E extends { kind: string; module?: string }>(
  base: string,
  entries: E[],
  path: (e: E) => string,
  expand: (e: E, catalogue: { tables: { id: string; groups: { id: string }[] }[] }) => E[],
): Promise<E[]> {
  const out: E[] = [];
  for (const e of entries) {
    out.push(e);
    if (e.kind !== 'categories') continue;
    const res = await getPaced(`${base}${path(e)}`);
    if (!res.ok) {
      console.error(`  ${res.status} ${path(e)}: chart groups not expanded`);
      continue;
    }
    out.push(...expand(e, (await res.json()) as Parameters<typeof expand>[1]));
  }
  return out;
}
