/** fetch paced under the backend's per-IP rate limit (120 / minute), honouring Retry-After on 429. */
const GAP_MS = Number(process.env.BACKEND_GAP_MS ?? 650);
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
