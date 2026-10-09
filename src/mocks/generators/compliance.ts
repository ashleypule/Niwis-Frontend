/**
 * Wastewater treatment works (Green Drop, spec §13), water supply systems (Blue Drop / SANS 241, spec §14)
 * and Resource Water Quality Objective monitoring sites (spec §15).
 * Scores follow provincial performance patterns of the 2022/2023 Green and Blue Drop reports (approximate);
 * effluent / drinking-water samples are generated so that compliance is COMPUTED from the limits.
 */
import { blueDropBand, effluentPass, greenDropBand, sans241Pass } from '@/config/thresholds';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { monthIndex } from '@/lib/time';
import { METROS, MUNICIPALITIES, municipalPopulation } from '../reference/regions';
import { CELLS, END_MI, cellAt } from './climate';
import { MUNI_SERVICES } from './services';
import { WQ_STATIONS, type WqStation } from './quality';

const PROV_GD: Record<string, number> = { WC: 72, GP: 64, KZN: 60, MP: 48, LP: 44, EC: 46, NC: 40, FS: 34, NW: 33 };
const PROV_BD: Record<string, number> = { WC: 90, GP: 88, KZN: 78, MP: 66, LP: 62, EC: 68, NC: 58, FS: 55, NW: 52 };

export const C_START = monthIndex(2024, 0);

export interface Plant {
  id: string;
  name: string;
  kind: 'wwtw' | 'wss';
  municipality: string;
  municipalityName: string;
  province: string;
  wma: string;
  lat: number;
  lon: number;
  capacityMld: number;
  flowMld: number;
  score: number;
  /** last year's score */
  scorePrev: number;
  process: string;
  receiving?: string;
  populationServed: number;
  source?: string;
  samplesPerMonth: number;
}

function placeName(muniName: string, k: number, r: Rng): string {
  const base = muniName.replace(/^City of /, '').replace(' Metropolitan', '');
  const suffix = ['', ' North', ' South', ' East', ' West', ' Central', ' Rural', ' Extension', ' Valley', ' Heights'];
  void r;
  return k < suffix.length ? `${base}${suffix[k]}` : `${base} ${k + 1}`;
}

function buildPlants(kind: 'wwtw' | 'wss', total: number): Plant[] {
  const r = new Rng(`plants-${kind}`);
  const totalPop = MUNICIPALITIES.reduce((a, m) => a + (municipalPopulation.get(m.id) ?? 0), 0);
  const out: Plant[] = [];
  for (const m of MUNICIPALITIES) {
    const pop = municipalPopulation.get(m.id) ?? 30000;
    const metro = m.name in METROS;
    const n = Math.max(1, Math.round((total * (0.45 * (pop / totalPop) + 0.55 / MUNICIPALITIES.length)) * (metro ? 1.1 : 1)));
    const svc = MUNI_SERVICES.find((s) => s.id === m.id)!;
    const base = (kind === 'wwtw' ? PROV_GD : PROV_BD)[m.province] + (metro ? 12 : 0) - (svc.distressed ? 10 : 0);
    for (let k = 0; k < n; k++) {
      const share = pop / n;
      const cap = Math.max(0.2, ((share * (kind === 'wwtw' ? 0.13 : 0.2)) / 1000) * r.range(1.0, 1.8));
      const util = clamp(r.normal(kind === 'wwtw' ? 0.82 : 0.78, 0.18), 0.3, 1.35);
      const score = clamp(r.normal(base, 15), 3, 100);
      const lat = m.lat + r.range(-0.18, 0.18);
      const lon = m.lon + r.range(-0.18, 0.18);
      const ci = cellAt(lon, lat);
      const name = `${placeName(m.name, k, r)} ${kind === 'wwtw' ? 'WWTW' : 'WSS'}`;
      out.push({
        id: `${kind}-${m.id.slice(2)}-${k + 1}`,
        name,
        kind,
        municipality: m.id,
        municipalityName: m.name,
        province: m.province,
        wma: CELLS[ci].wma || m.wma,
        lat: round(lat, 3),
        lon: round(lon, 3),
        capacityMld: round(cap, 1),
        flowMld: round(cap * util, 1),
        score: round(score, 0),
        scorePrev: round(clamp(score + r.normal(-3, 7), 0, 100), 0),
        process: kind === 'wwtw' ? r.weighted(['Activated sludge (BNR)', 'Biofilter', 'Oxidation ponds', 'Activated sludge', 'Package plant'], [0.3, 0.2, 0.25, 0.15, 0.1]) : r.weighted(['Conventional (coag-floc-sed-filt-dis)', 'Direct filtration', 'Borehole + chlorination', 'Package plant', 'Membrane'], [0.5, 0.15, 0.2, 0.12, 0.03]),
        populationServed: Math.round(share * r.range(0.7, 1.0)),
        source: kind === 'wss' ? r.weighted(['Dam abstraction', 'River abstraction', 'Groundwater', 'Bulk purchase (water board)'], [0.35, 0.2, 0.25, 0.2]) : undefined,
        samplesPerMonth: Math.max(4, Math.round((share / (kind === 'wss' ? 8000 : 15000)) * r.range(0.8, 1.3))),
      });
    }
  }
  return out;
}

