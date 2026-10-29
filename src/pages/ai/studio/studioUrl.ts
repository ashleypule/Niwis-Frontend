/**
 * The Studio's choices in the URL, so a link reopens the same forecast (and re-runs it, or loads it from the server's
 * cache): /ai?table=…&column=…&level=province&area=WC&model=auto&horizon=12&resolution=monthly&inputs=t|c,t|c&run=1
 * The page filters (province, district, …) are separate parameters and are left alone.
 */
import type { RunRequest } from '@/types/forecast';

export type Level = RunRequest['scope']['level'];
export const STUDIO_KEYS = ['table', 'column', 'level', 'area', 'model', 'horizon', 'resolution', 'inputs', 'run'];

export interface StudioState {
  table?: string;
  column?: string;
  level: Level;
  area?: string;
  model: string;
  horizon: number;
  resolution: 'monthly' | 'daily';
  /** "table|column" */
  inputs: string[];
}

export const DEFAULT_STATE: StudioState = {
  level: 'national',
  model: 'auto',
  horizon: 12,
  resolution: 'monthly',
  inputs: [],
};
const LEVELS: Level[] = ['national', 'province', 'district', 'wma'];

export function stateFromParams(sp: URLSearchParams): StudioState {
  const level = sp.get('level') as Level | null;
  const horizon = Number(sp.get('horizon'));
  return {
    table: sp.get('table') ?? undefined,
    column: sp.get('column') ?? undefined,
    level: level && LEVELS.includes(level) ? level : 'national',
    area: sp.get('area') ?? undefined,
    model: sp.get('model') || 'auto',
    horizon: Number.isInteger(horizon) && horizon > 0 ? horizon : 12,
    resolution: sp.get('resolution') === 'daily' ? 'daily' : 'monthly',
    inputs: (sp.get('inputs') ?? '').split(',').filter((x) => x.includes('|')),
  };
}

export function paramsFromState(s: StudioState, base: URLSearchParams, run: boolean): URLSearchParams {
  const sp = new URLSearchParams(base);
  STUDIO_KEYS.forEach((k) => sp.delete(k));
  if (s.table) sp.set('table', s.table);
  if (s.column) sp.set('column', s.column);
  if (s.level !== 'national') {
    sp.set('level', s.level);
    if (s.area) sp.set('area', s.area);
  }
  sp.set('model', s.model);
  sp.set('horizon', String(s.horizon));
  if (s.resolution === 'daily') sp.set('resolution', 'daily');
  if (s.inputs.length) sp.set('inputs', s.inputs.join(','));
  if (run) sp.set('run', '1');
  return sp;
}

/** The run request for a complete state (undefined while a choice is missing). */
export function requestOf(s: StudioState): RunRequest | undefined {
  if (!s.table || !s.column) return undefined;
  if (s.level !== 'national' && !s.area) return undefined;
  return {
    table: s.table,
    column: s.column,
    scope: s.level === 'national' ? { level: 'national' } : { level: s.level, id: s.area },
    model: s.model,
    horizon: s.horizon,
    inputs: s.inputs.map((x) => {
      const [table, column] = x.split('|');
      return { table, column };
    }),
    resolution: s.resolution,
  };
}
