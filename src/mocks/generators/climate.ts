/**
 * Synthetic but physically plausible climate for South Africa on the 0.25° grid.
 *
 * - Mean annual precipitation (MAP) field: west→east gradient + escarpment / Cape Fold / coastal bumps,
 *   calibrated to a national mean of ≈ 460 mm (spec §2.1: ≈ 450 mm).
 * - Rainfall regime: winter (SW Cape), all-year (southern coast), summer (rest).
 * - Monthly anomalies are spatially coherent: national + regional AR(1) latent signals + local noise.
 *   A deterministic recent dry spell over the west/centre gives realistic current drought conditions.
 * - Temperature: latitude + elevation proxy, seasonal cycle, +0.18 °C/decade trend, anti-correlated with rain.
 * - PET: Hargreaves (FAO-56 eq. 52). Soil moisture: monthly bucket. NDVI follows rain with a 1-month lag.
 *
 * Everything is lazily computed and memoised; any location is snapped to its grid cell so that grid, municipal,
 * provincial and national values are mutually consistent.
 */
import { APP } from '@/config/app';
import { Rng, hashString } from '@/lib/prng';
import { clamp, mean } from '@/lib/stats';
import { currentMonth, miMonth, miYear, monthIndex } from '@/lib/time';
import { GRID_CELLS, GRID_STEP } from '../reference/generated';

export const START_MI = monthIndex(APP.climateStartYear, 0);
export const END_MI = currentMonth(); // inclusive (current month, partially observed)
export const N_MONTHS = END_MI - START_MI + 1;
export const CALIB = APP.baseline;

const sig = (x: number) => 1 / (1 + Math.exp(-x));
const gauss = (lon: number, lat: number, cx: number, cy: number, s: number) => Math.exp(-((lon - cx) ** 2 + (lat - cy) ** 2) / (2 * s * s));

// ------------------------------------------------------------------ static fields
function rawMap(lon: number, lat: number): number {
  let v = 125 + 650 * sig((lon - 26.8) / 1.8);
  v *= 1 - 0.38 * sig((lat + 23.4) / 0.35); // dry far-north Limpopo valley
  v *= 1 - 0.25 * gauss(lon, lat, 29.2, -23.9, 1.0); // Limpopo plateau (Polokwane)
  v *= 1 - 0.2 * gauss(lon, lat, 23.5, -29.5, 2.2); // Bushmanland / Karoo core
  v -= 40 * gauss(lon, lat, 28.3, -26.2, 1.0); // Highveld
  v += 520 * gauss(lon, lat, 30.8, -25.0, 0.55); // Mpumalanga escarpment
  v += 480 * gauss(lon, lat, 30.3, -23.0, 0.4); // Soutpansberg
  v += 380 * gauss(lon, lat, 29.3, -29.3, 0.7); // Drakensberg
  v += 330 * gauss(lon, lat, 31.0, -29.9, 0.6); // KZN coast
  v += 260 * gauss(lon, lat, 29.6, -31.6, 0.8); // Wild Coast
  v += 420 * gauss(lon, lat, 23.6, -33.95, 0.45); // Tsitsikamma / Garden Route
  v += 260 * gauss(lon, lat, 22.4, -33.95, 0.4); // George / Outeniqua
  v += 820 * gauss(lon, lat, 19.1, -33.95, 0.38); // Cape Fold mountains
  v += 430 * gauss(lon, lat, 18.7, -33.9, 0.55); // Cape Peninsula / Boland
  v += 200 * gauss(lon, lat, 19.8, -34.2, 0.5); // Overberg
  v += 180 * gauss(lon, lat, 19.1, -32.4, 0.35); // Cederberg
  v -= 140 * gauss(lon, lat, 31.7, -24.0, 0.6); // Lowveld rain shadow
  return Math.max(35, v);
}

