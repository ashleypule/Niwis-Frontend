/**
 * DWS river gauging stations (spec §9). Codes follow the DWS convention <secondary drainage region>H<nnn>
 * (e.g. C2H007); codes and names are synthetic but drainage-region-consistent.
 * Monthly flow = upstream runoff (mm) × catchment area; daily flow is disaggregated around the monthly mean.
 */
import { APP } from '@/config/app';
import { Rng, memo } from '@/lib/prng';
import { clamp, mean, quantile } from '@/lib/stats';
import { DAY_MS, daysInMonth, miMonth, monthIndex } from '@/lib/time';
import { CATCHMENTS, municipalityById } from '../reference/regions';
import { CELLS, END_MI, START_MI, cellWaterBalance, cellsNear } from './climate';
import { locate } from './scope';

export const RIVERS_BY_WMA: Record<string, string[]> = {
  WMA1: ['Limpopo', 'Crocodile (West)', 'Mogalakwena', 'Sand', 'Luvuvhu', 'Mokolo', 'Lephalala', 'Apies', 'Elands'],
  WMA2: ['Olifants', 'Steelpoort', 'Elands', 'Wilge', 'Klein Olifants', 'Groot Letaba', 'Blyde', 'Ga-Selati'],
  WMA3: ['Komati', 'Crocodile (East)', 'Sabie', 'Usuthu', 'Lomati', 'White River', 'Kaap', 'Sand'],
  WMA4: ['Thukela', 'uMngeni', 'Mvoti', 'Mfolozi', 'Phongolo', 'Mkomazi', 'Buffalo', 'Mooi', 'Msunduzi', 'Mhlathuze'],
  WMA5: ['Vaal', 'Klip', 'Wilge', 'Suikerbosrand', 'Mooi', 'Vet', 'Harts', 'Riet', 'Modder', 'Sand'],
  WMA6: ['Orange', 'Caledon', 'Kraai', 'Ongers', 'Hartbees', 'Seekoei', 'Brak'],
  WMA7: [
    'Mzimvubu',
    'Great Kei',
    'Buffalo',
    'Keiskamma',
    'Great Fish',
    'Sundays',
    'Gamtoos',
    'Kromme',
    'Swartkops',
    'Tsitsa',
  ],
  WMA8: ['Breede', 'Gouritz', 'Olifants (Gouritz)', 'Gamka', 'Riviersonderend', 'Hex', 'Duiwenhoks'],
  WMA9: ['Berg', 'Olifants (Western)', 'Eerste', 'Diep', 'Doring', 'Lourens'],
};
const BIG_RIVERS = new Set([
  'Orange',
  'Vaal',
  'Limpopo',
  'Thukela',
  'Olifants',
  'Komati',
  'Mzimvubu',
  'Great Fish',
  'Breede',
  'Crocodile (West)',
  'Phongolo',
  'Great Kei',
]);

export interface Station {
  id: string;
  name: string;
  river: string;
  lat: number;
  lon: number;
  province: string;
  wma: string;
  municipality: string;
  cell: number;
  areaKm2: number;
  cells: number[];
  order: number;
  telemetry: boolean;
}

const N_STATIONS = 1842;

export const STATIONS: Station[] = (() => {
  const r = new Rng('stations-v1');
  const w = CELLS.map((c) => 0.15 + Math.pow(c.map / 600, 1.4) + (c.province === 'GP' ? 0.6 : 0));
  const idx = CELLS.map((_, i) => i);
  const counters = new Map<string, number>();
  const out: Station[] = [];
  for (let k = 0; k < N_STATIONS; k++) {
    const ci = r.weighted(idx, w);
    const c = CELLS[ci];
    const lat = c.lat + r.range(-0.12, 0.12);
    const lon = c.lon + r.range(-0.12, 0.12);
    const loc = locate(lon, lat);
    const rivers = RIVERS_BY_WMA[loc.wma] ?? ['Unnamed'];
    const river = r.pick(rivers);
    const big = BIG_RIVERS.has(river) && r.bool(0.6);
    const areaKm2 = Math.round(clamp(big ? r.lognormal(14000, 0.8) : r.lognormal(900, 1.0), 20, 60000));
    // nearest secondary catchment gives the drainage-region code
    let best = CATCHMENTS[0];
    let bd = Infinity;
    for (const cc of CATCHMENTS) {
      const d = (cc.lon - lon) ** 2 + (cc.lat - lat) ** 2;
      if (d < bd) {
        bd = d;
        best = cc;
      }
    }
    const region = best.id.replace(/_.*/, '');
    const n = (counters.get(region) ?? 0) + 1;
    counters.set(region, n);
    const code = `${region}H${String(n * 3 + r.int(0, 2)).padStart(3, '0')}`;
    const place = municipalityById.get(loc.municipality)?.name.replace(/^City of /, '') ?? 'site';
    out.push({
      id: code,
      name: `${river} at ${place}`,
      river,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      ...loc,
      cell: ci,
      areaKm2,
      cells: cellsNear(lon, lat, clamp(Math.sqrt(areaKm2) / 111 / 1.8, 0.15, 1.6)),
      order: big ? r.int(6, 8) : areaKm2 > 2000 ? r.int(4, 6) : r.int(1, 4),
      telemetry: r.bool(0.92),
    });
  }
  // keep codes unique
  const seen = new Set<string>();
  for (const s of out) {
    while (seen.has(s.id)) s.id = s.id.replace(/(\d+)$/, (m) => String(Number(m) + 1).padStart(3, '0'));
    seen.add(s.id);
  }
  return out;
})();

