/**
 * Regional (scope-aggregated) hydro-meteorological series and the indices derived from them.
 * All indices are computed from the generated raw series — never invented independently.
 */
import { droughtClassFromSpi, type DroughtClass } from '@/config/thresholds';
import { memo } from '@/lib/prng';
import { mean, spei, spi, standardisedIndex, sum } from '@/lib/stats';
import { miMonth, miYear } from '@/lib/time';
import {
  CALIB,
  CELLS,
  END_MI,
  N_MONTHS,
  START_MI,
  aggregate,
  cellNdvi,
  cellPet,
  cellRain,
  cellTemp,
  cellWaterBalance,
} from './climate';
import type { ResolvedScope } from './scope';

export type Var = 'rain' | 'tmean' | 'tmax' | 'tmin' | 'pet' | 'sm' | 'smRoot' | 'aet' | 'runoff' | 'ndvi';

const cellVar: Record<Var, (i: number) => ArrayLike<number>> = {
  rain: cellRain,
  tmean: (i) => cellTemp(i).tmean,
  tmax: (i) => cellTemp(i).tmax,
  tmin: (i) => cellTemp(i).tmin,
  pet: cellPet,
  sm: (i) => cellWaterBalance(i).surface,
  smRoot: (i) => cellWaterBalance(i).root,
  aet: (i) => cellWaterBalance(i).aet,
  runoff: (i) => cellWaterBalance(i).runoff,
  ndvi: cellNdvi,
};

export function cellSeries(v: Var, i: number): ArrayLike<number> {
  return cellVar[v](i);
}

/** Area-weighted regional monthly series of a variable. */
export const regionSeries = memo(
  (scope: ResolvedScope, v: Var): Float64Array => aggregate(scope.cells, cellVar[v]),
  (scope, v) => `${scope.key}|${v}`,
);

/** Last complete month index (the current month is still in progress). */
export const LAST = END_MI - 1;
export const tOf = (mi: number) => mi - START_MI;

export const regionSpi = memo(
  (scope: ResolvedScope, k: number): (number | null)[] =>
    spi({ start: START_MI, values: Array.from(regionSeries(scope, 'rain')) }, k, CALIB),
  (scope, k) => `${scope.key}|spi${k}`,
);

export const regionSpei = memo(
  (scope: ResolvedScope, k: number): (number | null)[] => {
    const p = regionSeries(scope, 'rain');
    const e = regionSeries(scope, 'pet');
    return spei({ start: START_MI, values: Array.from(p, (v, i) => v - e[i]) }, k, CALIB);
  },
  (scope, k) => `${scope.key}|spei${k}`,
);

/** SSI from regional runoff (monthly). */
export const regionSsi = memo(
  (scope: ResolvedScope, k: number): (number | null)[] => {
    const r = regionSeries(scope, 'runoff');
    const acc = Array.from(r).map((_, i) => (i >= k - 1 ? sum(Array.from(r).slice(i - k + 1, i + 1)) : NaN));
    return standardisedIndex({ start: START_MI, values: acc }, CALIB);
  },
  (scope, k) => `${scope.key}|ssi${k}`,
);

/** Per-cell SPI, memoised over the last 48 months only (enough for maps and outlooks). */
const cellSpiCache = new Map<string, Float64Array>();
export function cellSpi(i: number, k: number, kind: 'spi' | 'spei' = 'spi'): Float64Array {
  const key = `${i}|${k}|${kind}`;
  const hit = cellSpiCache.get(key);
  if (hit) return hit;
  let full: (number | null)[];
  if (kind === 'spi') full = spi({ start: START_MI, values: Array.from(cellRain(i)) }, k, CALIB);
  else {
    const p = cellRain(i);
    const e = cellPet(i);
    full = spei({ start: START_MI, values: Array.from(p, (v, j) => v - e[j]) }, k, CALIB);
  }
  const tail = Float64Array.from(full.slice(-48), (v) => (v == null ? NaN : v));
  cellSpiCache.set(key, tail);
  return tail;
}
/** value of a 48-month tail at month index mi */
export function tailAt(tail: Float64Array, mi: number): number | null {
  const idx = tail.length - 1 - (END_MI - mi);
  const v = tail[idx];
  return v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100;
}

