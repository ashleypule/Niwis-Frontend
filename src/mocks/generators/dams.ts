/**
 * Dam water-balance simulation (monthly, 1980 → current month).
 *   S(t) = S(t−1) + inflow − releases − evaporation − spill,  0 ≤ S ≤ capacity
 * Inflow = catchment runoff × catchment area (area sized so mean inflow ≈ capacity × turnover ratio).
 * Releases follow a seasonal demand pattern and are curtailed when storage is low (restriction rules).
 * %FSC is therefore always volume / capacity and is clamped to 0–100% (spills keep it ≤ 100%).
 */
import { damOperationalStatus, storageAlertLevel } from '@/config/thresholds';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean } from '@/lib/stats';
import { DAY_MS, daysInMonth, miMonth, miYear, monthIndex } from '@/lib/time';
import { APP } from '@/config/app';
import { DAM_REFS, type DamRef } from '../reference/dams';
import { CELLS, END_MI, START_MI, cellPet, cellWaterBalance, cellsNear } from './climate';
import { locate } from './scope';

export const DAM_START = monthIndex(1980, 0);

export interface Dam extends DamRef {
  province: string;
  wma: string;
  municipality: string;
  catchmentKm2: number;
  /** firm demand, Mm³/yr */
  demand: number;
  fsl: number;
  wallHeight: number;
  yearCompleted: number;
  category: 'Large' | 'Medium' | 'Small';
}

export interface DamSim {
  /** end-of-month storage Mm³ from DAM_START */
  storage: Float64Array;
  inflow: Float64Array;
  release: Float64Array;
  evap: Float64Array;
  spill: Float64Array;
}

const CATCHMENT_CENTRE: Record<string, [number, number]> = {
  'dam-gariep': [27.9, -30.3],
  'dam-vanderkloof': [27.6, -30.4],
  'dam-bloemhof': [28.4, -27.0],
  'dam-vaal': [28.9, -27.3],
  'dam-grootdraai': [29.6, -26.8],
  'dam-sterkfontein': [29.3, -28.7],
  'dam-katse': [29.0, -29.3],
  'dam-mohale': [28.9, -29.5],
};

export const DAMS: Dam[] = DAM_REFS.map((d) => {
  const loc = d.lesotho ? { province: 'LS', wma: 'WMA5', municipality: '' } : locate(d.lon, d.lat);
  const r = new Rng(`dam-meta-${d.id}`);
  const cap = d.capacity;
  return {
    ...d,
    ...loc,
    catchmentKm2: 0,
    demand: 0,
    fsl: Math.round(r.range(900, 1600) * (d.lat < -32 ? 0.3 : 1)),
    wallHeight: Math.round(clamp(18 + 22 * Math.log10(cap + 1) + r.range(-6, 8), 15, 185)),
    yearCompleted: Math.round(r.range(1935, 2012)),
    category: cap >= 100 ? 'Large' : cap >= 12 ? 'Medium' : 'Small',
  };
});

export const damById = new Map(DAMS.map((d) => [d.id, d]));

function catchmentCells(d: Dam): number[] {
  const [lon, lat] = CATCHMENT_CENTRE[d.id] ?? [d.lon, d.lat];
  return cellsNear(lon, lat, d.capacity > 500 ? 0.9 : 0.6);
}