function rawElevation(lon: number, lat: number): number {
  let e = 1700 * gauss(lon, lat, 28.3, -26.6, 2.0); // Highveld
  e += 900 * gauss(lon, lat, 29.0, -29.3, 0.8); // Drakensberg
  e += 1250 * gauss(lon, lat, 23.2, -31.3, 2.4); // Great Karoo / escarpment
  e += 400 * gauss(lon, lat, 29.8, -24.2, 1.1); // Limpopo plateau
  e += 600 * gauss(lon, lat, 21.0, -28.5, 3.0); // NC plateau
  e -= 500 * gauss(lon, lat, 31.6, -24.5, 0.6); // Lowveld
  return clamp(e, 20, 2400);
}

const SUMMER = [0.17, 0.15, 0.13, 0.07, 0.03, 0.01, 0.01, 0.02, 0.04, 0.08, 0.13, 0.16];
const WINTER = [0.02, 0.02, 0.04, 0.08, 0.13, 0.16, 0.16, 0.14, 0.1, 0.07, 0.05, 0.03];
const ALLYEAR = [0.08, 0.09, 0.1, 0.09, 0.08, 0.07, 0.07, 0.08, 0.08, 0.09, 0.09, 0.08];

export interface CellClimate {
  lon: number;
  lat: number;
  province: string;
  wma: string;
  municipality: string;
  /** mean annual precipitation, mm */
  map: number;
  /** monthly share of annual rainfall */
  shares: number[];
  regime: 'summer' | 'winter' | 'all-year';
  elevation: number;
  /** annual mean temperature, °C (1981–2010) */
  tMean: number;
  /** seasonal half-amplitude, °C */
  tAmp: number;
  /** diurnal temperature range, °C */
  dtr: number;
  /** 0 (humid) … 1 (arid) */
  aridity: number;
  /** cell area km² */
  areaKm2: number;
}

let calibFactor = 0;

export const CELLS: CellClimate[] = (() => {
  const raw = GRID_CELLS.map(([lon, lat]) => rawMap(lon, lat));
  const areas = GRID_CELLS.map(([, lat]) => (GRID_STEP * 111.32) ** 2 * Math.cos((lat * Math.PI) / 180));
  const wMean = raw.reduce((s, v, i) => s + v * areas[i], 0) / areas.reduce((a, b) => a + b, 0);
  calibFactor = (462 / wMean) * 1.07; // compensates for zero months in arid cells
  return GRID_CELLS.map(([lon, lat, province, wma, municipality], i) => {
    const map = raw[i] * calibFactor;
    const w = clamp(sig((20.9 - lon) / 0.55) * sig((-31.0 - lat) / 0.45), 0, 1);
    const a = clamp(sig((-33.3 - lat) / 0.25) * sig((lon - 20.6) / 0.4) * sig((26.0 - lon) / 0.5) * (1 - w), 0, 1);
    const s = 1 - w - a;
    const sh = SUMMER.map((v, m) => w * WINTER[m] + a * ALLYEAR[m] + s * v);
    const tot = sh.reduce((x, y) => x + y, 0);
    const elevation = rawElevation(lon, lat);
    const aridity = clamp(1 - map / 900, 0, 1);
    const coast = Math.max(gauss(lon, lat, 18.5, -33.5, 1.2), gauss(lon, lat, 31.0, -29.8, 1.1), gauss(lon, lat, 25.5, -33.9, 1.2), gauss(lon, lat, 22.0, -34.0, 0.9));
    const tSea = 25.6 - 0.56 * (-lat - 22);
    const tMean = tSea - 0.0047 * elevation + 2.4 * aridity * (1 - coast);
    return {
      lon,
      lat,
      province,
      wma,
      municipality,
      map,
      shares: sh.map((v) => v / tot),
      regime: w > 0.5 ? 'winter' : a > 0.35 ? 'all-year' : 'summer',
      elevation,
      tMean,
      tAmp: 3.2 + 3.4 * (1 - coast) * (0.6 + 0.4 * aridity),
      dtr: 9 + 7 * aridity * (1 - coast) + 2 * (1 - coast),
      aridity,
      areaKm2: areas[i],
    };
  });
})();

export const CELL_TOTAL_AREA = CELLS.reduce((s, c) => s + c.areaKm2, 0);

