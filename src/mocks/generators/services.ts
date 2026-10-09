/**
 * Municipal water services, infrastructure, NRW and tariffs (spec §18, §19).
 * Provincial access baselines approximate Stats SA GHS 2022 (piped in dwelling / on site / communal / below RDP);
 * municipal values vary around them (metros better served, rural municipalities worse).
 */
import { NRW_TARGET_PCT } from '@/config/thresholds';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { METROS, MUNICIPALITIES, PROVINCES, municipalPopulation } from '../reference/regions';
import { CELLS, cellAt } from './climate';

/** % of households: [piped in dwelling, piped on site, communal < 200 m, below RDP / no access] (approx. GHS 2022). */
export const ACCESS_BASE: Record<string, [number, number, number, number]> = {
  WC: [78, 12, 7, 3],
  EC: [38, 13, 30, 19],
  NC: [50, 31, 14, 5],
  FS: [53, 34, 9, 4],
  KZN: [47, 17, 22, 14],
  NW: [38, 30, 21, 11],
  GP: [71, 19, 8, 2],
  MP: [40, 34, 15, 11],
  LP: [22, 29, 30, 19],
};

export interface MuniServices {
  id: string;
  name: string;
  province: string;
  wma: string;
  population: number;
  households: number;
  metro: boolean;
  /** % households */
  inDwelling: number;
  onSite: number;
  communal: number;
  belowRdp: number;
  sanitation: number;
  nrw: number;
  distressed: boolean;
  lpcd: number;
  productionMld: number;
  reliability: number;
  interruptionsPerMonth: number;
  outageHours: number;
  wtps: number;
  reservoirs: number;
  pumpStations: number;
  pipelineKm: number;
  pipeAgeOver40: number;
  breaksPer100km: number;
  conditionIndex: number;
  /** tariff blocks R/kL: 0–6, 6–10.5, 10.5–20, 20–35, 35–50, > 50 kL */
  blocks: number[];
  avgTariff: number;
  costOfSupply: number;
  costRecovery: number;
  affordability: number;
  tariffIncrease: number;
  energyKwhPerMl: number;
}

export const MUNI_SERVICES: MuniServices[] = MUNICIPALITIES.map((m) => {
  const r = new Rng(`svc-${m.id}`);
  const metro = m.name in METROS;
  const pop = municipalPopulation.get(m.id) ?? 50000;
  const base = ACCESS_BASE[m.province];
  const quality = clamp((metro ? 0.35 : 0) + r.normal(0, 0.18), -0.5, 0.6);
  let inD = clamp(base[0] * (1 + quality * 0.5), 5, 97);
  let below = clamp(base[3] * (1 - quality), 0.5, 45);
  let communal = clamp(base[2] * (1 - quality * 0.4), 1, 50);
  let onSite = Math.max(1, 100 - inD - below - communal);
  const tot = inD + onSite + communal + below;
  inD = (inD / tot) * 100;
  onSite = (onSite / tot) * 100;
  communal = (communal / tot) * 100;
  below = (below / tot) * 100;
  const distressed =
    !metro && r.bool(0.35 + (m.province === 'NW' || m.province === 'FS' || m.province === 'EC' ? 0.2 : 0));
  const nrw = metro ? r.range(24, 42) : distressed ? r.range(34, 62) : r.range(15, 33);
  const lpcd = metro ? r.range(190, 260) : inD > 50 ? r.range(130, 190) : r.range(55, 120);
  const productionMld = (pop * lpcd) / 1e6 / (1 - nrw / 100);
  const reliability = clamp(98 - (distressed ? r.range(8, 25) : r.range(1, 9)) - below * 0.2, 55, 99.5);
  const pipelineKm = Math.round((pop / (metro ? 380 : 220)) * r.range(0.8, 1.3));
  const blocksBase = metro ? r.range(16, 24) : r.range(9, 18);
  const blocks = [0, blocksBase, blocksBase * 1.45, blocksBase * 2.0, blocksBase * 2.6, blocksBase * 3.1].map((v) =>
    round(v, 2),
  );
  const avgTariff = round(blocksBase * r.range(1.35, 1.75), 2);
  const costOfSupply = round(avgTariff * r.range(0.9, 1.45) * (distressed ? 1.15 : 1), 2);
  return {
    id: m.id,
    name: m.name,
    province: m.province,
    wma: m.wma,
    population: pop,
    households: Math.round(pop / r.range(3.1, 3.9)),
    metro,
    inDwelling: round(inD, 1),
    onSite: round(onSite, 1),
    communal: round(communal, 1),
    belowRdp: round(below, 1),
    sanitation: round(clamp(inD + onSite * 0.75 + communal * 0.3 + r.normal(0, 3), 20, 99), 1),
    nrw: round(nrw, 1),
    distressed,
    lpcd: Math.round(lpcd),
    productionMld: round(productionMld, 1),
    reliability: round(reliability, 1),
    interruptionsPerMonth: Math.round((100 - reliability) * r.range(0.6, 1.4) * (metro ? 3 : 1)),
    outageHours: round(r.range(3, 18) * (distressed ? 1.6 : 1), 1),
    wtps: Math.max(1, Math.round(pop / (metro ? 600000 : 60000) + r.range(0, 2))),
    reservoirs: Math.max(2, Math.round(pop / (metro ? 25000 : 9000))),
    pumpStations: Math.max(1, Math.round(pop / (metro ? 30000 : 14000))),
    pipelineKm,
    pipeAgeOver40: round(r.range(18, metro ? 45 : 60), 0),
    breaksPer100km: round(r.range(8, distressed ? 75 : 35), 1),
    conditionIndex: round(clamp(r.range(2.2, 4.3) - (distressed ? 0.6 : 0), 1, 5), 1),
    blocks,
    avgTariff,
    costOfSupply,
    costRecovery: round(clamp((avgTariff / costOfSupply) * 100 * (1 - nrw / 200), 35, 115), 0),
    affordability: round(clamp(((avgTariff * 15) / (metro ? 21000 : 9500)) * 100 * r.range(0.8, 1.2), 0.8, 9), 1),
    tariffIncrease: round(r.range(5.5, 14.5), 1),
    energyKwhPerMl: Math.round(r.range(280, 720)),
  };
});