/** Monthly climatology (1981–2010) of a regional series: mean per calendar month. */
export const regionClimatology = memo(
  (scope: ResolvedScope, v: Var): number[] => {
    const s = regionSeries(scope, v);
    const acc = Array.from({ length: 12 }, () => [] as number[]);
    for (let t = 0; t < N_MONTHS; t++) {
      const mi = START_MI + t;
      const y = miYear(mi);
      if (y >= CALIB.from && y <= CALIB.to) acc[miMonth(mi)].push(s[t]);
    }
    return acc.map((a) => mean(a));
  },
  (scope, v) => `${scope.key}|clim|${v}`,
);

/** Climatological min / max per calendar month (whole record before the last 2 years). */
export const regionEnvelope = memo(
  (scope: ResolvedScope, v: Var): { min: number[]; max: number[]; p10: number[]; p90: number[] } => {
    const s = regionSeries(scope, v);
    const acc = Array.from({ length: 12 }, () => [] as number[]);
    for (let t = 0; t < N_MONTHS - 24; t++) acc[miMonth(START_MI + t)].push(s[t]);
    const q = (a: number[], p: number) => {
      const x = [...a].sort((m, n) => m - n);
      return x[Math.floor((x.length - 1) * p)];
    };
    return {
      min: acc.map((a) => Math.min(...a)),
      max: acc.map((a) => Math.max(...a)),
      p10: acc.map((a) => q(a, 0.1)),
      p90: acc.map((a) => q(a, 0.9)),
    };
  },
  (scope, v) => `${scope.key}|env|${v}`,
);

/** Sum of the last n complete months ending at `end`. */
export function sumMonths(s: ArrayLike<number>, endMi: number, n: number): number {
  let tot = 0;
  for (let mi = endMi - n + 1; mi <= endMi; mi++) tot += s[tOf(mi)];
  return tot;
}

/** Normal (1981–2010) rainfall for the n months ending at endMi. */
export function normalMonths(clim: number[], endMi: number, n: number): number {
  let tot = 0;
  for (let mi = endMi - n + 1; mi <= endMi; mi++) tot += clim[miMonth(mi)];
  return tot;
}

export function annualTotals(
  s: ArrayLike<number>,
  fromYear: number,
  toYear: number,
): { year: number; value: number }[] {
  const out: { year: number; value: number }[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    let tot = 0;
    for (let m = 0; m < 12; m++) tot += s[tOf(y * 12 + m)] ?? 0;
    out.push({ year: y, value: tot });
  }
  return out;
}

export function annualMeans(s: ArrayLike<number>, fromYear: number, toYear: number) {
  return annualTotals(s, fromYear, toYear).map((r) => ({ year: r.year, value: r.value / 12 }));
}

/** Area fraction (0–1) of a scope in each drought class at month mi, from per-cell SPI-k. */
export const droughtAreaFractions = memo(
  (scope: ResolvedScope, k: number, mi: number): Record<DroughtClass, number> => {
    const out: Record<DroughtClass, number> = { None: 0, D0: 0, D1: 0, D2: 0, D3: 0, D4: 0 };
    let tw = 0;
    for (const i of scope.cells) {
      const v = tailAt(cellSpi(i, k), mi);
      const w = CELLS[i].areaKm2;
      out[droughtClassFromSpi(v)] += w;
      tw += w;
    }
    (Object.keys(out) as DroughtClass[]).forEach((c) => (out[c] = out[c] / tw));
    return out;
  },
  (scope, k, mi) => `${scope.key}|daf|${k}|${mi}`,
);

/** Cumulative drought area (D0+ … ) as USDM-style "area in Dx or worse". */
export function areaInDrought(fr: Record<DroughtClass, number>, from: DroughtClass = 'D1'): number {
  const order: DroughtClass[] = ['D0', 'D1', 'D2', 'D3', 'D4'];
  return order.slice(order.indexOf(from)).reduce((s, c) => s + fr[c], 0);
}

