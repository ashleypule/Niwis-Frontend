/**
 * Water quality monitoring network (spec §12): stations, monthly samples, WQI, compliance.
 * Parameter levels depend on catchment pressure (urban / mining / agriculture), aridity (salinity) and rainfall
 * (turbidity, E. coli flushes). E. coli is log-normal. WQI is a weighted sub-index aggregate (CCME-style 0–100).
 * Compliance is computed per sample against guideline values — never assigned.
 */
import { wqiClass } from '@/config/thresholds';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { miMonth, monthIndex } from '@/lib/time';
import { DAMS } from './dams';
import { CELLS, END_MI, START_MI, cellRain } from './climate';
import { locate } from './scope';
import { METROS, municipalityById } from '../reference/regions';

export type WqType = 'River' | 'Dam / reservoir' | 'Wetland' | 'Groundwater' | 'Estuary';
export interface WqParamDef {
  id: string;
  label: string;
  unit: string;
  /** guideline (resource quality objective for domestic use, DWAF 1996 TWQR / SANS 241 where applicable) */
  min?: number;
  max?: number;
  log?: boolean;
  decimals: number;
}

export const WQ_PARAMS: WqParamDef[] = [
  { id: 'ph', label: 'pH', unit: 'pH units', min: 6.5, max: 9.0, decimals: 1 },
  { id: 'ec', label: 'Electrical conductivity', unit: 'mS/m', max: 150, decimals: 0 },
  { id: 'turbidity', label: 'Turbidity', unit: 'NTU', max: 25, decimals: 1, log: true },
  { id: 'do', label: 'Dissolved oxygen', unit: 'mg/L', min: 5, decimals: 1 },
  { id: 'bod', label: 'BOD₅', unit: 'mg/L', max: 10, decimals: 1 },
  { id: 'cod', label: 'COD', unit: 'mg/L', max: 75, decimals: 0 },
  { id: 'nitrate', label: 'Nitrate (NO₃⁻-N)', unit: 'mg/L', max: 6, decimals: 2 },
  { id: 'ammonia', label: 'Ammonia (NH₃-N)', unit: 'mg/L', max: 1, decimals: 2 },
  { id: 'phosphate', label: 'Orthophosphate (PO₄-P)', unit: 'mg/L', max: 0.125, decimals: 3 },
  { id: 'ecoli', label: 'E. coli', unit: 'cfu/100 mL', max: 1000, decimals: 0, log: true },
  { id: 'chla', label: 'Chlorophyll-a', unit: 'µg/L', max: 20, decimals: 1 },
  { id: 'tds', label: 'Total dissolved solids', unit: 'mg/L', max: 1000, decimals: 0 },
  { id: 'sulphate', label: 'Sulphate', unit: 'mg/L', max: 250, decimals: 0 },
  { id: 'fluoride', label: 'Fluoride', unit: 'mg/L', max: 1.5, decimals: 2 },
  { id: 'iron', label: 'Iron', unit: 'mg/L', max: 0.3, decimals: 2 },
  { id: 'manganese', label: 'Manganese', unit: 'mg/L', max: 0.1, decimals: 3 },
  { id: 'lead', label: 'Lead', unit: 'µg/L', max: 10, decimals: 1 },
  { id: 'arsenic', label: 'Arsenic', unit: 'µg/L', max: 10, decimals: 1 },
];
export const paramDef = (id: string) => WQ_PARAMS.find((p) => p.id === id)!;

export function passes(id: string, v: number): boolean {
  const d = paramDef(id);
  if (d.min != null && v < d.min) return false;
  if (d.max != null && v > d.max) return false;
  return true;
}

export interface WqStation {
  id: string;
  name: string;
  type: WqType;
  river: string;
  lat: number;
  lon: number;
  province: string;
  wma: string;
  municipality: string;
  cell: number;
  /** pollution pressure 0–1 */
  pressure: number;
  /** dominant pressure */
  source: 'Urban / WWTW' | 'Mining' | 'Agriculture' | 'Industrial' | 'Natural';
}