export const muniServiceById = new Map(MUNI_SERVICES.map((s) => [s.id, s]));

/** Household-weighted aggregate of a services field. */
export function svcWeighted(
  list: MuniServices[],
  f: (s: MuniServices) => number,
  weight: (s: MuniServices) => number = (s) => s.households,
): number {
  const w = list.reduce((a, s) => a + weight(s), 0);
  return w ? list.reduce((a, s) => a + f(s) * weight(s), 0) / w : 0;
}

/** National access KPIs (piped = in dwelling + on site; RDP = + communal < 200 m). */
export function accessSummary(list: MuniServices[]) {
  const piped = svcWeighted(list, (s) => s.inDwelling + s.onSite);
  const rdp = svcWeighted(list, (s) => s.inDwelling + s.onSite + s.communal);
  return {
    piped: round(piped, 1),
    rdp: round(rdp, 1),
    sanitation: round(
      svcWeighted(list, (s) => s.sanitation),
      1,
    ),
    nrw: round(
      svcWeighted(
        list,
        (s) => s.nrw,
        (s) => s.productionMld,
      ),
      1,
    ),
    reliability: round(
      svcWeighted(list, (s) => s.reliability),
      1,
    ),
  };
}

/** NRW time series for a municipality set (slow improvement trend + noise), % of production. */
export const nrwHistory = memo((key: string, current: number, months: number) => {
  const r = new Rng(`nrw-${key}`);
  return Array.from({ length: months }, (_, k) => round(current + (months - 1 - k) * 0.03 + r.normal(0, 0.6), 1));
});

/** Water demand (Mm³/yr) by sector anchored to spec §17.2. */
export const DEMAND_ANCHORS = {
  municipal: 4200,
  agricultural: 11000,
  industrial: 1800,
  mining: 600,
  power: 350,
  environment: 2800,
} as const;

/** Provincial municipal demand share ∝ production. */
export function municipalDemandShare(provinceId: string): number {
  const p = MUNI_SERVICES.filter((s) => s.province === provinceId).reduce((a, s) => a + s.productionMld, 0);
  const t = MUNI_SERVICES.reduce((a, s) => a + s.productionMld, 0);
  return p / t;
}

export { NRW_TARGET_PCT, PROVINCES, cellAt, CELLS, mean };
