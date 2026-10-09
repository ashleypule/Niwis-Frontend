import { Link } from 'react-router';
import { useBreakdown, useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import { RingGauge } from '@/components/viz/RingGauge';
import { Pill } from '@/components/ui/Pill';
import { DataTable } from '@/components/table/DataTable';
import { CategoryPanel } from '@/components/charts/panels';
import { formatNumber } from '@/lib/format';

/** Programme implementation progress (spec §24: three phases). */
export function ProgrammeCard() {
  const q = useTable('roadmap', 'spec-phases');
  return (
    <Card title="Programme Implementation (36 Months)" actions={<Link to="/roadmap" className="text-xs font-semibold text-primary hover:underline">Roadmap →</Link>}>
      {!q.data ? (
        <Skeleton height={170} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {q.data.rows.map((r) => {
            const v = Number(r.actual);
            const status = v >= 100 ? 'Completed' : v > 0 ? 'In Progress' : 'Not Started';
            return (
              <div key={String(r.name)} className="flex flex-col rounded-lg border border-line p-2.5">
                <p className="text-[13px] font-semibold leading-tight text-ink">{String(r.name)}</p>
                <p className="text-[11px] text-muted">{String(r.months)}</p>
                <p className="mt-1 line-clamp-4 flex-1 text-[11px] leading-snug text-ink-2">{String(r.focus)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, v)}%` }} />
                  </div>
                  <span className="num text-xs font-semibold">{v}%</span>
                </div>
                <div className="mt-1.5">
                  <Pill scale="progress" value={status} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Data-quality rings (spec §23.1). */
export function DataQualityCard() {
  const q = useTable('governance', 'quality');
  const get = (k: string) => Number(q.data?.rows.find((r) => r.dimension === k)?.value ?? 0);
  return (
    <Card title="Data Quality & Integration Status" actions={<Link to="/governance" className="text-xs font-semibold text-primary hover:underline">Governance →</Link>}>
      {!q.data ? (
        <Skeleton height={170} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {['Completeness', 'Accuracy', 'Timeliness', 'Consistency', 'Validity'].map((k) => (
              <RingGauge key={k} label={k} value={get(k)} size={70} />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              ['Active data feeds', `${get('Active data feeds')}%`],
              ['Metadata complete', `${get('Metadata complete')}%`],
              ['Standards compliance', `${formatNumber((get('Validity') + get('Consistency')) / 2, 0)}%`],
              ['Open issues', String(get('Open issues'))],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
                <dt className="text-[11px] text-muted">{k}</dt>
                <dd className="num text-base font-bold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Card>
  );
}

/** Resource & budget overview (spec §24.4). */
export function BudgetCard() {
  const q = useTable('roadmap', 'resources');
  const b = useBreakdown('roadmap', 'budget');
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      <Card title="Human Resources (FTE)">{q.data ? <DataTable table={q.data} caption="Human resources" /> : <Skeleton height={170} />}</Card>
      {b.data ? <CategoryPanel module="roadmap" metric="budget" title="Budget Allocation (R million)" variant="donut" height={190} /> : <Skeleton height={230} />}
    </div>
  );
}
