/**
 * Boreholes (National Groundwater Archive style) and aquifers.
 * Level (m bgl) = base depth + seasonal fluctuation lagging rainfall − response × regional groundwater driver
 *                 + abstraction-driven decline + noise.  SGI is derived from the level series (inverted).
 */
import { boreholeStatus, exploitationClass } from '@/config/thresholds';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, sensSlope, standardisedIndex } from '@/lib/stats';
import { miMonth, miYear, monthIndex } from '@/lib/time';
import { CELLS, END_MI, START_MI } from './climate';
import { regionGwDriver, LAST } from './hydromet';
import { resolveScope } from './scope';

export type AquiferType = 'Karoo (Fractured)' | 'Karoo (Intergranular)' | 'Table Mountain Group' | 'Dolomite' | 'Cape Flats' | 'Kalahari' | 'Basement (Weathered)' | 'Basement (Fractured)' | 'Coastal' | 'Alluvial';

export interface AquiferDef {
  id: string;
  name: string;
  type: AquiferType;
  /** typical base depth range (m bgl) */
  depth: [number, number];
  transmissivity: [number, number];
  storativity: string;
  /** saturated thickness (m) */
  thickness: [number, number];
}

export const AQUIFERS: AquiferDef[] = [
  { id: 'aq-karoo-f', name: 'Karoo (Fractured)', type: 'Karoo (Fractured)', depth: [18, 55], transmissivity: [1, 50], storativity: '0.001–0.005', thickness: [20, 200] },
  { id: 'aq-karoo-i', name: 'Karoo (Intergranular)', type: 'Karoo (Intergranular)', depth: [12, 40], transmissivity: [5, 80], storativity: '0.01–0.05', thickness: [15, 120] },
  { id: 'aq-tmg', name: 'Table Mountain Group', type: 'Table Mountain Group', depth: [10, 35], transmissivity: [10, 200], storativity: '0.0005–0.002', thickness: [100, 900] },
  { id: 'aq-dolomite', name: 'Dolomite (Malmani)', type: 'Dolomite', depth: [15, 45], transmissivity: [100, 2000], storativity: '0.01–0.08', thickness: [50, 1000] },
  { id: 'aq-cape-flats', name: 'Cape Flats', type: 'Cape Flats', depth: [2, 7], transmissivity: [50, 500], storativity: '0.1–0.2', thickness: [10, 50] },
  { id: 'aq-kalahari', name: 'Kalahari', type: 'Kalahari', depth: [40, 110], transmissivity: [5, 150], storativity: '0.002–0.02', thickness: [20, 250] },
  { id: 'aq-basement-w', name: 'Basement (Weathered)', type: 'Basement (Weathered)', depth: [8, 25], transmissivity: [2, 40], storativity: '0.005–0.03', thickness: [10, 60] },
  { id: 'aq-basement-f', name: 'Basement (Fractured)', type: 'Basement (Fractured)', depth: [15, 45], transmissivity: [1, 30], storativity: '0.0005–0.003', thickness: [20, 150] },
  { id: 'aq-coastal', name: 'Coastal (Maputaland / Zululand)', type: 'Coastal', depth: [3, 12], transmissivity: [100, 1000], storativity: '0.1–0.25', thickness: [20, 80] },
  { id: 'aq-alluvial', name: 'Alluvial', type: 'Alluvial', depth: [3, 10], transmissivity: [50, 800], storativity: '0.05–0.2', thickness: [5, 30] },
];

function aquiferAt(lon: number, lat: number, r: Rng): AquiferDef {
  const byType = (t: AquiferType) => AQUIFERS.find((a) => a.type === t)!;
  if (lat < -33.85 && lon > 18.4 && lon < 18.8) return byType('Cape Flats');
  if (r.bool(0.08)) return byType('Alluvial');
  if (lat > -28 && lon < 23.8) return byType('Kalahari');
  if (lon > 32.0 && lat > -28.8) return byType('Coastal');
  if (lon > 26.3 && lon < 28.8 && lat > -26.9 && lat < -24.9) return r.bool(0.6) ? byType('Dolomite') : byType('Basement (Weathered)');
  if (lat < -32.6 && lon < 25.5) return byType('Table Mountain Group');
  if (lat > -25.8 && lon > 28.5) return r.bool(0.55) ? byType('Basement (Weathered)') : byType('Basement (Fractured)');
  return r.bool(0.7) ? byType('Karoo (Fractured)') : byType('Karoo (Intergranular)');
}

