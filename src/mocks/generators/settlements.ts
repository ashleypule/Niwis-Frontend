/**
 * Drought-affected settlements: environmental drought exposure (SPI-6, VCI, nearby dam storage, groundwater)
 * combined with socio-economic vulnerability (spec §20) into a risk score. Risk is derived, never random.
 */
import { droughtClassFromSpi, riskFromScore } from '@/config/thresholds';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean } from '@/lib/stats';
import { SETTLEMENT_ROWS, type SettlementType } from '../reference/settlements';
import { CELLS, cellAt } from './climate';
import { MUNICIPALITIES } from '../reference/regions';

const MUNI_NAMES = new Map(MUNICIPALITIES.map((m) => [m.id, m.name.replace(/^City of /, '')]));
import { DAMS, damNow } from './dams';
import { cellSpi, cellVci, LAST, tailAt, tOf } from './hydromet';
import { BOREHOLES, boreholeNow } from './groundwater';
import { locate } from './scope';

export interface Settlement {
  id: string;
  name: string;
  lat: number;
  lon: number;
  province: string;
  wma: string;
  municipality: string;
  type: SettlementType;
  population: number;
  households: number;
  /** socio-economic vulnerability 0–1 */
  vulnerability: number;
  povertyIndex: number;
  waterBacklogPct: number;
  storageLitresPerHh: number;
  primarySource: 'Borehole' | 'Dam / reservoir' | 'River abstraction' | 'Bulk scheme';
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const NAMED: Settlement[] = SETTLEMENT_ROWS.map(([name, lat, lon, type = 'Rural village']) => {
  const r = new Rng(`settlement-${name}`);
  const loc = locate(lon, lat);
  const pop = Math.round(type === 'Small town' ? r.range(2500, 18000) : type === 'Peri-urban' ? r.range(8000, 45000) : type === 'Informal settlement' ? r.range(3000, 25000) : r.range(800, 9000));
  const vulnerability = clamp((type === 'Small town' ? 0.35 : type === 'Peri-urban' ? 0.5 : 0.62) + r.normal(0, 0.12), 0.1, 0.95);
  return {
    id: `set-${slug(name)}`,
    name,
    lat,
    lon,
    ...loc,
    type,
    population: pop,
    households: Math.round(pop / r.range(3.2, 4.1)),
    vulnerability: Math.round(vulnerability * 100) / 100,
    povertyIndex: Math.round(clamp(vulnerability * 100 + r.normal(0, 8), 5, 95)),
    waterBacklogPct: Math.round(clamp(vulnerability * 45 + r.normal(0, 8), 2, 80)),
    storageLitresPerHh: Math.round(r.range(80, 1200)),
    primarySource: r.weighted(['Borehole', 'Dam / reservoir', 'River abstraction', 'Bulk scheme'] as const, [0.45, 0.25, 0.1, 0.2]),
  };
});

/**
 * Generated settlement clusters (rural villages / informal areas) so the register covers ~1 250 monitored
 * settlements as in the mockups. Names are explicit cluster labels, not real place names.
 */
const CLUSTERS: Settlement[] = (() => {
  const r = new Rng('settlement-clusters');
  const out: Settlement[] = [];
  const idx = CELLS.map((_, i) => i);
  const w = CELLS.map((c) => 0.25 + c.aridity * 1.4 + (c.province === 'LP' || c.province === 'EC' || c.province === 'KZN' ? 0.5 : 0));
  const counter = new Map<string, number>();
  for (let k = 0; k < 1120; k++) {
    const ci = r.weighted(idx, w);
    const c = CELLS[ci];
    const lat = c.lat + r.range(-0.12, 0.12);
    const lon = c.lon + r.range(-0.12, 0.12);
    const loc = locate(lon, lat);
    const muni = MUNI_NAMES.get(loc.municipality) ?? 'Rural';
    const n = (counter.get(loc.municipality) ?? 0) + 1;
    counter.set(loc.municipality, n);
    const type = r.weighted(['Rural village', 'Farming community', 'Informal settlement', 'Peri-urban'] as const, [0.55, 0.2, 0.15, 0.1]);
    const pop = Math.round(type === 'Peri-urban' ? r.range(3000, 15000) : type === 'Informal settlement' ? r.range(1500, 9000) : r.range(400, 4500));
    const vulnerability = clamp((type === 'Peri-urban' ? 0.5 : 0.62) + r.normal(0, 0.12), 0.1, 0.95);
    out.push({
      id: `set-c${String(k + 1).padStart(4, '0')}`,
      name: `${muni} ${type === 'Informal settlement' ? 'informal area' : type === 'Farming community' ? 'farm community' : 'village cluster'} ${n}`,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      ...loc,
      type,
      population: pop,
      households: Math.round(pop / r.range(3.2, 4.1)),
      vulnerability: Math.round(vulnerability * 100) / 100,
      povertyIndex: Math.round(clamp(vulnerability * 100 + r.normal(0, 8), 5, 95)),
      waterBacklogPct: Math.round(clamp(vulnerability * 45 + r.normal(0, 8), 2, 80)),
      storageLitresPerHh: Math.round(r.range(60, 900)),
      primarySource: r.weighted(['Borehole', 'Dam / reservoir', 'River abstraction', 'Bulk scheme'] as const, [0.55, 0.15, 0.15, 0.15]),
    });
  }
  return out;
})();

export const SETTLEMENTS: Settlement[] = [...NAMED, ...CLUSTERS];
export const settlementById = new Map(SETTLEMENTS.map((s) => [s.id, s]));

/** Nearest dams and boreholes per settlement (computed once). */
const nearestCache = new Map<string, { dams: string[]; bhs: string[] }>();
function nearestOf(s: Settlement) {
  let hit = nearestCache.get(s.id);
  if (!hit) {
    hit = { dams: nearestDams(s.lat, s.lon).map((d) => d.id), bhs: nearestBoreholes(s.lat, s.lon).map((b) => b.id) };
    nearestCache.set(s.id, hit);
  }
  return hit;
}

function nearestDams(lat: number, lon: number, n = 2) {
  return [...DAMS]
    .filter((d) => d.province !== 'LS')
    .sort((a, b) => (a.lat - lat) ** 2 + (a.lon - lon) ** 2 - ((b.lat - lat) ** 2 + (b.lon - lon) ** 2))
    .slice(0, n);
}
function nearestBoreholes(lat: number, lon: number, n = 3) {
  return [...BOREHOLES].sort((a, b) => (a.lat - lat) ** 2 + (a.lon - lon) ** 2 - ((b.lat - lat) ** 2 + (b.lon - lon) ** 2)).slice(0, n);
}

export interface SettlementNow {
  spi6: number;
  vci: number;
  damPct: number;
  sgi: number;
  /** drought exposure 0–1 */
  exposure: number;
  /** risk score 0–1 = exposure × vulnerability blend */
  score: number;
  risk: ReturnType<typeof riskFromScore>;
  droughtClass: ReturnType<typeof droughtClassFromSpi>;
  reliability: number;
  altSupply: number;
  status: 'Intervention' | 'In progress' | 'Planned' | 'Monitoring';
  tankerDays: number;
}

export const settlementNow = memo((id: string, mi: number = LAST): SettlementNow => {
  const s = settlementById.get(id)!;
  const ci = cellAt(s.lon, s.lat);
  const spi6 = tailAt(cellSpi(ci, 6), mi) ?? 0;
  const vci = cellVci(ci)[tOf(mi)];
  const near = nearestOf(s);
  const damPct = mean(near.dams.map((d) => damNow(d).pct));
  const sgi = mean(near.bhs.map((b) => boreholeNow(b).sgi));
  const exposure = clamp(0.35 * clamp((-spi6 + 0.5) / 2.5, 0, 1) + 0.25 * clamp((50 - vci) / 50, 0, 1) + 0.2 * clamp((60 - damPct) / 60, 0, 1) + 0.2 * clamp((-sgi + 0.3) / 2, 0, 1), 0, 1);
  const score = clamp(exposure * (0.55 + 0.5 * s.vulnerability), 0, 1);
  const r = new Rng(`setnow-${id}`);
  const risk = riskFromScore(score);
  const reliability = Math.round(clamp(98 - score * 48 + r.normal(0, 5), 25, 99.5));
  return {
    spi6,
    vci,
    damPct: Math.round(damPct),
    sgi: Math.round(sgi * 100) / 100,
    exposure: Math.round(exposure * 100) / 100,
    score: Math.round(score * 100) / 100,
    risk,
    droughtClass: droughtClassFromSpi(spi6),
    reliability,
    altSupply: Math.round(clamp(30 + score * 60 + r.normal(0, 8), 5, 98)),
    status: risk === 'Very High' ? 'Intervention' : risk === 'High' ? (r.bool(0.5) ? 'Intervention' : 'In progress') : risk === 'Moderate' ? (r.bool(0.5) ? 'Planned' : 'Monitoring') : 'Monitoring',
    tankerDays: risk === 'Very High' || risk === 'High' ? Math.round(r.range(20, 180)) : 0,
  };
});

/** Settlements at risk = High or Very High risk (used by Drought, Settlements and Overview). */
export function atRisk(list: Settlement[], mi = LAST) {
  return list.filter((s) => {
    const n = settlementNow(s.id, mi);
    return n.risk === 'High' || n.risk === 'Very High';
  });
}