export const stationById = new Map(STATIONS.map((s) => [s.id, s]));

/** Monthly mean flow (m³/s) from START_MI to END_MI. */
export const stationMonthly = memo((id: string): Float64Array => {
  const s = stationById.get(id)!;
  const n = END_MI - START_MI + 1;
  const ro = new Float64Array(n);
  for (const i of s.cells) {
    const r = cellWaterBalance(i).runoff;
    for (let t = 0; t < n; t++) ro[t] += r[t] / s.cells.length;
  }
  return Float64Array.from(ro, (mm, t) => (mm * s.areaKm2 * 1000) / (daysInMonth(START_MI + t) * 86400));
});

/** Daily flow (m³/s) for a month, disaggregated with storm pulses and recession; averages to the monthly mean. */
export const stationDaily = memo((id: string, mi: number): number[] => {
  const m = stationMonthly(id)[mi - START_MI];
  const n = daysInMonth(mi);
  const r = new Rng(`sd-${id}-${mi}`);
  const raw: number[] = [];
  let q = 1;
  for (let d = 0; d < n; d++) {
    q = q * 0.82 + (r.bool(0.12) ? r.gamma(1.2, 2.5) : 0.18);
    raw.push(q);
  }
  const avg = mean(raw);
  return raw.map((v) => Math.max(0, (v / avg) * m));
});

export interface StationNow {
  q: number;
  qPrevYear: number;
  ltMean: number;
  percentile: number;
  anomaly: number;
  status: 'High Flow' | 'Normal' | 'Low Flow' | 'Data Delayed' | 'Offline';
  stage: number;
  bankfull: number;
  sediment: number;
  sedimentLoad: number;
  q90: number;
  q10: number;
  eflowPct: number;
  lastReading: string;
}

export const stationNow = memo((id: string): StationNow => {
  const s = stationById.get(id)!;
  const mon = stationMonthly(id);
  const L = END_MI - 1;
  const t = L - START_MI;
  const m = miMonth(L);
  const ref = Array.from({ length: 30 }, (_, k) => mon[monthIndex(1991 + k, m) - START_MI]);
  const q = mon[t];
  const pct = ref.filter((v) => v <= q).length / ref.length;
  const allRef = Array.from(mon.slice(monthIndex(1991, 0) - START_MI, monthIndex(2020, 11) - START_MI + 1));
  const q90 = quantile(allRef, 0.1);
  const q10 = quantile(allRef, 0.9);
  const meanQ = mean(allRef);
  const r = new Rng(`stnow-${id}`);
  const offline = !s.telemetry || r.bool(0.03);
  const delayed = !offline && r.bool(0.05);
  const status: StationNow['status'] = offline
    ? 'Offline'
    : delayed
      ? 'Data Delayed'
      : pct >= 0.9
        ? 'High Flow'
        : pct <= 0.15
          ? 'Low Flow'
          : 'Normal';
  const last12 = Array.from(mon.slice(t - 11, t + 1));
  const sed = 25 * Math.pow(Math.max(0.01, q) / Math.max(0.01, meanQ), 0.7) * (1 + CELLS[s.cell].aridity);
  return {
    q,
    qPrevYear: mon[t - 12],
    ltMean: mean(ref),
    percentile: pct,
    anomaly: ((q - mean(ref)) / Math.max(0.001, mean(ref))) * 100,
    status,
    stage: 0.32 * Math.pow(Math.max(0.01, q), 0.38),
    bankfull: 0.32 * Math.pow(quantile(allRef, 0.995) * 3, 0.38),
    sediment: sed,
    sedimentLoad: sed * q * 0.0864,
    q90,
    q10,
    eflowPct: (last12.filter((v) => v >= q90).length / 12) * 100,
    lastReading: new Date(
      APP.asOf.getTime() - (offline ? r.range(3, 30) : delayed ? r.range(1, 3) : r.range(0.01, 0.2)) * DAY_MS,
    ).toISOString(),
  };
});

export function ssiClass(p: number): string {
  return p >= 0.9 ? 'High Flow' : p <= 0.15 ? 'Low Flow' : 'Normal';
}