export interface Borehole {
  id: string;
  name: string;
  lat: number;
  lon: number;
  province: string;
  wma: string;
  municipality: string;
  cell: number;
  aquifer: AquiferDef;
  base: number;
  amp: number;
  response: number;
  trend: number;
  depthDrilled: number;
  screen: string;
  /** abstraction m³/day at the site */
  abstraction: number;
  use: 'Municipal' | 'Agriculture' | 'Industrial' | 'Mining' | 'Monitoring';
}

export const GW_START = monthIndex(1995, 0);

const N_BOREHOLES = 1480;

export const BOREHOLES: Borehole[] = (() => {
  const r = new Rng('boreholes-v1');
  const w = CELLS.map((c) => 0.35 + c.aridity * 0.9 + (c.province === 'GP' ? 0.6 : 0));
  const idx = CELLS.map((_, i) => i);
  const counters: Record<string, number> = {};
  const out: Borehole[] = [];
  for (let k = 0; k < N_BOREHOLES; k++) {
    const ci = r.weighted(idx, w);
    const c = CELLS[ci];
    const lat = c.lat + r.range(-0.12, 0.12);
    const lon = c.lon + r.range(-0.12, 0.12);
    const aq = aquiferAt(lon, lat, r);
    counters[c.province] = (counters[c.province] ?? 0) + 1;
    const nga = r.bool(0.35);
    const id = nga ? `H${String(r.int(1, 99)).padStart(2, '0')}-${String(r.int(1, 9999)).padStart(4, '0')}` : `BH-${c.province}-${String(counters[c.province]).padStart(4, '0')}`;
    const base = r.range(aq.depth[0], aq.depth[1]) * (1 + c.aridity * 0.35);
    const use = r.weighted(['Municipal', 'Agriculture', 'Industrial', 'Mining', 'Monitoring'] as const, [0.3, 0.38, 0.06, 0.06, 0.2]);
    out.push({
      id,
      name: id,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      province: c.province,
      wma: c.wma,
      municipality: c.municipality,
      cell: ci,
      aquifer: aq,
      base,
      amp: r.range(0.4, 2.2) * (aq.type === 'Cape Flats' || aq.type === 'Coastal' || aq.type === 'Alluvial' ? 0.6 : 1),
      response: r.range(0.7, 3.2) * (aq.type === 'Kalahari' || aq.type === 'Dolomite' ? 1.5 : 1),
      trend: use === 'Monitoring' ? r.range(-0.04, 0.06) : r.range(0, 0.22) * (c.aridity + 0.3),
      depthDrilled: Math.round(base * r.range(2, 4) + 20),
      screen: '',
      abstraction: use === 'Monitoring' ? 0 : Math.round(r.lognormal(use === 'Municipal' ? 180 : use === 'Mining' ? 300 : 90, 0.7)),
      use,
    });
  }
  // make ids unique (NGA style ids may collide)
  const seen = new Set<string>();
  out.forEach((b) => {
    while (seen.has(b.id)) b.id = `${b.id}A`;
    b.name = b.id;
    seen.add(b.id);
    const top = Math.round(b.base * 1.4);
    b.screen = `${top} – ${top + Math.round(b.depthDrilled * 0.35)}`;
  });
  return out;
})();

export const boreholeById = new Map(BOREHOLES.map((b) => [b.id, b]));

/** Monthly level (m bgl) from GW_START to END_MI. */
export const boreholeLevels = memo((id: string): Float64Array => {
  const b = boreholeById.get(id)!;
  const drv = regionGwDriver(resolveScope({ province: b.province }));
  const r = new Rng(`bh-${id}`);
  const n = END_MI - GW_START + 1;
  const out = new Float64Array(n);
  let noise = 0;
  const shares = CELLS[b.cell].shares;
  for (let t = 0; t < n; t++) {
    const mi = GW_START + t;
    const m = miMonth(mi);
    // seasonal: shallowest ~3 months after the rainy-season peak
    const lagShare = shares[(m + 9) % 12] + shares[(m + 10) % 12];
    const seasonal = -b.amp * (lagShare * 6 - 1);
    noise = 0.7 * noise + r.normal(0, 0.18);
    const v = b.base + seasonal - b.response * drv[mi - START_MI] + b.trend * (miYear(mi) - 2010 + m / 12) + noise;
    out[t] = Math.round(clamp(v, 0.5, b.depthDrilled - 3) * 100) / 100;
  }
  return out;
});

export const boreholeSgi = memo((id: string) => standardisedIndex({ start: GW_START, values: Array.from(boreholeLevels(id)) }, { from: 1995, to: 2020 }, true));

