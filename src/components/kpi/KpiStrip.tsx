import clsx from 'clsx';
import type { ModuleId } from '@/config/modules';
import { useSummary } from '@/api/queries/core';
import type { QueryParams } from '@/api/client';
import { ErrorState, Skeleton } from '@/components/feedback/PanelBoundary';
import { KpiCard } from './KpiCard';

/**
 * 6–10 KPI cards. 8 per row on wide screens, 4 → 3 → 2 as the viewport narrows; on phones a 2-column grid.
 */
export function KpiStrip({
  module,
  extra,
  count,
  only,
}: {
  module: ModuleId;
  extra?: QueryParams;
  count?: number;
  only?: string[];
}) {
  const { data, isLoading, isError, refetch } = useSummary(module, extra);
  const kpis = (data?.kpis ?? []).filter((k) => !only || only.includes(k.id));
  const n = count ?? (kpis.length || 8);
  // 8 per row on wide screens, 4 → 3 → 2 as the viewport narrows (10-card strips: 5 per row, then 10)
  const wide =
    n >= 10
      ? 'desk:grid-cols-5 wide:grid-cols-10'
      : n === 9
        ? 'desk:grid-cols-5 wide:grid-cols-9'
        : n === 7
          ? 'desk:grid-cols-7'
          : n === 6
            ? 'xl:grid-cols-6'
            : 'xl2:grid-cols-8';
  const grid = clsx('grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4', wide);
  if (isError) return <ErrorState message="Key indicators could not be loaded." onRetry={() => refetch()} />;
  return (
    <section aria-label="Key indicators" data-testid="kpi-strip" className={grid}>
      {isLoading
        ? Array.from({ length: n }, (_, i) => <Skeleton key={i} height={118} />)
        : kpis.map((k) => <KpiCard key={k.id} kpi={k} compact={n >= 9} />)}
    </section>
  );
}
