/**
 * Integrated water resource accounting (spec §16–17), anchored on the national water balance of spec §17.2:
 *   MAR ≈ 49 000, groundwater recharge ≈ 19 000, IBT ≈ 1 000, municipal 4 200, agricultural 11 000,
 *   industrial 1 800, ecological reserve 2 800 Mm³/yr.
 * Natural resources scale with the current hydrological year's runoff / rainfall anomaly; only a fraction of
 * the resource is utilisable (floods, spills, evaporation, unharvestable recharge), which is why SA is close to
 * full allocation. WMA and catchment values are disaggregations of the national totals (they always sum up).
 */
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, round } from '@/lib/stats';
import { miMonth, miYear, monthIndex } from '@/lib/time';
import { MUNICIPALITIES, WMAS, municipalPopulation } from '../reference/regions';
import { CELLS, START_MI, cellWaterBalance } from './climate';

/** Mean annual runoff volume of a grid cell, 1981–2010 (mm × km²). */
const marCache = new Map<number, number>();
function cellMar(i: number): number {
  let v = marCache.get(i);
  if (v == null) {
    const r = cellWaterBalance(i).runoff;
    let s = 0;
    for (let mi = monthIndex(1981, 0); mi <= monthIndex(2010, 11); mi++) s += r[mi - START_MI];
    v = (s / 30) * CELLS[i].areaKm2;
    marCache.set(i, v);
  }
  return v;
}
import { LAST, regionSeries } from './hydromet';
import { resolveScope, type ResolvedScope } from './scope';
import { DAMS, simulateDam, damT } from './dams';

export const ANCHORS = {
  mar: 49_000,
  recharge: 19_000,
  ibt: 1_000,
  municipal: 4_200,
  agricultural: 11_000,
  industrial: 1_800,
  miningPower: 950,
  reserve: 2_800,
  returnFlows: 1_850,
};
/** Fractions of the natural resource that can be utilised at a high assurance of supply. */
const SURFACE_UTILISABLE = 0.34;
const GW_UTILISABLE = 0.19;

/** Agricultural and industrial demand shares by WMA (approximate NWRS2 distribution). */
const AGRI_SHARE: Record<string, number> = {
  WMA1: 0.09,
  WMA2: 0.08,
  WMA3: 0.12,
  WMA4: 0.13,
  WMA5: 0.12,
  WMA6: 0.24,
  WMA7: 0.08,
  WMA8: 0.09,
  WMA9: 0.05,
};
const IND_SHARE: Record<string, number> = {
  WMA1: 0.08,
  WMA2: 0.16,
  WMA3: 0.05,
  WMA4: 0.13,
  WMA5: 0.42,
  WMA6: 0.04,
  WMA7: 0.04,
  WMA8: 0.02,
  WMA9: 0.06,
};

const wmaPop = new Map<string, number>();
MUNICIPALITIES.forEach((m) => wmaPop.set(m.wma, (wmaPop.get(m.wma) ?? 0) + (municipalPopulation.get(m.id) ?? 0)));
const totPop = [...wmaPop.values()].reduce((a, b) => a + b, 0);

/** Annual runoff and rainfall ratio (hydrological year ending at mi) vs 1981–2010. */
const ratios = memo(
  (key: string, scope: ResolvedScope, endMi: number) => {
    const ro = regionSeries(scope, 'runoff');
    const ra = regionSeries(scope, 'rain');
    const sum = (s: ArrayLike<number>, e: number) =>
      Array.from({ length: 12 }, (_, k) => s[e - k - START_MI]).reduce((a, b) => a + b, 0);
    const norm = (s: ArrayLike<number>) => mean(Array.from({ length: 30 }, (_, k) => sum(s, monthIndex(1981 + k, 11))));
    void key;
    return { runoff: clamp(sum(ro, endMi) / norm(ro), 0.25, 2.5), rain: clamp(sum(ra, endMi) / norm(ra), 0.4, 1.8) };
  },
  (key, _s, e) => `${key}|${e}`,
);

export interface Balance {
  mar: number;
  recharge: number;
  ibt: number;
  returnFlows: number;
  renewable: number;
  reserve: number;
  nonUtilisable: number;
  utilisable: number;
  surfaceAvailable: number;
  gwAvailable: number;
  municipal: number;
  agricultural: number;
  industrial: number;
  miningPower: number;
  losses: number;
  demand: number;
  balance: number;
  stress: number;
}

/** Share of the national resource / demand attributable to a scope. */
function shares(scope: ResolvedScope) {
  if (scope.level === 'national') return { area: 1, mar: 1, pop: 1, agri: 1, ind: 1 };
  const cellsW = new Map<string, number>();
  let tot = 0;
  scope.cells.forEach((i) => {
    cellsW.set(CELLS[i].wma, (cellsW.get(CELLS[i].wma) ?? 0) + CELLS[i].areaKm2);
    tot += CELLS[i].areaKm2;
  });
  let mar = 0;
  let natRun = 0;
  CELLS.forEach((_, i) => (natRun += cellMar(i)));
  scope.cells.forEach((i) => (mar += cellMar(i)));
  let agri = 0;
  let ind = 0;
  let pop = 0;
  cellsW.forEach((a, w) => {
    const wmaArea = CELLS.filter((c) => c.wma === w).reduce((s, c) => s + c.areaKm2, 0) || 1;
    const f = a / wmaArea;
    agri += (AGRI_SHARE[w] ?? 0) * f;
    ind += (IND_SHARE[w] ?? 0) * f;
    pop += ((wmaPop.get(w) ?? 0) / totPop) * f;
  });
  const area = tot / CELLS.reduce((s, c) => s + c.areaKm2, 0);
  return { area, mar: mar / natRun, pop, agri, ind };
}