const RIVERS: Record<string, string[]> = {
  WMA1: ['Limpopo', 'Crocodile (West)', 'Mogalakwena', 'Sand', 'Luvuvhu', 'Mokolo', 'Lephalala'],
  WMA2: ['Olifants', 'Steelpoort', 'Elands', 'Wilge', 'Klein Olifants', 'Letaba', 'Blyde'],
  WMA3: ['Komati', 'Crocodile (East)', 'Sabie', 'Usuthu', 'Lomati', 'White River'],
  WMA4: ['Thukela', 'uMngeni', 'Mvoti', 'Mfolozi', 'Phongolo', 'Mkomazi', 'Buffalo', 'Mooi', 'Msunduzi'],
  WMA5: ['Vaal', 'Klip', 'Wilge', 'Suikerbosrant', 'Mooi', 'Vet', 'Harts', 'Riet', 'Modder'],
  WMA6: ['Orange', 'Caledon', 'Kraai', 'Ongers', 'Hartbees', 'Seekoei'],
  WMA7: ['Mzimvubu', 'Great Kei', 'Buffalo', 'Keiskamma', 'Great Fish', 'Sundays', 'Gamtoos', 'Kromme', 'Swartkops'],
  WMA8: ['Breede', 'Gouritz', 'Olifants (Gouritz)', 'Gamka', 'Riviersonderend', 'Kaaimans'],
  WMA9: ['Berg', 'Olifants (Western)', 'Eerste', 'Diep', 'Doring', 'Kuils'],
};

export const WQ_STATIONS: WqStation[] = (() => {
  const r = new Rng('wq-stations-v1');
  const out: WqStation[] = [];
  const typeCounts: [WqType, number][] = [
    ['River', 586],
    ['Dam / reservoir', 260],
    ['Wetland', 87],
    ['Groundwater', 108],
    ['Estuary', 43],
  ];
  const w = CELLS.map((c) => 0.3 + c.map / 600 + (c.province === 'GP' ? 1.5 : 0) + (c.province === 'KZN' ? 0.4 : 0));
  const idx = CELLS.map((_, i) => i);
  let n = 0;
  for (const [type, count] of typeCounts) {
    for (let k = 0; k < count; k++) {
      let lat: number;
      let lon: number;
      let ci: number;
      if (type === 'Dam / reservoir') {
        const d = DAMS[k % DAMS.length];
        lat = d.lat + r.range(-0.05, 0.05);
        lon = d.lon + r.range(-0.05, 0.05);
        ci = CELLS.findIndex((c) => Math.abs(c.lat - lat) <= 0.125 && Math.abs(c.lon - lon) <= 0.125);
        if (ci < 0) ci = r.weighted(idx, w);
      } else if (type === 'Estuary') {
        const coast: [number, number][] = [
          [-29.86, 31.03],
          [-33.03, 27.9],
          [-33.97, 25.63],
          [-34.04, 23.37],
          [-34.18, 22.14],
          [-33.9, 18.48],
          [-32.32, 18.33],
          [-28.4, 32.4],
          [-31.6, 29.55],
          [-30.75, 30.47],
        ];
        const c = coast[k % coast.length];
        lat = c[0] + r.range(-0.1, 0.1);
        lon = c[1] + r.range(-0.1, 0.1);
        ci = CELLS.findIndex((cc) => Math.abs(cc.lat - lat) <= 0.2 && Math.abs(cc.lon - lon) <= 0.2);
        if (ci < 0) ci = r.weighted(idx, w);
      } else {
        ci = r.weighted(idx, w);
        lat = CELLS[ci].lat + r.range(-0.12, 0.12);
        lon = CELLS[ci].lon + r.range(-0.12, 0.12);
      }
      const loc = locate(lon, lat);
      const muni = municipalityById.get(loc.municipality);
      const metro = !!muni && muni.name in METROS;
      const mining =
        (lon > 28.6 && lon < 30.2 && lat > -26.4 && lat < -25.4) ||
        (lon > 26.6 && lon < 28.2 && lat > -26.8 && lat < -25.9);
      const source = metro
        ? 'Urban / WWTW'
        : mining
          ? 'Mining'
          : r.weighted(['Agriculture', 'Natural', 'Urban / WWTW', 'Industrial'] as const, [0.45, 0.3, 0.18, 0.07]);
      const pressure = clamp(
        (source === 'Natural' ? 0.15 : source === 'Agriculture' ? 0.4 : 0.62) + r.normal(0, 0.15),
        0.02,
        0.98,
      );
      const river = r.pick(RIVERS[loc.wma] ?? ['Unnamed']);
      n++;
      const code = `${String.fromCharCode(65 + ((CELLS[ci].wma.charCodeAt(3) || 49) - 49) * 2)}${r.int(1, 9)}${type === 'Dam / reservoir' ? 'R' : type === 'Groundwater' ? 'G' : 'H'}${String(r.int(1, 999)).padStart(3, '0')}`;
      const name =
        type === 'River'
          ? `${river} at ${muni?.name ?? 'site'} (${code})`
          : type === 'Dam / reservoir'
            ? `${DAMS[k % DAMS.length].name} Dam (${code})`
            : type === 'Groundwater'
              ? `GW monitoring ${code}`
              : type === 'Estuary'
                ? `${river} estuary (${code})`
                : `${muni?.name ?? 'Wetland'} wetland (${code})`;
      out.push({
        id: `wq-${n}`,
        name,
        type,
        river,
        lat: round(lat, 3),
        lon: round(lon, 3),
        ...loc,
        cell: ci,
        pressure,
        source,
      });
    }
  }
  return out;
})();

