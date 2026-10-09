/** Seeded pseudo-random generation. Same key → same sequence, on every page and every reload. */

/** cyrb53-style 32-bit string hash. */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}

/** mulberry32 PRNG → uniform [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  private spare: number | null = null;

  constructor(key: string | number) {
    this.next = mulberry32(typeof key === 'number' ? key : hashString(key));
  }

  /** uniform [0,1) */
  u(): number {
    return this.next();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** weighted pick: weights need not sum to 1 */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  /** standard normal (Box–Muller) */
  normal(mean = 0, sd = 1): number {
    if (this.spare != null) {
      const s = this.spare;
      this.spare = null;
      return mean + sd * s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * r * Math.cos(2 * Math.PI * v);
  }
  /** gamma(shape k, scale θ) — Marsaglia & Tsang */
  gamma(k: number, theta = 1): number {
    if (k < 1) {
      const u = this.next() || 1e-12;
      return this.gamma(1 + k, theta) * Math.pow(u, 1 / k);
    }
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * x ** 4) return d * v * theta;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta;
    }
  }
  /** log-normal with given median and log-sd */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma));
  }
  beta(a: number, b: number): number {
    const x = this.gamma(a);
    const y = this.gamma(b);
    return x / (x + y);
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export const rng = (...parts: (string | number)[]) => new Rng(parts.join('|'));

/** Simple keyed memoisation for lazy generators. */
export function memo<A extends unknown[], R>(fn: (...args: A) => R, key: (...args: A) => string = (...a) => JSON.stringify(a)) {
  const cache = new Map<string, R>();
  const wrapped = (...args: A): R => {
    const k = key(...args);
    if (cache.has(k)) return cache.get(k)!;
    const v = fn(...args);
    cache.set(k, v);
    return v;
  };
  wrapped.clear = () => cache.clear();
  return wrapped;
}
