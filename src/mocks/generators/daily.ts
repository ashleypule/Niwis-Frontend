/**
 * Daily disaggregation of the monthly fields for "station" statistics (spec §4.1–4.2 ETCCDI indices).
 * Daily rain is zero-inflated: the number of wet days follows the monthly total, wet-day amounts are gamma
 * distributed and rescaled to the monthly total exactly (so daily and monthly series always agree).
 */
import { Rng, memo } from '@/lib/prng';
import { daysInMonth, miYear, monthIndex } from '@/lib/time';
import { CELLS, END_MI, START_MI, cellRain, cellTemp } from './climate';

export const cellDailyRain = memo((i: number, mi: number): number[] => {
  const total = cellRain(i)[mi - START_MI];
  const n = daysInMonth(mi);
  const r = new Rng(`dr-${i}-${mi}`);
  if (total <= 0.2) return new Array(n).fill(0);
  const c = CELLS[i];
  const meanWet = 4 + 9 * Math.min(1, c.map / 900);
  let wet = Math.round(Math.min(n - 2, Math.max(1, (total / meanWet) * r.range(0.7, 1.3))));
  if (wet < 1) wet = 1;
  const days = r.shuffle(Array.from({ length: n }, (_, d) => d)).slice(0, wet);
  const amounts = days.map(() => r.gamma(0.75, 1));
  const s = amounts.reduce((a, b) => a + b, 0);
  const out = new Array(n).fill(0);
  days.forEach((d, k) => (out[d] = Math.round((amounts[k] / s) * total * 10) / 10));
  return out;
});

export const cellDailyTmax = memo((i: number, mi: number): number[] => {
  const t = cellTemp(i).tmax[mi - START_MI];
  const r = new Rng(`dt-${i}-${mi}`);
  let a = 0;
  return Array.from({ length: daysInMonth(mi) }, () => {
    a = 0.65 * a + r.normal(0, 2.4);
    return Math.round((t + a) * 10) / 10;
  });
});
export const cellDailyTmin = memo((i: number, mi: number): number[] => {
  const t = cellTemp(i).tmin[mi - START_MI];
  const r = new Rng(`dtn-${i}-${mi}`);
  let a = 0;
  return Array.from({ length: daysInMonth(mi) }, () => {
    a = 0.6 * a + r.normal(0, 2.2);
    return Math.round((t + a) * 10) / 10;
  });
});

export interface Etccdi {
  year: number;
  prcptot: number;
  rx1day: number;
  rx5day: number;
  r10mm: number;
  r20mm: number;
  cdd: number;
  cwd: number;
  sdii: number;
  hotDays: number;
  frostDays: number;
  heatwaveMax: number;
}

/** ETCCDI indices for one cell ("station") and calendar year. */
export const cellEtccdi = memo((i: number, year: number): Etccdi => {
  const rain: number[] = [];
  const tx: number[] = [];
  const tn: number[] = [];
  for (let m = 0; m < 12; m++) {
    const mi = monthIndex(year, m);
    if (mi > END_MI) break;
    rain.push(...cellDailyRain(i, mi));
    tx.push(...cellDailyTmax(i, mi));
    tn.push(...cellDailyTmin(i, mi));
  }
  let cdd = 0;
  let cwd = 0;
  let run = 0;
  let wrun = 0;
  let hw = 0;
  let hrun = 0;
  rain.forEach((v) => {
    if (v < 1) {
      run++;
      wrun = 0;
    } else {
      wrun++;
      run = 0;
    }
    cdd = Math.max(cdd, run);
    cwd = Math.max(cwd, wrun);
  });
  tx.forEach((v) => {
    hrun = v > 35 ? hrun + 1 : 0;
    hw = Math.max(hw, hrun);
  });
  let rx5 = 0;
  for (let d = 0; d + 5 <= rain.length; d++)
    rx5 = Math.max(
      rx5,
      rain.slice(d, d + 5).reduce((a, b) => a + b, 0),
    );
  const wet = rain.filter((v) => v >= 1);
  return {
    year,
    prcptot: Math.round(wet.reduce((a, b) => a + b, 0)),
    rx1day: Math.max(0, ...rain),
    rx5day: Math.round(rx5),
    r10mm: rain.filter((v) => v >= 10).length,
    r20mm: rain.filter((v) => v >= 20).length,
    cdd,
    cwd,
    sdii: wet.length ? Math.round((wet.reduce((a, b) => a + b, 0) / wet.length) * 10) / 10 : 0,
    hotDays: tx.filter((v) => v > 35).length,
    frostDays: tn.filter((v) => v < 0).length,
    heatwaveMax: hw,
  };
});

/** Representative "stations" for a scope: up to n cells spread across it. */
export function stationCells(cells: number[], n = 24): number[] {
  if (cells.length <= n) return cells;
  const step = cells.length / n;
  return Array.from({ length: n }, (_, k) => cells[Math.floor(k * step)]);
}

export function scopeEtccdi(cells: number[], year: number): Etccdi {
  const st = stationCells(cells).map((i) => cellEtccdi(i, year));
  const avg = (k: keyof Etccdi) => st.reduce((s, e) => s + e[k], 0) / st.length;
  return {
    year,
    prcptot: Math.round(avg('prcptot')),
    rx1day: Math.max(...st.map((e) => e.rx1day)),
    rx5day: Math.max(...st.map((e) => e.rx5day)),
    r10mm: Math.round(avg('r10mm')),
    r20mm: Math.round(avg('r20mm')),
    cdd: Math.round(avg('cdd')),
    cwd: Math.round(avg('cwd') * 10) / 10,
    sdii: Math.round(avg('sdii') * 10) / 10,
    hotDays: Math.round(avg('hotDays')),
    frostDays: Math.round(avg('frostDays')),
    heatwaveMax: Math.round(avg('heatwaveMax')),
  };
}

export const yearOf = miYear;