export const wqStationById = new Map(WQ_STATIONS.map((s) => [s.id, s]));

export const WQ_START = monthIndex(2018, 0);

/** Monthly sample values for a station: Record<param, Float64Array> from WQ_START to END_MI. */
export const wqSamples = memo((id: string): Record<string, Float64Array> => {
  const s = wqStationById.get(id)!;
  const c = CELLS[s.cell];
  const r = new Rng(`wq-${id}`);
  const n = END_MI - WQ_START + 1;
  const rain = cellRain(s.cell);
  const out: Record<string, Float64Array> = {};
  for (const p of WQ_PARAMS) out[p.id] = new Float64Array(n);
  const p = s.pressure;
  const lake = s.type === 'Dam / reservoir';
  const gw = s.type === 'Groundwater';
  const baseEc = (gw ? 60 : 25) + 110 * c.aridity + (s.source === 'Mining' ? 120 : 0) + r.range(-10, 20);
  const trend = r.normal(0, 0.15);
  for (let t = 0; t < n; t++) {
    const mi = WQ_START + t;
    const m = miMonth(mi);
    const expRain = c.map * c.shares[m];
    const ra = clamp((rain[mi - START_MI] + 1) / (expRain + 1), 0, 4);
    const year = (mi - WQ_START) / 12;
    const flush = gw ? 1 : 0.6 + 0.5 * ra;
    out.ph[t] = clamp(
      7.6 +
        (s.source === 'Mining' ? -0.6 : 0) +
        (lake ? 0.4 : 0) +
        r.normal(0, 0.35) +
        (s.source === 'Mining' && r.bool(0.08) ? -2.2 : 0),
      3.5,
      10,
    );
    out.ec[t] = Math.max(
      5,
      baseEc * (gw ? 1 : 1.25 - 0.3 * Math.min(1.5, ra)) * (1 + trend * year * 0.05) + r.normal(0, 8),
    );
    out.turbidity[t] = gw ? r.lognormal(0.6, 0.6) : r.lognormal((lake ? 6 : 18) * (0.6 + p) * flush, 0.6);
    out.do[t] = clamp(8.6 - 3.4 * p - (m >= 10 || m <= 2 ? 0.8 : 0) + r.normal(0, 0.6), 1.5, 11);
    out.bod[t] = Math.max(0.3, r.lognormal(1.6 + 9 * p * p, 0.45));
    out.cod[t] = Math.max(4, out.bod[t] * r.range(2.3, 3.4) + r.range(0, 8));
    out.nitrate[t] = Math.max(0.02, r.lognormal(0.4 + 4.5 * p * (s.source === 'Agriculture' || gw ? 1.4 : 1), 0.55));
    out.ammonia[t] = Math.max(0.01, r.lognormal(0.05 + 1.2 * p * p, 0.7));
    out.phosphate[t] = Math.max(0.003, r.lognormal(0.02 + 0.22 * p * p * (s.source === 'Urban / WWTW' ? 1.8 : 1), 0.6));
    out.ecoli[t] = gw
      ? r.lognormal(2 + 30 * p, 1.2)
      : r.lognormal((50 + 1800 * p * p * (s.source === 'Urban / WWTW' ? 2.2 : 1)) * flush, 1.1);
    out.chla[t] = lake
      ? r.lognormal(3 + 45 * out.phosphate[t] * (m >= 9 || m <= 3 ? 1.5 : 0.7), 0.5)
      : r.lognormal(1.5 + 8 * p, 0.6);
    out.tds[t] = out.ec[t] * 6.5;
    out.sulphate[t] = Math.max(2, (s.source === 'Mining' ? 420 : 25 + 60 * c.aridity) * r.range(0.7, 1.3));
    out.fluoride[t] = Math.max(0.05, r.lognormal(gw ? 0.6 + 1.1 * c.aridity : 0.25, 0.4));
    out.iron[t] = Math.max(0.01, r.lognormal(s.source === 'Mining' ? 0.5 : 0.12, 0.6));
    out.manganese[t] = Math.max(0.002, r.lognormal(s.source === 'Mining' ? 0.15 : 0.03, 0.6));
    out.lead[t] = Math.max(0.1, r.lognormal(s.source === 'Mining' || s.source === 'Industrial' ? 6 : 1.2, 0.6));
    out.arsenic[t] = Math.max(0.1, r.lognormal(s.source === 'Mining' ? 5 : 1, 0.6));
  }
  return out;
});