export const WWTWS: Plant[] = buildPlants('wwtw', 900);
export const WSSS: Plant[] = buildPlants('wss', 1150);
export const plantById = new Map([...WWTWS, ...WSSS].map((p) => [p.id, p]));

for (const w of WWTWS) {
  const near = [...WQ_STATIONS].filter((s) => s.type === 'River').sort((a, b) => (a.lat - w.lat) ** 2 + (a.lon - w.lon) ** 2 - ((b.lat - w.lat) ** 2 + (b.lon - w.lon) ** 2))[0];
  w.receiving = near ? `${near.river} River` : 'Local stream';
}

export const EFFLUENT_PARAMS = ['ph', 'bod', 'cod', 'ammonia', 'nitrate', 'tp', 'ecoli', 'faecal', 'tss'] as const;

/** Monthly effluent results from C_START → END_MI; quality degrades as the Green Drop score drops. */
export const effluent = memo((id: string): Record<string, Float64Array> => {
  const p = plantById.get(id)!;
  const r = new Rng(`eff-${id}`);
  const n = END_MI - C_START + 1;
  const bad = clamp((100 - p.score) / 100, 0, 1);
  const over = clamp(p.flowMld / p.capacityMld - 0.9, 0, 0.6);
  const out: Record<string, Float64Array> = {};
  EFFLUENT_PARAMS.forEach((k) => (out[k] = new Float64Array(n)));
  for (let t = 0; t < n; t++) {
    const f = 1 + over * 2 + r.normal(0, 0.15);
    out.ph[t] = clamp(7.3 + r.normal(0, 0.35) - (bad > 0.7 && r.bool(0.1) ? 1.8 : 0), 4, 10);
    out.bod[t] = r.lognormal((8 + 55 * bad * bad) * f, 0.4);
    out.cod[t] = out.bod[t] * r.range(2.4, 3.2) + r.range(5, 20);
    out.ammonia[t] = r.lognormal((1.2 + 18 * bad * bad) * f, 0.5);
    out.nitrate[t] = r.lognormal(4 + 9 * bad, 0.4);
    out.tp[t] = r.lognormal(0.8 + 7 * bad, 0.5);
    out.ecoli[t] = r.lognormal((60 + 9000 * bad * bad) * f, 1.0);
    out.faecal[t] = out.ecoli[t] * r.range(1.5, 3);
    out.tss[t] = r.lognormal((12 + 55 * bad) * f, 0.45);
  }
  return out;
});

export function effluentCompliance(id: string, t = END_MI - 1 - C_START): number {
  const e = effluent(id);
  const ok = EFFLUENT_PARAMS.filter((k) => effluentPass(k, e[k][t])).length;
  return (ok / EFFLUENT_PARAMS.length) * 100;
}

export const DW_PARAMS = ['ph', 'turbidity', 'freeChlorine', 'ecoli', 'totalColiforms', 'ec', 'nitrate', 'fluoride', 'arsenic', 'lead', 'thm'] as const;

