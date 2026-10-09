import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '@/lib/prng';
import { spi } from '@/lib/stats';
import { formatNumber } from '@/lib/format';
import { DAMS, aggregateStorage, damNow, simulateDam } from '@/mocks/generators/dams';
import { cellRain } from '@/mocks/generators/climate';
import { LAST, regionSpi, tOf } from '@/mocks/generators/hydromet';
import { resolveScope } from '@/mocks/generators/scope';
import { droughtClassFromSpi } from '@/config/thresholds';

describe('seeded determinism', () => {
  it('same key → same sequence', () => {
    const a = new Rng('dam-gariep|storage');
    const b = new Rng('dam-gariep|storage');
    expect(Array.from({ length: 50 }, () => a.u())).toEqual(Array.from({ length: 50 }, () => b.u()));
    expect(hashString('x')).toBe(hashString('x'));
  });
  it('different keys diverge', () => {
    expect(new Rng('a').u()).not.toBe(new Rng('b').u());
  });
  it('generators return identical values on repeated calls', () => {
    expect(Array.from(cellRain(100).slice(-24))).toEqual(Array.from(cellRain(100).slice(-24)));
    expect(damNow('dam-gariep')).toEqual(damNow('dam-gariep'));
  });
});

describe('aggregation consistency', () => {
  it('national %FSC = Σ volume / Σ capacity = capacity-weighted mean of dam %FSC', () => {
    const agg = aggregateStorage(DAMS);
    const weighted =
      DAMS.reduce((s, d) => s + damNow(d.id).pct * d.capacity, 0) / DAMS.reduce((s, d) => s + d.capacity, 0);
    expect(agg.pct).toBeCloseTo(weighted, 1);
  });
  it('every dam: 0 ≤ %FSC ≤ 100, %FSC = volume / capacity, storage never exceeds capacity', () => {
    for (const d of DAMS) {
      const n = damNow(d.id);
      expect(n.pct).toBeGreaterThanOrEqual(0);
      expect(n.pct).toBeLessThanOrEqual(100);
      // pct is rounded to 0.1 pp and volume to 0.1 Mm³ → allow both rounding errors
      expect(Math.abs(n.pct - (n.volume / d.capacity) * 100)).toBeLessThanOrEqual(0.05 + 5 / d.capacity + 1e-9);
      expect(Math.max(...simulateDam(d.id).storage)).toBeLessThanOrEqual(d.capacity + 1e-6);
    }
  });
  it('drought class is derived from SPI', () => {
    const v = regionSpi(resolveScope({}), 6)[tOf(LAST)];
    expect(['None', 'D0', 'D1', 'D2', 'D3', 'D4']).toContain(droughtClassFromSpi(v));
  });
});

describe('statistics and formatting', () => {
  it('SPI of a stationary gamma series ≈ N(0,1) over the calibration period', () => {
    const r = new Rng('spi-test');
    const values = Array.from({ length: 12 * 60 }, () => r.gamma(2, 30));
    const s = spi({ start: 1960 * 12, values }, 3, { from: 1960, to: 2019 }).filter((v): v is number => v != null);
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    expect(Math.abs(m)).toBeLessThan(0.1);
    expect(sd).toBeGreaterThan(0.85);
    expect(sd).toBeLessThan(1.15);
  });
  it('formats numbers with SA conventions', () => {
    expect(formatNumber(1234567)).toBe('1 234 567');
    expect(formatNumber(-2.5, 1)).toBe('−2.5');
  });
});
