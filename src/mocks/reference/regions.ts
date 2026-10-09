/** Provinces, WMAs and lookups. Geometry-derived fields come from generated.ts (public/geo). */
import { CATCHMENTS, GRID_CELLS, MUNICIPALITIES, PROVINCE_GEO, WMA_GEO } from './generated';
import type { MunicipalityRef } from './types';

export interface Province {
  id: string;
  name: string;
  /** Census 2022 (Stats SA) */
  population: number;
  households: number;
  capital: string;
  lon: number;
  lat: number;
  areaKm2: number;
}

const PROV_META: Record<string, { population: number; households: number; capital: string }> = {
  EC: { population: 7_230_204, households: 1_993_000, capital: 'Bhisho' },
  FS: { population: 2_964_412, households: 946_000, capital: 'Bloemfontein' },
  GP: { population: 15_099_422, households: 5_265_000, capital: 'Johannesburg' },
  KZN: { population: 12_423_907, households: 3_237_000, capital: 'Pietermaritzburg' },
  LP: { population: 6_572_720, households: 1_812_000, capital: 'Polokwane' },
  MP: { population: 5_143_324, households: 1_469_000, capital: 'Mbombela' },
  NW: { population: 3_804_548, households: 1_183_000, capital: 'Mahikeng' },
  NC: { population: 1_355_946, households: 384_000, capital: 'Kimberley' },
  WC: { population: 7_433_019, households: 2_264_000, capital: 'Cape Town' },
};

export const PROVINCES: Province[] = PROVINCE_GEO.map((p) => ({ ...p, ...PROV_META[p.id] })).sort((a, b) => a.name.localeCompare(b.name));
/** Display order used across the dashboards (as in the mockups) */
export const PROVINCE_ORDER = ['WC', 'EC', 'NC', 'FS', 'KZN', 'NW', 'GP', 'MP', 'LP'];

export const provinceName = (id: string): string => PROVINCES.find((p) => p.id === id)?.name ?? id;

export interface Wma {
  id: string;
  name: string;
  /** short code used on compact axes */
  code: string;
  lon: number;
  lat: number;
  areaKm2: number;
}
const WMA_CODES: Record<string, string> = {
  WMA1: 'LIM',
  WMA2: 'OLIF',
  WMA3: 'INKO',
  WMA4: 'PONG',
  WMA5: 'VAAL',
  WMA6: 'ORAN',
  WMA7: 'MZIM',
  WMA8: 'BRGO',
  WMA9: 'BEOL',
};
export const WMAS: Wma[] = WMA_GEO.map((w) => ({ ...w, code: WMA_CODES[w.id] })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
export const wmaName = (id: string): string => WMAS.find((w) => w.id === id)?.name ?? id;

export { CATCHMENTS, MUNICIPALITIES, GRID_CELLS };

export const municipalityById = new Map<string, MunicipalityRef>(MUNICIPALITIES.map((m) => [m.id, m]));

/** Metros (Census 2022 population) — used to weight demand, services and settlements. */
export const METROS: Record<string, number> = {
  'City of Johannesburg': 4_803_262,
  'City of Cape Town': 4_772_846,
  eThekwini: 4_239_901,
  Ekurhuleni: 4_066_691,
  'City of Tshwane': 4_040_315,
  'Nelson Mandela Bay': 1_190_496,
  'Buffalo City': 975_255,
  Mangaung: 811_431,
};

/**
 * Approximate municipal population: metros from Census 2022, other municipalities share the remainder of their
 * province in proportion to area^0.35 × (rainfall-driven settlement density proxy, applied by callers).
 */
export const municipalPopulation: Map<string, number> = (() => {
  const out = new Map<string, number>();
  for (const p of PROVINCES) {
    const munis = MUNICIPALITIES.filter((m) => m.province === p.id);
    const metroPop = munis.reduce((s, m) => s + (METROS[m.name] ?? 0), 0);
    const rest = munis.filter((m) => !METROS[m.name]);
    const w = rest.map((m) => Math.pow(m.areaKm2, 0.35) * (1 + ((m.id.charCodeAt(4) * 7) % 10) / 10));
    const tw = w.reduce((a, b) => a + b, 0);
    munis.forEach((m) => {
      if (METROS[m.name]) out.set(m.id, METROS[m.name]);
    });
    rest.forEach((m, i) => out.set(m.id, Math.round(((p.population - metroPop) * w[i]) / tw)));
  }
  return out;
})();
