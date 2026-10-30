import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useTable } from '@/api/queries/core';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { ProvenanceChips } from '@/components/provenance/Markers';
import { panelProvenance } from '@/components/provenance/provenance';
import clsx from 'clsx';
import { metricIcon } from '@/config/icons';
import { cellFormat } from '@/components/table/DataTable';
import { formatNumber, withUnit } from '@/lib/format';
import type { Column } from '@/types/api';

/**
 * Forecast KPI strip built from a module's forecast summary table (first column = indicator, then current /
 * horizons). Shows the furthest horizon prominently, with an intermediate horizon underneath.
 */
export function ForecastKpis({
  module,
  metric,
  extra,
  icons = [],
}: {
  module: ModuleId;
  metric: string;
  extra?: QueryParams;
  icons?: string[];
}) {
  const q = useTable(module, metric, extra);
  const prov = panelProvenance(q, module);
  const status = queryStatus(q, 104);
  if (status || !q.data) return <div data-provenance={prov.kind}>{status}</div>;
  const cols = q.data.columns;
  const last = cols[cols.length - 1];
  const cur = cols.find((c) => /current|baseline/i.test(c.label));
  const mid = cols.length > 3 ? cols[Math.floor(cols.length / 2)] : undefined;
  // a number is shown with its column's decimals and the row's unit, as the table under it does
  const show = (c: Column, r: Record<string, string | number | null>) => {
    const v = r[c.key];
    if (typeof v !== 'number') return v == null || v === '' ? '—' : String(v);
    const f = cellFormat(c, r);
    return withUnit(formatNumber(v, f.decimals ?? 0), f.unit);
  };
  return (
    <>
      <ProvenanceChips p={prov} className="mb-1.5" />
      <section
        aria-label="Forecast indicators"
        data-testid="kpi-strip"
        data-provenance={prov.kind}
        className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 desk:grid-cols-6"
      >
        {q.data.rows.slice(0, 6).map((r, k) => {
          const { icon: Icon, tint } = metricIcon(
            icons[k] ?? ['tmean', 'rainfall', 'hotDays', 'droughtClass', 'runoff', 'demand'][k % 6],
          );
          return (
            <article
              key={String(r[cols[0].key])}
              className={clsx(
                'anim-in rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card',
                prov.kind === 'sample' && 'prov-sample',
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: tint.bg, color: tint.fg }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-[13px] font-semibold leading-tight text-ink">{String(r[cols[0].key])}</h3>
              </div>
              <p className="num mt-2 text-2xl font-bold text-ink">{show(last, r)}</p>
              <p className="text-[11px] text-muted">
                Forecast, {last.label}
                {cur ? ` · now ${show(cur, r)}` : mid ? ` · ${mid.label}: ${show(mid, r)}` : ''}
              </p>
            </article>
          );
        })}
      </section>
    </>
  );
}