export const simulateDam = memo((id: string): DamSim => {
  const d = damById.get(id)!;
  const r = new Rng(`dam-sim-${id}`);
  const cells = catchmentCells(d);
  const n = END_MI - DAM_START + 1;
  // regional runoff (mm/month) and lake evaporation (mm/month)
  const runoff = new Float64Array(n);
  const evapMm = new Float64Array(n);
  for (const i of cells) {
    const ro = cellWaterBalance(i).runoff;
    for (let t = 0; t < n; t++) runoff[t] += ro[DAM_START - START_MI + t] / cells.length;
  }
  const petCell = cellPet(cells[0]);
  for (let t = 0; t < n; t++) evapMm[t] = petCell[DAM_START - START_MI + t] * 0.8;
  // size catchment so mean inflow ≈ turnover × capacity
  const turnover =
    d.priority && d.capacity > 2000 ? r.range(0.75, 1.05) : d.capacity < 100 ? r.range(0.9, 2.0) : r.range(0.6, 1.35);
  const meanRunoffYr = mean(Array.from(runoff.slice(12, 12 * 31))) * 12 || 1;
  const area = (d.capacity * turnover * 1000) / meanRunoffYr;
  d.catchmentKm2 = Math.round(area);
  const yieldFrac = r.range(0.44, 0.68);
  d.demand = Math.round(d.capacity * turnover * yieldFrac * 10) / 10;
  // transfer schemes (Sterkfontein, Katse, Mohale, Vaal) keep a large share in storage: lower draft
  if (['dam-sterkfontein', 'dam-katse', 'dam-mohale'].includes(id)) d.demand *= 0.75;

  const storage = new Float64Array(n);
  const inflow = new Float64Array(n);
  const release = new Float64Array(n);
  const evap = new Float64Array(n);
  const spill = new Float64Array(n);
  let S = d.capacity * r.range(0.6, 0.9);
  const areaFull = 1.15 * Math.pow(d.capacity, 0.68); // km² at FSL
  for (let t = 0; t < n; t++) {
    const m = miMonth(DAM_START + t);
    const q = (runoff[t] * area) / 1000; // Mm³
    const pct = S / d.capacity;
    const restriction = pct < 0.15 ? 0.4 : pct < 0.3 ? 0.65 : pct < 0.5 ? 0.85 : 1;
    const seasonal = 1 + 0.25 * Math.cos(((m - 0.5) / 12) * 2 * Math.PI); // summer irrigation peak
    const rel = Math.min(S + q, (d.demand / 12) * seasonal * restriction * r.range(0.93, 1.07));
    const surf = areaFull * Math.pow(Math.max(0, S) / d.capacity, 0.67);
    const ev = Math.min(S + q - rel, (surf * evapMm[t]) / 1000);
    S = S + q - rel - ev;
    let sp = 0;
    if (S > d.capacity) {
      sp = S - d.capacity;
      S = d.capacity;
    }
    S = Math.max(S, 0);
    storage[t] = S;
    inflow[t] = q;
    release[t] = rel;
    evap[t] = Math.max(0, ev);
    spill[t] = sp;
  }
  return { storage, inflow, release, evap, spill };
});

const tD = (mi: number) => mi - DAM_START;

/** End-of-month %FSC series for a dam. */
export function damPctSeries(id: string): { mi: number; pct: number }[] {
  const d = damById.get(id)!;
  const s = simulateDam(id);
  return Array.from(s.storage, (v, t) => ({ mi: DAM_START + t, pct: (v / d.capacity) * 100 }));
}

/** Storage (Mm³) on a given UTC day, interpolated between month ends with a little daily texture. */
export function damStorageOnDay(id: string, dayMs: number): number {
  const s = simulateDam(id);
  const d = new Date(dayMs);
  const mi = monthIndex(d.getUTCFullYear(), d.getUTCMonth());
  const frac = d.getUTCDate() / daysInMonth(mi);
  const prev = s.storage[tD(mi - 1)] ?? s.storage[0];
  const cur = s.storage[tD(Math.min(mi, END_MI))] ?? prev;
  const dam = damById.get(id)!;
  const wiggle = Math.sin(dayMs / DAY_MS / 3.1 + dam.capacity) * 0.0015 * dam.capacity;
  return clamp(prev + (cur - prev) * frac + wiggle, 0, dam.capacity);
}

const asOfMs = APP.asOf.getTime();

export interface DamNow {
  id: string;
  volume: number;
  pct: number;
  lastYearPct: number;
  lastWeekPct: number;
  trend30: number;
  inflow7: number; // Mm³/day avg over 7 days
  outflow7: number;
  inflowMonth: number; // Mm³ current month (to date, scaled)
  outflowMonth: number;
  evapMonth: number;
  inflowCumecs: number;
  outflowCumecs: number;
  daysToEmpty: number | null;
  alert: ReturnType<typeof storageAlertLevel>;
  status: ReturnType<typeof damOperationalStatus>;
  longTermPct: number;
}