/** Nearest grid cell index for any coordinate (points in Lesotho snap to the nearest SA cell). */
export function cellAt(lon: number, lat: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < CELLS.length; i++) {
    const d = (CELLS[i].lon - lon) ** 2 + (CELLS[i].lat - lat) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// ------------------------------------------------------------------ latent anomaly signals
function ar1(key: string, n: number, phi: number): Float64Array {
  const r = new Rng(key);
  const out = new Float64Array(n);
  const s = Math.sqrt(1 - phi * phi);
  let x = r.normal();
  for (let i = 0; i < n; i++) {
    x = phi * x + s * r.normal();
    out[i] = x;
  }
  return out;
}

/** National signal: fast weather noise + slow ENSO-like oscillation. */
const NATIONAL = (() => {
  const fast = ar1('national-fast', N_MONTHS, 0.35);
  const slow = ar1('national-enso', N_MONTHS, 0.94);
  const out = new Float64Array(N_MONTHS);
  for (let i = 0; i < N_MONTHS; i++) out[i] = 0.6 * fast[i] + 0.8 * slow[i];
  const sdv = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / N_MONTHS);
  for (let i = 0; i < N_MONTHS; i++) out[i] /= sdv;
  return out;
})();

/** Proxy ENSO index (Niño 3.4, °C) — negatively related to SA summer rainfall. */
export const NINO34 = (() => {
  const slow = ar1('national-enso', N_MONTHS, 0.94);
  return Array.from(slow, (v) => -0.85 * v);
})();

const ANCHORS: [number, number][] = [
  [18.8, -33.0],
  [22.5, -33.6],
  [20.5, -29.0],
  [25.0, -27.0],
  [26.5, -30.5],
  [28.5, -26.0],
  [29.5, -29.5],
  [27.5, -32.2],
  [30.5, -24.5],
  [29.0, -23.0],
  [31.5, -28.0],
];
const ANCHOR_SIG = ANCHORS.map((_, k) => ar1(`anchor-${k}`, N_MONTHS, 0.55));

/** Deterministic recent dry spell, strongest in the west and centre (scenario for the mock dashboards). */
function droughtBias(lon: number, lat: number, mi: number): number {
  const start = END_MI - 22;
  if (mi < start) return 0;
  const ramp = clamp((mi - start) / 5, 0, 1);
  const west = sig((26.8 - lon) / 1.4);
  const centre = gauss(lon, lat, 25.5, -28.5, 2.4);
  const eastRelief = gauss(lon, lat, 31.0, -27.0, 2.0);
  return -ramp * (0.3 + 0.62 * west + 0.6 * centre - 0.35 * eastRelief);
}

// ------------------------------------------------------------------ per-cell monthly series
const rainCache = new Map<number, Float64Array>();

/** Monthly rainfall (mm) for a grid cell from START_MI to END_MI inclusive. */
export function cellRain(i: number): Float64Array {
  const hit = rainCache.get(i);
  if (hit) return hit;
  const c = CELLS[i];
  const wts = ANCHORS.map(([x, y]) => Math.exp(-((x - c.lon) ** 2 + (y - c.lat) ** 2) / (2 * 2.6 * 2.6)));
  const tw = wts.reduce((a, b) => a + b, 0);
  const r = new Rng(`cell-rain-${i}`);
  const sigma = 0.45 + 0.45 * c.aridity;
  const out = new Float64Array(N_MONTHS);
  let local = r.normal();
  for (let t = 0; t < N_MONTHS; t++) {
    const mi = START_MI + t;
    let reg = 0;
    for (let k = 0; k < ANCHORS.length; k++) reg += wts[k] * ANCHOR_SIG[k][t];
    reg /= tw;
    local = 0.3 * local + 0.954 * r.normal();
    const z = 0.5 * NATIONAL[t] + 0.75 * reg + 0.45 * local + droughtBias(c.lon, c.lat, mi) * 1.0;
    const meanMonth = c.map * c.shares[miMonth(mi)];
    let v = meanMonth * Math.exp(sigma * z - (sigma * sigma) / 2);
    // dry months in arid places are frequently zero
    if (meanMonth < 8 && z < -0.4 + c.aridity * 0.3) v = 0;
    out[t] = Math.round(v * 10) / 10;
  }
  rainCache.set(i, out);
  return out;
}

