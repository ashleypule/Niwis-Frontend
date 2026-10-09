/** /reference/{type} lists and /search. */
import type { RefList, SearchHit, SearchResult } from '@/types/api';
import { CATCHMENTS, MUNICIPALITIES, PROVINCES, WMAS, provinceName, wmaName } from '../reference/regions';
import type { Ctx } from './build';

export type SearchSource = () => SearchHit[];
const SOURCES: SearchSource[] = [];
export function registerSearchSource(s: SearchSource) {
  SOURCES.push(s);
}

const wmaProvinces = new Map<string, string>(
  WMAS.map((w) => [
    w.id,
    Array.from(new Set(MUNICIPALITIES.filter((m) => m.wma === w.id).map((m) => m.province))).join(','),
  ]),
);

/** Secondary catchments can be split into several polygons — keep the largest part per id. */
const UNIQUE_CATCHMENTS = [
  ...new Map([...CATCHMENTS].sort((a, b) => a.areaKm2 - b.areaKm2).map((c) => [c.id, c])).values(),
];

export function referenceHandler(type: string, _ctx: Ctx): RefList | null {
  switch (type) {
    case 'provinces':
      return { type, items: PROVINCES.map((p) => ({ id: p.id, name: p.name })) };
    case 'wmas':
      return { type, items: WMAS.map((w) => ({ id: w.id, name: w.name, parent: wmaProvinces.get(w.id) })) };
    case 'catchments':
      return {
        type,
        items: UNIQUE_CATCHMENTS.map((c) => ({
          id: c.id,
          name: `${c.id} – ${wmaName(c.wma ?? '')}`,
          province: c.province ?? undefined,
          wma: c.wma ?? undefined,
        })).sort((a, b) => a.id.localeCompare(b.id)),
      };
    case 'municipalities':
      return {
        type,
        items: MUNICIPALITIES.map((m) => ({ id: m.id, name: m.name, province: m.province, wma: m.wma })).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };
    default:
      return null;
  }
}

let index: SearchHit[] | null = null;
function buildIndex(): SearchHit[] {
  const base: SearchHit[] = [
    ...PROVINCES.map((p) => ({
      type: 'province',
      id: p.id,
      label: p.name,
      sublabel: 'Province',
      path: '/',
      params: { province: p.id },
    })),
    ...WMAS.map((w) => ({
      type: 'wma',
      id: w.id,
      label: `${w.name} WMA`,
      sublabel: 'Water Management Area',
      path: '/',
      params: { wma: w.id },
    })),
    ...UNIQUE_CATCHMENTS.map((c) => ({
      type: 'catchment',
      id: c.id,
      label: `Catchment ${c.id}`,
      sublabel: `${wmaName(c.wma ?? '')} WMA`,
      path: '/runoff',
      params: { catchment: c.id },
    })),
    ...MUNICIPALITIES.map((m) => ({
      type: 'municipality',
      id: m.id,
      label: m.name,
      sublabel: provinceName(m.province),
      path: '/',
      params: { province: m.province, municipality: m.id },
    })),
  ];
  for (const s of SOURCES) base.push(...s());
  return base;
}

export function searchHandler(q: string): SearchResult {
  index ??= buildIndex();
  const t = q.trim().toLowerCase();
  if (t.length < 2) return { q, hits: [] };
  const scored = index
    .map((h) => {
      const l = h.label.toLowerCase();
      const score =
        l === t
          ? 0
          : l.startsWith(t)
            ? 1
            : l.includes(t)
              ? 2
              : h.id.toLowerCase().includes(t)
                ? 3
                : (h.sublabel ?? '').toLowerCase().includes(t)
                  ? 4
                  : 9;
      return { h, score };
    })
    .filter((x) => x.score < 9)
    .sort((a, b) => a.score - b.score || a.h.label.localeCompare(b.h.label));
  return { q, hits: scored.slice(0, 25).map((x) => x.h) };
}
