import { useSummary } from '@/api/queries/core';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { KpiCard } from '@/components/kpi/KpiCard';
import { ErrorState, LoadingState, UnavailableState } from '@/components/feedback/PanelBoundary';
import { panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { isUnavailable } from '@/api/client';
import { isLive } from '@/config/app';
import type { ModuleId } from '@/config/modules';
import type { Kpi } from '@/types/api';

/**
 * Overview KPIs that belong to a live module come from that module's summary (the same query, so the Overview and the
 * module page always show the same number); the rest stay on the overview sample data and are marked Sample. When the
 * overview's own summary is not available (production: the API has no overview table) the live cards still show, and
 * one card says why the others are missing.
 */
export const OVERVIEW_LIVE_KPIS: Record<string, { module: ModuleId; id: string; label: string }> = {
  rain: { module: 'rainfall', id: 'total', label: 'Rainfall (National)' },
  drought: { module: 'drought', id: 'class', label: 'Drought Status' },
  dams: { module: 'dams', id: 'storage', label: 'Dam Storage (FSC)' },
  streamflow: { module: 'runoff', id: 'anomaly', label: 'Runoff Anomaly (12 months)' },
  gw: { module: 'groundwater', id: 'anomaly', label: 'Groundwater Levels' },
  wq: { module: 'water-quality', id: 'compliance', label: 'Water Quality (Compliance)' },
};

type Slot = { kpi?: Kpi; prov: PanelProvenance; state?: 'loading' | 'error' | 'unavailable'; error?: unknown };

export function OverviewKpis() {
  const base = useSummary('overview');
  // one summary query per live module (a fixed set of hooks); the module page uses the same query
  const rain = useSummary('rainfall', {}, isLive('rainfall'));
  const drought = useSummary('drought', {}, isLive('drought'));
  const dams = useSummary('dams', {}, isLive('dams'));
  const streamflow = useSummary('runoff', {}, isLive('runoff'));
  const gw = useSummary('groundwater', {}, isLive('groundwater'));
  const wq = useSummary('water-quality', {}, isLive('water-quality'));
  if (!Object.values(OVERVIEW_LIVE_KPIS).some((o) => isLive(o.module))) return <KpiStrip module="overview" count={8} />;

  const live: Record<string, typeof rain> = { rain, drought, dams, streamflow, gw, wq };
  const baseProv = panelProvenance(base, 'overview');
  const slot = (k: Kpi): Slot => {
    const o = OVERVIEW_LIVE_KPIS[k.id];
    if (!o || !isLive(o.module)) return { kpi: k, prov: baseProv };
    const q = live[k.id];
    if (q.isError)
      return { prov: { kind: 'none' }, state: isUnavailable(q.error) ? 'unavailable' : 'error', error: q.error };
    const found = q.data?.kpis.find((x) => x.id === o.id);
    if (!found) return { prov: { kind: 'none' }, state: q.data ? 'unavailable' : 'loading' };
    return { kpi: { ...found, label: o.label }, prov: panelProvenance(q, o.module) };
  };

  // production: no overview summary → the live module cards alone, then the API's reason for the rest
  const baseUnavailable = base.isError && isUnavailable(base.error);
  const cards: Kpi[] | undefined =
    base.data?.kpis ??
    (baseUnavailable
      ? Object.keys(OVERVIEW_LIVE_KPIS)
          .filter((id) => isLive(OVERVIEW_LIVE_KPIS[id].module))
          .map((id) => ({ id }) as Kpi)
      : undefined);

  // mixed strip: every card carries its own Live / Sample marker
  return (
    <>
      <section
        aria-label="Key indicators"
        data-testid="kpi-strip"
        className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl2:grid-cols-8"
      >
        <h2 className="sr-only">Key indicators</h2>
        {base.isError && !baseUnavailable ? (
          <div className="col-span-full">
            <ErrorState error={base.error} onRetry={() => base.refetch()} />
          </div>
        ) : !cards ? (
          Array.from({ length: 8 }, (_, i) => <LoadingState key={i} height={118} />)
        ) : (
          cards.map((k) => {
            const s = slot(k);
            if (s.kpi) return <KpiCard key={k.id} kpi={s.kpi} provenance={s.prov} marker />;
            if (s.state === 'unavailable')
              return (
                <UnavailableState key={k.id} height={118} compact detail={(s.error as { detail?: string })?.detail} />
              );
            if (s.state === 'error')
              return <ErrorState key={k.id} height={118} error={s.error} onRetry={() => live[k.id].refetch()} />;
            return <LoadingState key={k.id} height={118} />;
          })
        )}
        {baseUnavailable && (
          <UnavailableState height={118} compact detail={isUnavailable(base.error) ? base.error.detail : undefined} />
        )}
      </section>
    </>
  );
}
