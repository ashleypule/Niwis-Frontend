import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import clsx from 'clsx';
import {
  CalendarDays,
  Clock3,
  Download,
  FileText,
  GitCompareArrows,
  Info,
  MapPin,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { moduleForPath, PRESET_LABEL, type ModuleDef } from '@/config/modules';
import { APP, isLive, isLivePath } from '@/config/app';
import { districtById, districtLabel, districtOf } from '@/config/districts';
import { useUi } from '@/store/filters';
import { useEntities, useReference } from '@/api/queries/core';
import { formatDate } from '@/lib/format';
import { downloadAll } from '@/lib/exporter';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

/**
 * Province → District → Local municipality. With the backend, /reference/municipalities is its 52 districts, so the
 * local municipalities come from the sample list (/reference/local-municipalities); in mock mode the districts do.
 */
const LIVE_DISTRICTS = isLivePath('/api/v1/reference/municipalities');

function useScopeOptions() {
  const f = useUi((s) => s.filters);
  const prov = useReference('provinces');
  const wma = useReference('wmas');
  const catchments = useReference('catchments');
  const districts = useReference(LIVE_DISTRICTS ? 'municipalities' : 'districts');
  const munis = useReference(LIVE_DISTRICTS ? 'local-municipalities' : 'municipalities');
  return useMemo(() => {
    const p = prov.data?.items ?? [];
    const w = (wma.data?.items ?? []).filter((x) => !f.province || x.parent?.split(',').includes(f.province));
    const c = (catchments.data?.items ?? []).filter(
      (x) => (!f.wma || x.wma === f.wma) && (!f.province || x.province === f.province),
    );
    const d = (districts.data?.items ?? []).filter((x) => !f.province || (x.province ?? x.parent) === f.province);
    const m = (munis.data?.items ?? []).filter(
      (x) =>
        (!f.province || x.province === f.province) &&
        (!f.wma || x.wma === f.wma) &&
        (!f.district || districtOf(x.id) === f.district),
    );
    const opt = (xs: { id: string; name: string }[]) => xs.map((x) => ({ value: x.id, label: x.name }));
    return {
      provinces: opt(p),
      wmas: opt(w),
      catchments: opt(c),
      districts: opt(d),
      municipalities: opt(m),
      hasLocal: !munis.isError,
    };
  }, [prov.data, wma.data, catchments.data, districts.data, munis.data, munis.isError, f.province, f.wma, f.district]);
}

function ScopeSelects({ mod, stacked = false }: { mod: ModuleDef; stacked?: boolean }) {
  const f = useUi((s) => s.filters);
  const setFilter = useUi((s) => s.setFilter);
  const o = useScopeOptions();
  const showSelector = !!mod.selector;
  const ents = useEntities(mod.id, { limit: 500 }, showSelector);
  const entityOpts = useMemo(
    () => (ents.data?.items ?? []).map((e) => ({ value: e.id, label: e.sub ? `${e.name} (${e.sub})` : e.name })),
    [ents.data],
  );
  const cls = stacked ? 'w-full' : 'w-[170px] xl:w-[180px]';
  return (
    <>
      <Select
        label="Location scope"
        value={f.province}
        onChange={(v) => setFilter('province', v)}
        options={o.provinces}
        placeholder="South Africa (National)"
        icon={<MapPin className="h-4 w-4" />}
        className={stacked ? 'w-full' : 'w-[200px]'}
      />
      <Select
        label="Water Management Area"
        value={f.wma}
        onChange={(v) => setFilter('wma', v)}
        options={o.wmas}
        placeholder="All WMAs"
        className={cls}
      />
      <Select
        label="Catchment"
        value={f.catchment}
        onChange={(v) => setFilter('catchment', v)}
        options={o.catchments}
        placeholder="All catchments"
        className={cls}
      />
      <Select
        label="District"
        value={f.district}
        onChange={(v) => setFilter('district', v)}
        options={o.districts}
        placeholder="All districts"
        className={cls}
      />
      {o.hasLocal && (
        <Select
          label="Local municipality"
          value={f.municipality}
          onChange={(v) => setFilter('municipality', v)}
          options={o.municipalities}
          placeholder="All local municipalities"
          className={cls}
        />
      )}
      {showSelector && (
        <Select
          // live modules serve districts, not stations
          label={isLive(mod.id) ? 'Select district' : mod.selector!.label}
          value={f.entity}
          onChange={(v) => setFilter('entity', v)}
          options={entityOpts}
          placeholder={isLive(mod.id) ? 'Select district' : mod.selector!.label}
          className={stacked ? 'w-full' : 'w-[210px]'}
        />
      )}
    </>
  );
}

function DateRange({ stacked = false }: { stacked?: boolean }) {
  const f = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const label =
    f.from || f.to ? `${f.from ? formatDate(f.from) : '…'} – ${f.to ? formatDate(f.to) : 'Latest'}` : 'Custom range';
  return (
    <div className={clsx('relative', stacked && 'w-full')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] hover:border-line-strong',
          stacked && 'w-full',
          (f.from || f.to) && 'border-primary text-primary',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Date range"
          className="absolute left-0 z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-3 shadow-pop"
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              From
              <input
                type="date"
                min="1960-01-01"
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                value={f.from ?? ''}
                onChange={(e) => setFilters({ from: e.target.value || undefined })}
              />
            </label>
            <label className="text-xs text-muted">
              To
              <input
                type="date"
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                value={f.to ?? ''}
                onChange={(e) => setFilters({ to: e.target.value || undefined })}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => setFilters({ from: undefined, to: undefined })}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Presets({ mod }: { mod: ModuleDef }) {
  const f = useUi((s) => s.filters);
  const setFilter = useUi((s) => s.setFilter);
  return (
    <div
      role="radiogroup"
      aria-label="Period"
      className="flex overflow-hidden rounded-lg border border-line bg-surface"
    >
      {mod.presets.map((p) => {
        const active = f.period === p && !f.from && !f.to;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setFilter('period', p)}
            className={clsx(
              'h-9 whitespace-nowrap px-2.5 text-[13px] transition-colors',
              active ? 'bg-primary font-semibold text-primary-ink' : 'text-ink-2 hover:bg-surface-2',
            )}
          >
            {PRESET_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

function Actions({ mod }: { mod: ModuleDef }) {
  const f = useUi((s) => s.filters);
  const setFilter = useUi((s) => s.setFilter);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const onDownload = async () => {
    setBusy(true);
    const n = await downloadAll(`niwis-${mod.id}`);
    setBusy(false);
    setMsg(n ? `${n} dataset${n > 1 ? 's' : ''} exported` : 'Nothing to export yet');
    setTimeout(() => setMsg(null), 2500);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={f.compare ? 'primary' : 'outline'}
        onClick={() => setFilter('compare', !f.compare)}
        aria-pressed={f.compare}
        title="Overlay the same period one year earlier"
      >
        <GitCompareArrows className="h-4 w-4" /> Compare
      </Button>
      <Button variant="action" onClick={onDownload} disabled={busy}>
        <Download className="h-4 w-4" /> {busy ? 'Preparing…' : 'Download Data'}
      </Button>
      <Button
        variant="primary"
        onClick={() => navigate(`/reports/print?page=${encodeURIComponent(pathname)}&${search.replace(/^\?/, '')}`)}
      >
        <FileText className="h-4 w-4" /> Generate Report
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-good">
        {msg}
      </span>
    </div>
  );
}

export function FilterBar() {
  const { pathname } = useLocation();
  const mod = moduleForPath(pathname);
  const [sheet, setSheet] = useState(false);
  const f = useUi((s) => s.filters);
  const reset = useUi((s) => s.resetFilters);
  const active = [f.province, f.wma, f.catchment, f.district, f.municipality, f.entity, f.from].filter(Boolean).length;
  const latest = (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
      Latest data: {formatDate(APP.asOf, 'datetime')} (SAST)
    </span>
  );

  return (
    <div className="no-print sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      {/* desktop / tablet */}
      <div className="mx-auto hidden max-w-[1920px] flex-wrap items-center gap-2 px-3 py-2 sm:px-4 md:flex lg:px-5">
        <ScopeSelects mod={mod} />
        <DateRange />
        <Presets mod={mod} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {latest}
          <Actions mod={mod} />
        </div>
      </div>
      <RollUpNotice mod={mod} />
      {/* phone */}
      <div className="flex items-center gap-2 px-3 py-2 md:hidden">
        <Button variant="outline" onClick={() => setSheet(true)} aria-expanded={sheet}>
          <SlidersHorizontal className="h-4 w-4" /> Filters{active ? ` (${active})` : ''}
        </Button>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Presets mod={mod} />
        </div>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-pop">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Filters</h2>
              <button type="button" className="rounded p-1" onClick={() => setSheet(false)} aria-label="Close filters">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <ScopeSelects mod={mod} stacked />
              <DateRange stacked />
              {latest}
              <Actions mod={mod} />
              <div className="mt-2 flex gap-2">
                <Button variant="ghost" onClick={reset}>
                  Reset
                </Button>
                <Button className="flex-1" onClick={() => setSheet(false)}>
                  Show results
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** On a live page a local municipality is shown as its district: say so. */
function RollUpNotice({ mod }: { mod: ModuleDef }) {
  const f = useUi((s) => s.filters);
  if (!f.municipality || !isLive(mod.id)) return null;
  const d = districtById(districtOf(f.municipality));
  if (!d) return null;
  return (
    <p
      role="status"
      className="mx-auto flex max-w-[1920px] items-center gap-1.5 px-3 pb-2 text-xs text-ink-2 sm:px-4 lg:px-5"
      data-testid="rollup-notice"
    >
      <Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      Showing <b>{districtLabel(d)}</b> — data is available at district level.
    </p>
  );
}