/** Monthly drinking-water results (one representative sample per month per parameter). Units as SANS 241 (mg/L). */
export const drinking = memo((id: string): Record<string, Float64Array> => {
  const p = plantById.get(id)!;
  const r = new Rng(`dw-${id}`);
  const n = END_MI - C_START + 1;
  const bad = clamp((100 - p.score) / 100, 0, 1);
  const out: Record<string, Float64Array> = {};
  DW_PARAMS.forEach((k) => (out[k] = new Float64Array(n)));
  for (let t = 0; t < n; t++) {
    const fail = r.bool(0.02 + bad * 0.35);
    out.ph[t] = clamp(7.6 + r.normal(0, 0.3), 5.5, 10);
    out.turbidity[t] = r.lognormal(0.35 + 1.6 * bad * bad, 0.55);
    out.freeChlorine[t] = clamp(r.normal(0.75 - bad * 0.5, 0.25), 0, 2.5);
    out.ecoli[t] = fail ? Math.round(r.range(1, 40)) : 0;
    out.totalColiforms[t] = fail || r.bool(0.05 + bad * 0.2) ? Math.round(r.range(1, 120)) : 0;
    out.ec[t] = r.lognormal(45 + 40 * CELLS[cellAt(p.lon, p.lat)].aridity, 0.3);
    out.nitrate[t] = r.lognormal(1.5 + 3 * bad, 0.5);
    out.fluoride[t] = r.lognormal(p.source === 'Groundwater' ? 0.8 : 0.3, 0.45);
    out.arsenic[t] = r.lognormal(0.002, 0.6);
    out.lead[t] = r.lognormal(0.002 + 0.004 * bad, 0.6);
    out.thm[t] = r.lognormal(0.06, 0.4);
  }
  return out;
});

/** Share of SANS 241 tests passed in a month (all parameters). */
export function dwCompliance(id: string, t = END_MI - 1 - C_START): number {
  const d = drinking(id);
  return (DW_PARAMS.filter((k) => sans241Pass(k, d[k][t])).length / DW_PARAMS.length) * 100;
}
export function dwMicroCompliant(id: string, t = END_MI - 1 - C_START): boolean {
  const d = drinking(id);
  return d.ecoli[t] === 0;
}

export const gdBand = (p: Plant) => greenDropBand(p.score);
export const bdBand = (p: Plant) => blueDropBand(p.score);

// ------------------------------------------------------------------ RWQO sites (spec §15)
export interface RwqoSite {
  id: string;
  name: string;
  station: WqStation;
  waterBody: 'River' | 'Dam' | 'Wetland' | 'Estuary' | 'Aquifer';
  sass5: number;
  aspt: number;
  fibi: number;
  vegrai: number;
  ihi: number;
  pes: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  rec: 'A' | 'B' | 'C' | 'D';
  eflowReq: number;
  eflowObs: number;
}

export const RWQO_SITES: RwqoSite[] = (() => {
  const r = new Rng('rwqo-sites');
  const pool = WQ_STATIONS.filter((s) => s.type !== 'Groundwater');
  const out: RwqoSite[] = [];
  for (let k = 0; k < 236; k++) {
    const st = pool[Math.floor((k * pool.length) / 236)];
    const health = clamp(1 - st.pressure + r.normal(0, 0.12), 0.05, 1);
    const sass5 = Math.round(40 + 190 * health);
    const aspt = round(3.5 + 4.5 * health, 1);
    const ec = health > 0.85 ? 'A' : health > 0.7 ? 'B' : health > 0.5 ? 'C' : health > 0.3 ? 'D' : health > 0.15 ? 'E' : 'F';
    const eflowReq = round(r.range(0.2, 6), 2);
    out.push({
      id: `rwqo-${k + 1}`,
      name: st.name.replace(/ \(.*\)$/, ''),
      station: st,
      waterBody: st.type === 'Dam / reservoir' ? 'Dam' : st.type === 'Wetland' ? 'Wetland' : st.type === 'Estuary' ? 'Estuary' : 'River',
      sass5,
      aspt,
      fibi: Math.round(25 + 70 * health),
      vegrai: Math.round(30 + 65 * clamp(health + r.normal(0, 0.08), 0, 1)),
      ihi: Math.round(30 + 65 * clamp(health + r.normal(0, 0.1), 0, 1)),
      pes: ec as RwqoSite['pes'],
      rec: (ec === 'A' ? 'A' : ec === 'B' ? 'B' : ec === 'C' ? 'B' : 'C') as RwqoSite['rec'],
      eflowReq,
      eflowObs: round(eflowReq * clamp(r.normal(0.95, 0.35), 0.15, 2.5), 2),
    });
  }
  return out;
})();
export const rwqoById = new Map(RWQO_SITES.map((s) => [s.id, s]));

export const gdMean = (list: Plant[]) => mean(list.map((p) => p.score));