/** Monthly temperature anomaly latent (°C) for a cell: trend + interannual + rainfall feedback. */
const tempCache = new Map<number, { tmean: Float64Array; tmax: Float64Array; tmin: Float64Array }>();

export function cellTemp(i: number) {
  const hit = tempCache.get(i);
  if (hit) return hit;
  const c = CELLS[i];
  const r = new Rng(`cell-temp-${i}`);
  const rain = cellRain(i);
  const trendPerYear = 0.016 + 0.008 * c.aridity + 0.004 * (1 - Math.abs(c.lat + 28) / 6);
  const tmean = new Float64Array(N_MONTHS);
  const tmax = new Float64Array(N_MONTHS);
  const tmin = new Float64Array(N_MONTHS);
  let a = 0;
  for (let t = 0; t < N_MONTHS; t++) {
    const mi = START_MI + t;
    const m = miMonth(mi);
    const yr = miYear(mi) + m / 12;
    a = 0.55 * a + 0.835 * r.normal(0, 0.55);
    const expected = c.map * c.shares[m];
    const rainEffect = expected > 5 ? -0.5 * clamp(Math.log((rain[t] + 1) / (expected + 1)), -2, 2) : 0;
    const seasonal = c.tAmp * Math.cos(((m - 0.5) / 12) * 2 * Math.PI); // warmest mid-Jan
    const v = c.tMean + seasonal + trendPerYear * (yr - 1995.5) + a + rainEffect;
    tmean[t] = Math.round(v * 100) / 100;
    const dtr = c.dtr * (1 + 0.08 * Math.cos(((m - 8) / 12) * 2 * Math.PI)) + rainEffect * 0.6;
    tmax[t] = Math.round((v + dtr / 2) * 100) / 100;
    tmin[t] = Math.round((v - dtr / 2) * 100) / 100;
  }
  const res = { tmean, tmax, tmin };
  tempCache.set(i, res);
  return res;
}

/** Extraterrestrial radiation Ra (MJ m⁻² day⁻¹), FAO-56 eq. 21, mid-month. */
function ra(latDeg: number, month0: number): number {
  const J = Math.round(30.4 * month0 + 15);
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * J) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * J) / 365 - 1.39);
  const ws = Math.acos(clamp(-Math.tan(phi) * Math.tan(delta), -1, 1));
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const petCache = new Map<number, Float64Array>();
/** Monthly reference ET₀ (mm) by Hargreaves. */
export function cellPet(i: number): Float64Array {
  const hit = petCache.get(i);
  if (hit) return hit;
  const c = CELLS[i];
  const { tmean, tmax, tmin } = cellTemp(i);
  const out = new Float64Array(N_MONTHS);
  for (let t = 0; t < N_MONTHS; t++) {
    const m = miMonth(START_MI + t);
    const dtr = Math.max(4, tmax[t] - tmin[t]);
    const et = 0.0023 * 0.408 * ra(c.lat, m) * (tmean[t] + 17.8) * Math.sqrt(dtr);
    out[t] = Math.round(et * DAYS[m] * 10) / 10;
  }
  petCache.set(i, out);
  return out;
}

const smCache = new Map<number, { surface: Float64Array; root: Float64Array; aet: Float64Array; runoff: Float64Array }>();
/**
 * Monthly soil-water bucket (capacity 120 mm) → surface & root-zone volumetric soil moisture (m³/m³),
 * actual ET and runoff (mm). Runoff = quickflow (saturation excess, rainfall-intensity term) + baseflow.
 */
