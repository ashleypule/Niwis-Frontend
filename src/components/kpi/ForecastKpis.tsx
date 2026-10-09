import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useTable } from '@/api/queries/core';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import { metricIcon } from '@/config/icons';

/**
 * Forecast KPI strip built from a module's forecast summary table (first column = indicator, then current /
 * horizons). Shows the furthest horizon prominently, with an intermediate horizon underneath.
 */
export function ForecastKpis({ module, metric, extra, icons = [] }: { module: ModuleId; metric: string; extra?: QueryParams; icons?: string[] }) {
  const q = useTable(module, metric, extra);
  if (!q.data) return <Skeleton height={104} />;
  const cols = q.data.columns;
  const last = cols[cols.length - 1];
  const cur = cols.find((c) => /current|baseline/i.test(c.label));
  const mid = cols.length > 3 ? cols[Math.floor(cols.length / 2)] : undefined;
  return (
    <section aria-label="Forecast indicators" data-testid="kpi-strip" className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 desk:grid-cols-6">
      {q.data.rows.slice(0, 6).map((r, k) => {
        const { icon: Icon, tint } = metricIcon(icons[k] ?? ['tmean', 'rainfall', 'hotDays', 'droughtClass', 'runoff', 'demand'][k % 6]);
        return (
          <article key={String(r[cols[0].key])} className="anim-in rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint.bg, color: tint.fg }} aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-[13px] font-semibold leading-tight text-ink">{String(r[cols[0].key])}</h3>
            </div>
            <p className="num mt-2 text-2xl font-bold text-ink">{String(r[last.key])}</p>
            <p className="text-[11px] text-muted">
              Forecast, {last.label}
              {cur ? ` · now ${String(r[cur.key])}` : mid ? ` · ${mid.label}: ${String(r[mid.key])}` : ''}
            </p>
          </article>
        );
      })}
    </section>
  );
}