/** The single source of truth for a dam's current state (used by every page). */
export const damNow = memo((id: string): DamNow => {
  const d = damById.get(id)!;
  const s = simulateDam(id);
  const vol = damStorageOnDay(id, asOfMs);
  const pct = (vol / d.capacity) * 100;
  const v30 = damStorageOnDay(id, asOfMs - 30 * DAY_MS);
  const v7 = damStorageOnDay(id, asOfMs - 7 * DAY_MS);
  const vy = damStorageOnDay(id, asOfMs - 365 * DAY_MS);
  const cm = END_MI;
  const dim = daysInMonth(cm);
  const inflowDay = s.inflow[tD(cm)] / dim;
  const outDay = (s.release[tD(cm)] + s.spill[tD(cm)]) / dim;
  const evDay = s.evap[tD(cm)] / dim;
  const net = outDay + evDay - inflowDay;
  const lt =
    mean(Array.from({ length: 30 }, (_, k) => s.storage[tD(monthIndex(1991 + k, miMonth(cm)))] / d.capacity)) * 100;
  return {
    id,
    volume: Math.round(vol * 10) / 10,
    pct: Math.round(pct * 10) / 10,
    lastYearPct: Math.round((vy / d.capacity) * 1000) / 10,
    lastWeekPct: Math.round((v7 / d.capacity) * 1000) / 10,
    trend30: Math.round(((vol - v30) / d.capacity) * 1000) / 10,
    inflow7: Math.round(inflowDay * 100) / 100,
    outflow7: Math.round(outDay * 100) / 100,
    inflowMonth: Math.round(s.inflow[tD(cm)] * 10) / 10,
    outflowMonth: Math.round((s.release[tD(cm)] + s.spill[tD(cm)]) * 10) / 10,
    evapMonth: Math.round(s.evap[tD(cm)] * 10) / 10,
    inflowCumecs: Math.round(((inflowDay * 1e6) / 86400) * 10) / 10,
    outflowCumecs: Math.round(((outDay * 1e6) / 86400) * 10) / 10,
    daysToEmpty: net > 0 ? Math.round(vol / net) : null,
    alert: storageAlertLevel(pct),
    status: damOperationalStatus(pct, ((vol - v30) / d.capacity) * 100),
    longTermPct: Math.round(lt * 10) / 10,
  };
});

/** Σ volume / Σ capacity — the only way aggregate storage is computed. */
export function aggregateStorage(dams: Dam[]): { volume: number; capacity: number; pct: number } {
  const volume = dams.reduce((s, d) => s + damNow(d.id).volume, 0);
  const capacity = dams.reduce((s, d) => s + d.capacity, 0);
  return { volume, capacity, pct: capacity ? (volume / capacity) * 100 : 0 };
}

/** Aggregate %FSC at the end of month mi (for trends). */
export function aggregatePctAt(dams: Dam[], mi: number): number {
  const cap = dams.reduce((s, d) => s + d.capacity, 0);
  const vol = dams.reduce((s, d) => s + (simulateDam(d.id).storage[tD(mi)] ?? 0), 0);
  return (vol / cap) * 100;
}

export function aggregateFlows(dams: Dam[], mi: number): { inflow: number; outflow: number; evap: number } {
  let inflow = 0;
  let outflow = 0;
  let evap = 0;
  for (const d of dams) {
    const s = simulateDam(d.id);
    inflow += s.inflow[tD(mi)] ?? 0;
    outflow += (s.release[tD(mi)] ?? 0) + (s.spill[tD(mi)] ?? 0);
    evap += s.evap[tD(mi)] ?? 0;
  }
  return { inflow, outflow, evap };
}

export const damYear = (mi: number) => miYear(mi);
export { tD as damT };
export const damCells = (d: Dam) => catchmentCells(d).map((i) => CELLS[i]);