const waterBalanceImpl = memo(
  (scope: ResolvedScope, endMi: number, growthYears: number): Balance => {
    const sh = shares(scope);
    const r = ratios(scope.key, scope, endMi);
    const mar = ANCHORS.mar * sh.mar * r.runoff;
    const recharge = ANCHORS.recharge * sh.area * Math.pow(r.rain, 1.5);
    const ibt = scope.level === 'national' ? ANCHORS.ibt : ANCHORS.ibt * (sh.ind * 0.8 + sh.pop * 0.2) * 1.4;
    const returnFlows = ANCHORS.returnFlows * sh.pop * (1 + growthYears * 0.03);
    const renewable = mar + recharge + ibt + returnFlows;
    const reserve = ANCHORS.reserve * sh.mar;
    const surfaceAvailable = mar * SURFACE_UTILISABLE;
    const gwAvailable = recharge * GW_UTILISABLE;
    const utilisable = surfaceAvailable + gwAvailable + ibt + returnFlows;
    const nonUtilisable = renewable - reserve - utilisable;
    const g = Math.pow(1.012, growthYears);
    const municipal = ANCHORS.municipal * sh.pop * g * 1.02 ** (miYear(endMi) - 2025);
    const agricultural = ANCHORS.agricultural * sh.agri * (1 + (1 - r.rain) * 0.15);
    const industrial = ANCHORS.industrial * sh.ind * g;
    const miningPower = ANCHORS.miningPower * (sh.ind * 0.7 + sh.area * 0.3);
    const losses = municipal * 0.12;
    const demand = municipal + agricultural + industrial + miningPower;
    return {
      mar,
      recharge,
      ibt,
      returnFlows,
      renewable,
      reserve,
      nonUtilisable,
      utilisable,
      surfaceAvailable,
      gwAvailable,
      municipal,
      agricultural,
      industrial,
      miningPower,
      losses,
      demand,
      balance: utilisable - demand - losses,
      stress: round((demand + losses) / Math.max(1, utilisable), 2),
    };
  },
  (scope, e, g) => `${scope.key}|${e}|${g}`,
);

export const waterBalance = (scope: ResolvedScope, endMi: number = LAST, growthYears = 0): Balance =>
  waterBalanceImpl(scope, endMi, growthYears);

export const wmaBalance = (id: string, mi = LAST) => waterBalance(resolveScope({ wma: id }), mi);
export const WMA_IDS = WMAS.map((w) => w.id);

// ------------------------------------------------------------------ inter-basin transfers (spec §17.1)
export interface Transfer {
  id: string;
  name: string;
  from: string;
  to: string;
  capacity: number; // Mm³/yr
  donorDam: string;
  kwhPerMl: number;
  lat: number;
  lon: number;
}
export const TRANSFERS: Transfer[] = [
  {
    id: 'lhwp',
    name: 'Lesotho Highlands Water Project',
    from: 'Senqu (Lesotho)',
    to: 'Vaal (Gauteng)',
    capacity: 780,
    donorDam: 'dam-katse',
    kwhPerMl: 0,
    lat: -29.3,
    lon: 28.5,
  },
  {
    id: 'thukela-vaal',
    name: 'Thukela–Vaal (Drakensberg scheme)',
    from: 'Thukela',
    to: 'Vaal',
    capacity: 630,
    donorDam: 'dam-woodstock',
    kwhPerMl: 1450,
    lat: -28.6,
    lon: 29.1,
  },
  {
    id: 'orange-fish',
    name: 'Orange–Fish tunnel',
    from: 'Orange (Gariep)',
    to: 'Great Fish / Sundays',
    capacity: 640,
    donorDam: 'dam-gariep',
    kwhPerMl: 0,
    lat: -30.9,
    lon: 25.9,
  },
  {
    id: 'usutu-vaal',
    name: 'Usutu–Vaal (Heyshope, Zaaihoek)',
    from: 'Usutu / Slang',
    to: 'Vaal / Olifants',
    capacity: 180,
    donorDam: 'dam-heyshope',
    kwhPerMl: 620,
    lat: -26.9,
    lon: 30.3,
  },
  {
    id: 'komati-olifants',
    name: 'Komati–Olifants (Eskom)',
    from: 'Komati',
    to: 'Olifants',
    capacity: 110,
    donorDam: 'dam-nooitgedacht',
    kwhPerMl: 540,
    lat: -25.95,
    lon: 29.8,
  },
  {
    id: 'mooi-mgeni',
    name: 'Mooi–uMngeni (Spring Grove)',
    from: 'Mooi',
    to: 'uMngeni',
    capacity: 110,
    donorDam: 'dam-spring-grove',
    kwhPerMl: 480,
    lat: -29.3,
    lon: 30.1,
  },
  {
    id: 'rse-berg',
    name: 'Riviersonderend–Berg (Theewaterskloof)',
    from: 'Riviersonderend',
    to: 'Berg / Cape Town',
    capacity: 150,
    donorDam: 'dam-theewaterskloof',
    kwhPerMl: 210,
    lat: -34.0,
    lon: 19.2,
  },
];

/** Annual transfer volume (Mm³) — reduced when the donor dam is low. */
export function transferVolume(t: Transfer, mi = LAST): number {
  const d = DAMS.find((x) => x.id === t.donorDam);
  const pct = d ? simulateDam(d.id).storage[damT(mi)] / d.capacity : 0.7;
  const r = new Rng(`tr-${t.id}-${miYear(mi)}`);
  return round(t.capacity * clamp(0.55 + 0.5 * pct, 0.4, 1) * r.range(0.9, 1.0), 0);
}

export const monthOfYear = miMonth;
