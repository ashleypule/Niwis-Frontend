/** Shared mock helpers: map layers, region aggregation, sparklines. */
import { APP } from '@/config/app';
import { round } from '@/lib/stats';
import { miToIso } from '@/lib/time';
import type { MapLayer, MapPoint } from '@/types/api';
import { CATCHMENTS, MUNICIPALITIES, PROVINCES, WMAS } from '../reference/regions';
import { ALL_CELLS, CELLS, GRID_STEP_DEG, cellAt, cellsNear } from './_grid';

export { ALL_CELLS, CELLS };

const muniCells = new Map<string, number[]>();
for (const m of MUNICIPALITIES) {
  const cs = ALL_CELLS.filter((i) => CELLS[i].municipality === m.id);
  muniCells.set(m.id, cs.length ? cs : [cellAt(m.lon, m.lat)]);
}
const provCells = new Map<string, number[]>(PROVINCES.map((p) => [p.id, ALL_CELLS.filter((i) => CELLS[i].province === p.id)]));
const wmaCells = new Map<string, number[]>(WMAS.map((w) => [w.id, ALL_CELLS.filter((i) => CELLS[i].wma === w.id)]));
const catCells = new Map<string, number[]>(CATCHMENTS.map((c) => [c.id, cellsNear(c.lon, c.lat, Math.max(0.3, Math.sqrt(c.areaKm2) / 111 / 1.6))]));

export type Level = 'province' | 'wma' | 'catchment' | 'municipality';

export function cellsOf(level: Level, id: string): number[] {
  return (level === 'province' ? provCells : level === 'wma' ? wmaCells : level === 'catchment' ? catCells : muniCells).get(id) ?? [];
}

export function regionIds(level: Level): string[] {
  return level === 'province' ? PROVINCES.map((p) => p.id) : level === 'wma' ? WMAS.map((w) => w.id) : level === 'catchment' ? CATCHMENTS.map((c) => c.id) : MUNICIPALITIES.map((m) => m.id);
}

/** Area-weighted mean of a per-cell value over a region (nulls skipped). */
export function regionMean(cells: number[], fn: (i: number) => number | null): number | null {
  let s = 0;
  let w = 0;
  for (const i of cells) {
    const v = fn(i);
    if (v == null || Number.isNaN(v)) continue;
    s += v * CELLS[i].areaKm2;
    w += CELLS[i].areaKm2;
  }
  return w ? s / w : null;
}

export const asOfDate = () => APP.asOf.toISOString().slice(0, 10);

export function gridLayer(id: string, title: string, scale: string, unit: string, fn: (i: number) => number | null, decimals = 2): MapLayer {
  return {
    id,
    title,
    kind: 'grid',
    level: 'grid',
    scale,
    unit,
    date: asOfDate(),
    cellSize: GRID_STEP_DEG,
    cells: ALL_CELLS.map((i) => {
      const v = fn(i);
      return [CELLS[i].lon, CELLS[i].lat, v == null || Number.isNaN(v) ? null : round(v, decimals)] as [number, number, number | null];
    }),
  };
}

export function choropleth(id: string, title: string, level: Level, scale: string, unit: string, fn: (regionId: string, cells: number[]) => number | string | null, decimals = 2): MapLayer {
  const values: Record<string, number | string | null> = {};
  for (const rid of regionIds(level)) {
    const v = fn(rid, cellsOf(level, rid));
    values[rid] = typeof v === 'number' ? round(v, decimals) : v;
  }
  return { id, title, kind: 'choropleth', level, scale, unit, date: asOfDate(), values };
}

export function pointsLayer(id: string, title: string, scale: string, unit: string, points: MapPoint[]): MapLayer {
  return { id, title, kind: 'points', level: 'point', scale, unit, date: asOfDate(), points };
}

export function spark(fn: (mi: number) => number | null, endMi: number, n = 12): number[] {
  const out: number[] = [];
  for (let mi = endMi - n + 1; mi <= endMi; mi++) {
    const v = fn(mi);
    if (v != null && !Number.isNaN(v)) out.push(v);
  }
  return out;
}

export const iso = miToIso;
