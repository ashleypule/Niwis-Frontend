/** Resolve global filter params into a spatial scope: a set of grid cells and a predicate for point entities. */
import type { Scope } from '@/types/api';
import { CATCHMENTS, MUNICIPALITIES, PROVINCES, WMAS, municipalityById } from '../reference/regions';
import { ALL_CELLS, CELLS, cellsNear } from './climate';

export interface ResolvedScope extends Scope {
  cells: number[];
  /** predicate for entities with province / wma / municipality / coordinates */
  includes: (e: { province?: string; wma?: string; municipality?: string; lat?: number; lon?: number }) => boolean;
  /** stable key for memoisation */
  key: string;
}

const catchmentCells = new Map<string, number[]>();

export function resolveScope(params: URLSearchParams | Record<string, string | undefined>): ResolvedScope {
  const get = (k: string) =>
    (params instanceof URLSearchParams ? (params.get(k) ?? undefined) : params[k]) || undefined;
  const municipality = get('municipality');
  const catchment = get('catchment');
  const wma = get('wma');
  const province = get('province');

  if (municipality && municipalityById.has(municipality)) {
    const m = municipalityById.get(municipality)!;
    let cells = ALL_CELLS.filter((i) => CELLS[i].municipality === municipality);
    if (!cells.length) cells = cellsNear(m.lon, m.lat, 0.2);
    return {
      level: 'municipality',
      id: m.id,
      name: m.name,
      cells,
      key: `m:${m.id}`,
      includes: (e) => e.municipality === m.id,
    };
  }
  if (catchment) {
    const c = CATCHMENTS.find((x) => x.id === catchment);
    if (c) {
      let cells = catchmentCells.get(c.id);
      if (!cells) {
        const r = Math.sqrt(c.areaKm2) / 111 / 1.6;
        cells = cellsNear(c.lon, c.lat, Math.max(0.3, r));
        catchmentCells.set(c.id, cells);
      }
      const set = new Set(cells);
      const near = (e: { lat?: number; lon?: number }) =>
        e.lat != null &&
        e.lon != null &&
        cells!.some((i) => Math.abs(CELLS[i].lat - e.lat!) <= 0.13 && Math.abs(CELLS[i].lon - e.lon!) <= 0.13);
      return {
        level: 'catchment',
        id: c.id,
        name: `Catchment ${c.id}`,
        cells: [...set],
        key: `c:${c.id}`,
        includes: near,
      };
    }
  }
  if (wma) {
    const w = WMAS.find((x) => x.id === wma);
    if (w) {
      const cells = ALL_CELLS.filter((i) => CELLS[i].wma === wma);
      return {
        level: 'wma',
        id: w.id,
        name: `${w.name} WMA`,
        cells,
        key: `w:${w.id}`,
        includes: (e) => e.wma === w.id,
      };
    }
  }
  if (province) {
    const p = PROVINCES.find((x) => x.id === province);
    if (p) {
      const cells = ALL_CELLS.filter((i) => CELLS[i].province === province);
      return {
        level: 'province',
        id: p.id,
        name: p.name,
        cells,
        key: `p:${p.id}`,
        includes: (e) => e.province === p.id,
      };
    }
  }
  return { level: 'national', id: 'ZA', name: 'South Africa', cells: ALL_CELLS, key: 'za', includes: () => true };
}

export const provinceScope = (id: string) => resolveScope({ province: id });
export const wmaScope = (id: string) => resolveScope({ wma: id });
export const nationalScope = () => resolveScope({});

/** Municipality metadata for an arbitrary coordinate (nearest grid cell). */
export function locate(lon: number, lat: number): { province: string; wma: string; municipality: string } {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < CELLS.length; i++) {
    const d = (CELLS[i].lon - lon) ** 2 + (CELLS[i].lat - lat) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const c = CELLS[best];
  return {
    province: c.province,
    wma: c.wma || MUNICIPALITIES.find((m) => m.id === c.municipality)?.wma || 'WMA6',
    municipality: c.municipality,
  };
}