export interface BoreholeNow {
  level: number;
  lastYear: number;
  lastMonth: number;
  longTerm: number;
  anomaly: number;
  sgi: number;
  status: ReturnType<typeof boreholeStatus>;
  trendPerYear: number;
  trendClass: 'Rising' | 'Stable' | 'Declining';
}

export const boreholeNow = memo((id: string): BoreholeNow => {
  const L = boreholeLevels(id);
  const t = LAST - GW_START;
  const level = L[t];
  const m = miMonth(LAST);
  const lt = mean(Array.from({ length: 20 }, (_, k) => L[monthIndex(2000 + k, m) - GW_START]));
  const sgi = boreholeSgi(id)[t] ?? 0;
  const last36 = Array.from(L.slice(t - 35, t + 1));
  const slope = sensSlope(last36) * 12;
  return {
    level,
    lastYear: L[t - 12],
    lastMonth: L[t - 1],
    longTerm: Math.round(lt * 10) / 10,
    anomaly: Math.round((lt - level) * 10) / 10,
    sgi: Math.round(sgi * 100) / 100,
    status: boreholeStatus(sgi),
    trendPerYear: Math.round(slope * 100) / 100,
    trendClass: slope > 0.25 ? 'Declining' : slope < -0.25 ? 'Rising' : 'Stable',
  };
});

export function gwT(mi: number) {
  return mi - GW_START;
}

// ------------------------------------------------------------------ aquifer reserve accounting (spec §11)
export interface AquiferUnit {
  id: string;
  name: string;
  aquifer: AquiferDef;
  province: string;
  areaKm2: number;
  rechargeMm: number;
  recharge: number; // Mm³/yr
  abstraction: number; // Mm³/yr
  ecologicalReserve: number; // Mm³/yr
  dynamicReserve: number; // Mm³/yr (renewable = recharge − ecological reserve)
  staticReserve: number; // Mm³
  ei: number;
  eiClass: ReturnType<typeof exploitationClass>;
  sustainableYield: number;
  boreholes: number;
}

/** Aquifer units = aquifer type × province (≈ 50–60 units). Recharge from MAP (Vegter-style ≈ 2–8% of rainfall). */
export const AQUIFER_UNITS: AquiferUnit[] = (() => {
  const groups = new Map<string, Borehole[]>();
  for (const b of BOREHOLES) {
    const k = `${b.aquifer.id}|${b.province}`;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const units: AquiferUnit[] = [];
  for (const [k, bhs] of groups) {
    if (bhs.length < 4) continue;
    const [aqId, prov] = k.split('|');
    const aq = AQUIFERS.find((a) => a.id === aqId)!;
    const r = new Rng(`aqu-${k}`);
    const cells = new Set(bhs.map((b) => b.cell));
    const areaKm2 = Math.round([...cells].reduce((s, i) => s + CELLS[i].areaKm2, 0) * r.range(1.4, 2.4));
    const map = mean([...cells].map((i) => CELLS[i].map));
    const rechargeMm = Math.round(map * (0.012 + 0.05 * Math.min(1, map / 900)) * (aq.type === 'Dolomite' ? 1.8 : aq.type === 'Kalahari' ? 0.4 : 1) * 10) / 10;
    const recharge = Math.round((rechargeMm * areaKm2) / 1000);
    const abstraction = Math.round(recharge * r.range(0.12, 1.1) * (CELLS[bhs[0].cell].aridity + 0.5));
    const eco = Math.round(recharge * r.range(0.1, 0.22));
    const dynamicReserve = Math.max(0, recharge - eco);
    const thickness = r.range(aq.thickness[0], aq.thickness[1]);
    const sy = aq.type === 'Cape Flats' || aq.type === 'Coastal' ? 0.15 : aq.type === 'Dolomite' ? 0.04 : 0.008;
    const staticReserve = Math.round(areaKm2 * thickness * sy);
    const ei = abstraction / Math.max(1, recharge);
    units.push({
      id: `${aqId}-${prov}`.toLowerCase(),
      name: `${aq.name} – ${prov}`,
      aquifer: aq,
      province: prov,
      areaKm2,
      rechargeMm,
      recharge,
      abstraction,
      ecologicalReserve: eco,
      dynamicReserve,
      staticReserve,
      ei: Math.round(ei * 100) / 100,
      eiClass: exploitationClass(ei),
      sustainableYield: Math.round(dynamicReserve * 0.7),
      boreholes: bhs.length,
    });
  }
  return units.sort((a, b) => b.recharge - a.recharge);
})();
