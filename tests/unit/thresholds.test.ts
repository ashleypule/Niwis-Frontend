import { describe, expect, it } from 'vitest';
import {
  blueDropBand,
  droughtClassFromSpi,
  greenDropBand,
  roundHalfAway,
  sans241Pass,
  storageAlertLevel,
  wqiClass,
} from '@/config/thresholds';
import { classify, SCALES } from '@/config/palettes';

describe('SPI → drought class (spec §3.4)', () => {
  it.each([
    [0.3, 'None'],
    [-0.49, 'None'],
    [-0.5, 'D0'],
    [-0.79, 'D0'],
    [-0.8, 'D1'],
    [-1.29, 'D1'],
    [-1.3, 'D2'],
    [-1.59, 'D2'],
    [-1.6, 'D3'],
    [-1.99, 'D3'],
    [-2.0, 'D4'],
    [-3.1, 'D4'],
  ])('SPI %s → %s', (spi, cls) => expect(droughtClassFromSpi(spi)).toBe(cls));

  // the database stores 3-dp values as doubles: −1.295 is −1.29499999…; the published 2-dp value is −1.30 (D2).
  // Audit step 1: the backend rounds the decimal digits half away from zero; the frontend must agree.
  it.each([
    [-0.495, 'D0'],
    [-0.795, 'D1'],
    [-1.295, 'D2'],
    [-1.595, 'D3'],
    [-1.995, 'D4'],
    [-1.294, 'D1'],
    [-0.494, 'None'],
  ])('rounding tie %s → %s (decimal rounding, half away from zero)', (spi, cls) =>
    expect(droughtClassFromSpi(spi)).toBe(cls),
  );

  it('treats missing values as no drought', () => {
    expect(droughtClassFromSpi(null)).toBe('None');
    expect(droughtClassFromSpi(Number.NaN)).toBe('None');
  });
});

describe('roundHalfAway (the backend rnd rule)', () => {
  it.each([
    [-1.295, 2, -1.3],
    [1.295, 2, 1.3],
    [-1.294, 2, -1.29],
    [0.125, 2, 0.13],
    [-0.5, 0, -1],
    [2.5, 0, 3],
    [1.005, 2, 1.01],
    [1.055, 2, 1.06],
    [12.3, 2, 12.3],
    [-7, 2, -7],
  ])('%s to %s dp → %s', (x, dp, r) => expect(roundHalfAway(x, dp)).toBe(r));
  it('leaves non-finite values alone', () => {
    expect(roundHalfAway(Number.NaN, 2)).toBeNaN();
    expect(roundHalfAway(Infinity, 2)).toBe(Infinity);
  });
});

describe('the spi palette scale bins values like the classifier', () => {
  it('every dry-side bin agrees with droughtClassFromSpi, ties included', () => {
    for (let i = -3000; i < 995; i++) {
      const v = i / 1000; // −3.000 … 0.994 in 3-dp steps, as stored (the wet side has no class)
      const cls = droughtClassFromSpi(v);
      const bin = classify('spi', v);
      expect(bin?.id, `SPI ${v}`).toBe(cls);
    }
  });
  it('legend breakpoints are the spec thresholds between 2-dp values', () => {
    const dry = SCALES.spi.bins.filter((b) => b.id && b.id !== 'None').map((b) => b.max);
    expect(dry).toEqual([-1.995, -1.595, -1.295, -0.795, -0.495]);
    expect(SCALES.spi.round).toBe(2);
  });
});

describe('%FSC → storage alert level (spec §8.2)', () => {
  it.each([
    [80, 'None'],
    [50, 'None'],
    [49.9, 'L1'],
    [30, 'L1'],
    [29.9, 'L2'],
    [15, 'L2'],
    [14.9, 'L3'],
    [0, 'L3'],
  ])('%s%% → %s', (p, l) => expect(storageAlertLevel(p)).toBe(l));
});

describe('SANS 241 pass/fail (spec §14.1)', () => {
  it('turbidity ≤ 1 NTU', () => {
    expect(sans241Pass('turbidity', 1)).toBe(true);
    expect(sans241Pass('turbidity', 1.01)).toBe(false);
  });
  it('E. coli must be 0', () => {
    expect(sans241Pass('ecoli', 0)).toBe(true);
    expect(sans241Pass('ecoli', 1)).toBe(false);
  });
  it('pH and free chlorine are ranges', () => {
    expect(sans241Pass('ph', 5.9)).toBe(false);
    expect(sans241Pass('ph', 7.5)).toBe(true);
    expect(sans241Pass('ph', 9.1)).toBe(false);
    expect(sans241Pass('freeChlorine', 0.1)).toBe(false);
    expect(sans241Pass('freeChlorine', 0.5)).toBe(true);
  });
  it('chemical health limits', () => {
    expect(sans241Pass('nitrate', 11)).toBe(true);
    expect(sans241Pass('nitrate', 11.5)).toBe(false);
    expect(sans241Pass('fluoride', 1.6)).toBe(false);
    expect(sans241Pass('arsenic', 0.011)).toBe(false);
    expect(sans241Pass('lead', 0.009)).toBe(true);
  });
});

describe('WQI and compliance bands', () => {
  it.each([
    [95, 'Excellent'],
    [90, 'Excellent'],
    [89.9, 'Good'],
    [70, 'Good'],
    [55, 'Fair'],
    [30, 'Poor'],
    [10, 'Very Poor'],
  ])('WQI %s → %s', (v, c) => expect(wqiClass(v)).toBe(c));

  it('Green Drop / Blue Drop bands', () => {
    expect(greenDropBand(92)).toBe('Excellent');
    expect(greenDropBand(29)).toBe('Critical');
    expect(blueDropBand(95)).toBe('Excellent');
    expect(blueDropBand(72)).toBe('Moderate');
  });
});