export function cellWaterBalance(i: number) {
  const hit = smCache.get(i);
  if (hit) return hit;
  const c = CELLS[i];
  const P = cellRain(i);
  const PET = cellPet(i);
  const cap = 120;
  const surface = new Float64Array(N_MONTHS);
  const root = new Float64Array(N_MONTHS);
  const aet = new Float64Array(N_MONTHS);
  const runoff = new Float64Array(N_MONTHS);
  let S = cap * 0.4;
  let G = 20; // groundwater store for baseflow
  const quickCoef = 0.011 + 0.172 * Math.pow(c.map / 1000, 1.7);
  for (let t = 0; t < N_MONTHS; t++) {
    const p = P[t];
    const quick = p * quickCoef * (0.4 + 1.2 * (S / cap));
    const infil = p - quick;
    S += infil;
    const e = Math.min(S, PET[t] * 0.85 * Math.min(1, (S / cap) * 1.6));
    S -= e;
    let perc = 0;
    if (S > cap) {
      perc = S - cap;
      S = cap;
    }
    G += perc * 0.8 + infil * 0.01 * (c.map / 1000);
    const base = G * 0.08;
    G -= base;
    aet[t] = Math.round(e * 10) / 10;
    runoff[t] = Math.round((quick + base) * 100) / 100;
    surface[t] = Math.round((0.03 + 0.34 * clamp((S + 0.35 * p) / (cap * 1.15), 0, 1)) * 1000) / 1000;
  }
  // root zone responds more slowly
  let rz = surface[0];
  for (let t = 0; t < N_MONTHS; t++) {
    rz = 0.7 * rz + 0.3 * surface[t];
    root[t] = Math.round((rz * 0.95 + 0.02) * 1000) / 1000;
  }
  const res = { surface, root, aet, runoff };
  smCache.set(i, res);
  return res;
}

const ndviCache = new Map<number, Float64Array>();
/** Monthly NDVI (−1…+1): base greenness from MAP, seasonal cycle following rain with a 1-month lag. */
export function cellNdvi(i: number): Float64Array {
  const hit = ndviCache.get(i);
  if (hit) return hit;
  const c = CELLS[i];
  const P = cellRain(i);
  const r = new Rng(`ndvi-${i}`);
  const base = 0.1 + 0.62 * (1 - Math.exp(-c.map / 650));
  const amp = 0.08 + 0.2 * (1 - c.aridity) * (c.regime === 'all-year' ? 0.4 : 1);
  const out = new Float64Array(N_MONTHS);
  let mem = 0;
  for (let t = 0; t < N_MONTHS; t++) {
    const m = miMonth(START_MI + t);
    const lagM = (m + 11) % 12;
    const seasonal = (c.shares[lagM] * 12 - 1) * amp * 0.5;
    const expected = c.map * c.shares[lagM];
    const prev = t > 0 ? P[t - 1] : expected;
    const anom = clamp(Math.log((prev + 5) / (expected + 5)), -2, 2);
    mem = 0.6 * mem + 0.4 * anom;
    const v = base + seasonal + 0.06 * mem * (0.5 + c.aridity) + r.normal(0, 0.012);
    out[t] = Math.round(clamp(v, -0.05, 0.92) * 1000) / 1000;
  }
  ndviCache.set(i, out);
  return out;
}

// ------------------------------------------------------------------ aggregation
/** Area-weighted mean of a per-cell monthly series over a set of cells. */
export function aggregate(cells: number[], fn: (i: number) => ArrayLike<number>): Float64Array {
  const out = new Float64Array(N_MONTHS);
  let tw = 0;
  for (const i of cells) {
    const s = fn(i);
    const w = CELLS[i].areaKm2;
    tw += w;
    for (let t = 0; t < N_MONTHS; t++) out[t] += s[t] * w;
  }
  for (let t = 0; t < N_MONTHS; t++) out[t] = Math.round((out[t] / tw) * 1000) / 1000;
  return out;
}

export const ALL_CELLS = CELLS.map((_, i) => i);

/** Cells within radius (degrees) of a point — used for point entities that represent a catchment. */
export function cellsNear(lon: number, lat: number, radiusDeg: number): number[] {
  const out: number[] = [];
  CELLS.forEach((c, i) => {
    if ((c.lon - lon) ** 2 + (c.lat - lat) ** 2 <= radiusDeg * radiusDeg) out.push(i);
  });
  return out.length ? out : [cellAt(lon, lat)];
}

/** Stable per-entity key → seed helper. */
export const seedOf = (s: string) => hashString(s);

/** Mean of the last n values. */
export const tailMean = (a: ArrayLike<number>, n: number, end = a.length) => mean(Array.from(a).slice(end - n, end));

/** Index into monthly arrays for a month index. */
export const tIdx = (mi: number) => mi - START_MI;