const SUB_W: Record<string, number> = {
  do: 0.17,
  ecoli: 0.16,
  ph: 0.11,
  bod: 0.11,
  nitrate: 0.1,
  phosphate: 0.1,
  turbidity: 0.08,
  ec: 0.1,
  ammonia: 0.07,
};

/** Sub-index 0–100 (100 = pristine) for a parameter value. */
function subIndex(id: string, v: number): number {
  switch (id) {
    case 'do':
      return clamp(((v - 2) / 6.5) * 100, 0, 100);
    case 'ph':
      return clamp(100 - Math.abs(v - 7.5) * 35, 0, 100);
    case 'ecoli':
      return clamp(100 - (Math.log10(v + 1) - 1) * 32, 0, 100);
    case 'turbidity':
      return clamp(100 - (Math.log10(v + 1) - 0.3) * 45, 0, 100);
    default: {
      const d = paramDef(id);
      const ratio = v / (d.max ?? 1);
      return clamp(100 - Math.max(0, ratio - 0.15) * 70, 0, 100);
    }
  }
}

export function wqiAt(id: string, t: number): number {
  const s = wqSamples(id);
  let tot = 0;
  let w = 0;
  for (const [k, wt] of Object.entries(SUB_W)) {
    tot += subIndex(k, s[k][t]) * wt;
    w += wt;
  }
  return round(tot / w, 0);
}

export interface WqNow {
  wqi: number;
  wqiPrev: number;
  cls: ReturnType<typeof wqiClass>;
  /** share of guideline parameters met in latest sample */
  compliance: number;
  compliant: boolean;
  exceedances: string[];
  latest: Record<string, number>;
}

export const wqNow = memo((id: string): WqNow => {
  const s = wqSamples(id);
  const t = END_MI - 1 - WQ_START;
  const latest: Record<string, number> = {};
  const exceed: string[] = [];
  for (const p of WQ_PARAMS) {
    latest[p.id] = round(s[p.id][t], p.decimals);
    if (!passes(p.id, s[p.id][t])) exceed.push(p.id);
  }
  const wqi = wqiAt(id, t);
  const core = ['ph', 'ec', 'do', 'nitrate', 'ammonia', 'phosphate', 'ecoli', 'cod'];
  const met = core.filter((k) => passes(k, s[k][t])).length;
  return {
    wqi,
    wqiPrev: wqiAt(id, t - 12),
    cls: wqiClass(wqi),
    compliance: round((met / core.length) * 100, 0),
    compliant: met >= core.length - 1,
    exceedances: exceed,
    latest,
  };
});

export function wqT(mi: number) {
  return mi - WQ_START;
}

/** National compliance (share of stations compliant in latest round). */
export function wqComplianceRate(list: WqStation[]): number {
  return list.length ? round((list.filter((s) => wqNow(s.id).compliant).length / list.length) * 100, 0) : 0;
}

export function meanParam(list: WqStation[], param: string, mi: number): number {
  return mean(list.map((s) => wqSamples(s.id)[param][wqT(mi)]));
}

const CORE = ['ph', 'ec', 'do', 'nitrate', 'ammonia', 'phosphate', 'ecoli', 'cod'];
/** Station compliant at sample t (≤ 1 core parameter outside guideline). */
export function wqCompliantAt(id: string, t: number): boolean {
  const s = wqSamples(id);
  return CORE.filter((k) => passes(k, s[k][t])).length >= CORE.length - 1;
}
export function wqComplianceRateAt(list: WqStation[], mi: number): number {
  return list.length ? (list.filter((s) => wqCompliantAt(s.id, wqT(mi))).length / list.length) * 100 : 0;
}
