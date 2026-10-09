import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CornerDownLeft, Search } from 'lucide-react';
import clsx from 'clsx';
import { useUi } from '@/store/filters';
import { useSearch } from '@/api/queries/core';
import { MODULES } from '@/config/modules';
import type { SearchHit } from '@/types/api';

const TYPE_LABEL: Record<string, string> = {
  page: 'Page',
  province: 'Province',
  wma: 'Water Management Area',
  catchment: 'Catchment',
  municipality: 'Municipality',
  dam: 'Dam',
  station: 'Gauging station',
  borehole: 'Borehole',
  wwtw: 'WWTW',
  wss: 'Water supply system',
  settlement: 'Settlement',
  aquifer: 'Aquifer',
};

export function CommandPalette() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useSearch(q);

  const pageHits: SearchHit[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    return MODULES.filter((m) => !t || m.label.toLowerCase().includes(t) || m.short.toLowerCase().includes(t))
      .slice(0, t ? 5 : 8)
      .map((m) => ({
        type: 'page',
        id: m.id,
        label: m.label,
        sublabel: m.keywords.slice(0, 3).join(' · '),
        path: m.path,
      }));
  }, [q]);
  const hits = useMemo(
    () => [...pageHits, ...(q.trim().length >= 2 ? (data?.hits ?? []) : [])].slice(0, 30),
    [pageHits, data, q],
  );

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  const choose = (h: SearchHit) => {
    setOpen(false);
    // URL → store sync applies the scope; writing the store here as well would race the navigation
    navigate({ pathname: h.path, search: h.params ? `?${new URLSearchParams(h.params).toString()}` : '' });
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 text-muted" aria-hidden="true" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(hits.length - 1, a + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === 'Enter' && hits[active]) choose(hits[active]);
            }}
            placeholder="Search provinces, WMAs, catchments, municipalities, dams, stations, boreholes, WWTWs…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={hits[active] ? `hit-${active}` : undefined}
          />
          {isFetching && <span className="text-xs text-muted">Searching…</span>}
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.type}-${h.id}`}
              id={`hit-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(h)}
              className={clsx(
                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                i === active ? 'bg-primary-soft' : 'hover:bg-surface-2',
              )}
            >
              <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {TYPE_LABEL[h.type] ?? h.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{h.label}</span>
                {h.sublabel && <span className="block truncate text-xs text-muted">{h.sublabel}</span>}
              </span>
              {i === active && <CornerDownLeft className="h-4 w-4 text-muted" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
