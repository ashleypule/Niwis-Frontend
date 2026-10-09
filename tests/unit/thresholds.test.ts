import { describe, expect, it } from 'vitest';
import { blueDropBand, droughtClassFromSpi, greenDropBand, sans241Pass, storageAlertLevel, wqiClass } from '@/config/thresholds';

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

  it('treats missing values as no drought', () => {
    expect(droughtClassFromSpi(null)).toBe('None');
    expect(droughtClassFromSpi(Number.NaN)).toBe('None');
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
