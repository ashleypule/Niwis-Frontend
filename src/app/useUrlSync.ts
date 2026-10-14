import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { FILTER_KEYS, filtersFromParams, useUi, type Filters } from '@/store/filters';

function toSearch(f: Filters, keep: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams();
  // keep non-filter params (e.g. page tabs)
  keep.forEach((v, k) => {
    if (!(FILTER_KEYS as readonly string[]).includes(k)) sp.set(k, v);
  });
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v === undefined || v === '' || v === false) continue;
    if (k === 'period' && v === '12M') continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  return sp;
}

/** Two-way sync between the filter store and the URL query string. */
export function useUrlSync() {
  const [sp, setSp] = useSearchParams();
  const { pathname } = useLocation();
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const lastWritten = useRef<string>('');
  const section = pathname.split('/')[1] ?? '';
  const prevSection = useRef(section);

  // URL → store (initial load, back/forward, links from search)
  useEffect(() => {
    const s = sp.toString();
    if (s === lastWritten.current) return;
    const parsed = filtersFromParams(sp);
    setFilters({
      province: undefined,
      wma: undefined,
      catchment: undefined,
      district: undefined,
      municipality: undefined,
      entity: undefined,
      from: undefined,
      to: undefined,
      period: '12M',
      compare: false,
      ...parsed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // the selected entity is page-specific: drop it when moving to another module
  useEffect(() => {
    if (prevSection.current !== section) {
      prevSection.current = section;
      if (!sp.get('entity')) setFilters({ entity: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // store → URL
  useEffect(() => {
    const next = toSearch(filters, sp);
    const s = next.toString();
    if (s !== sp.toString()) {
      lastWritten.current = s;
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
}