/** National drought class as published: class of the area-weighted SPI-3 (rounded). */
export function scopeDroughtClass(scope: ResolvedScope, k = 3, mi = LAST): { spi: number; cls: DroughtClass } {
  const v = regionSpi(scope, k)[tOf(mi)] ?? 0;
  return { spi: Math.round(v * 100) / 100, cls: droughtClassFromSpi(v) };
}

// ------------------------------------------------------------------ vegetation condition
/** VCI (Kogan 1995): NDVI scaled between its record min and max for the same calendar month, 0–100%. */
export function vciFromNdvi(ndvi: ArrayLike<number>): Float64Array {
  const out = new Float64Array(ndvi.length);
  const mins = new Array(12).fill(Infinity);
  const maxs = new Array(12).fill(-Infinity);
  for (let t = 0; t < ndvi.length; t++) {
    const m = miMonth(START_MI + t);
    mins[m] = Math.min(mins[m], ndvi[t]);
    maxs[m] = Math.max(maxs[m], ndvi[t]);
  }
  for (let t = 0; t < ndvi.length; t++) {
    const m = miMonth(START_MI + t);
    out[t] = Math.round(((ndvi[t] - mins[m]) / (maxs[m] - mins[m] || 1)) * 1000) / 10;
  }
  return out;
}

/** TCI from temperature (inverted: hotter than usual → lower condition); extremes from the last 20 years. */
export function tciFromTemp(tmax: ArrayLike<number>): Float64Array {
  const out = new Float64Array(tmax.length);
  const mins = new Array(12).fill(Infinity);
  const maxs = new Array(12).fill(-Infinity);
  for (let t = Math.max(0, tmax.length - 240); t < tmax.length; t++) {
    const m = miMonth(START_MI + t);
    mins[m] = Math.min(mins[m], tmax[t]);
    maxs[m] = Math.max(maxs[m], tmax[t]);
  }
  for (let t = 0; t < tmax.length; t++) {
    const m = miMonth(START_MI + t);
    out[t] = Math.round(((maxs[m] - tmax[t]) / (maxs[m] - mins[m] || 1)) * 1000) / 10;
  }
  return out;
}

export const regionVci = memo(
  (scope: ResolvedScope) => vciFromNdvi(regionSeries(scope, 'ndvi')),
  (s) => `${s.key}|vci`,
);
export const regionTci = memo(
  (scope: ResolvedScope) => tciFromTemp(regionSeries(scope, 'tmax')),
  (s) => `${s.key}|tci`,
);
export const regionVhi = memo(
  (scope: ResolvedScope) => {
    const v = regionVci(scope);
    const t = regionTci(scope);
    return Float64Array.from(v, (x, i) => Math.round((0.5 * x + 0.5 * t[i]) * 10) / 10);
  },
  (s) => `${s.key}|vhi`,
);

const cellVciCache = new Map<number, Float64Array>();
export function cellVci(i: number): Float64Array {
  let v = cellVciCache.get(i);
  if (!v) {
    v = vciFromNdvi(cellNdvi(i));
    cellVciCache.set(i, v);
  }
  return v;
}

// ------------------------------------------------------------------ groundwater driver
/**
 * Regional groundwater driver: standardised 24-month accumulated effective rainfall (P − 0.3·PET), lagged
 * 3 months — groundwater responds slowly and late to rainfall (spec §3 cascade). Positive = wetter.
 */
export const regionGwDriver = memo(
  (scope: ResolvedScope): Float64Array => {
    const p = regionSeries(scope, 'rain');
    const e = regionSeries(scope, 'pet');
    const eff = Array.from(p, (v, i) => v - 0.3 * e[i]);
    const acc: number[] = eff.map((_, i) => (i >= 23 ? eff.slice(i - 23, i + 1).reduce((a, b) => a + b, 0) : NaN));
    const valid = acc.filter((v) => !Number.isNaN(v));
    const mu = mean(valid);
    const sdv = Math.sqrt(valid.reduce((s, v) => s + (v - mu) ** 2, 0) / valid.length);
    const out = new Float64Array(acc.length);
    for (let i = 0; i < acc.length; i++) {
      const j = Math.max(23, i - 3);
      out[i] = Number.isNaN(acc[j]) ? 0 : (acc[j] - mu) / sdv;
    }
    return out;
  },
  (s) => `${s.key}|gwdrv`,
);
