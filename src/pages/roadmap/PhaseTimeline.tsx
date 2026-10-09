import { useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/feedback/PanelBoundary';

const PHASE_COLOR = ['#1565C0', '#2E7D32', '#7B1FA2'];

/**
 * 36-month programme timeline: the spec's three phases (§24) as groups, the six delivery sub-phases inside them,
 * with a "today" marker and planned vs actual progress per sub-phase.
 */
export function PhaseTimeline() {
  const spec = useTable('roadmap', 'spec-phases');
  const subs = useTable('roadmap', 'phases');
  if (!spec.data || !subs.data)
    return (
      <Card title="Implementation Roadmap (36 Months)">
        <Skeleton height={260} />
      </Card>
    );
  const phaseRanges = [
    [1, 9],
    [10, 24],
    [25, 36],
  ];
  return (
    <Card title="Implementation Roadmap (36 Months)" context="Spec §24 phases with delivery sub-phases">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          {/* month ruler */}
          <div className="relative mb-2 h-6 border-b border-line text-[11px] text-muted">
            {[1, 6, 12, 18, 24, 30, 36].map((m) => (
              <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - 0.5) / 36) * 100}%` }}>
                M{m}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(36,minmax(0,1fr))] gap-y-2">
            {spec.data.rows.map((p, k) => (
              <div
                key={String(p.name)}
                className="rounded-lg px-3 py-2 text-white"
                style={{ gridColumn: `${phaseRanges[k][0]} / ${phaseRanges[k][1] + 1}`, background: PHASE_COLOR[k] }}
              >
                <p className="text-[13px] font-bold">{String(p.name)}</p>
                <p className="text-[11px] text-white/85">
                  {String(p.months)} · {String(p.actual)}% complete
                </p>
              </div>
            ))}
            {subs.data.rows.map((s) => {
              const [a, b] = String(s.months).replace(/M/g, '').split('–').map(Number);
              const phase = Number(s.phase) - 1;
              return (
                <div
                  key={String(s.id)}
                  className="mx-0.5 rounded-lg border border-line bg-surface-2 p-2"
                  style={{ gridColumn: `${a} / ${b + 1}`, borderTop: `3px solid ${PHASE_COLOR[phase]}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold leading-tight text-ink">
                      {String(s.id)} · {String(s.name)}
                    </p>
                    <Pill scale="progress" value={String(s.status)} size="sm" />
                  </div>
                  <div
                    className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3"
                    aria-label={`${s.actual}% complete of ${s.planned}% planned`}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, Number(s.actual))}%`, background: PHASE_COLOR[phase] }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {String(s.actual)}% done · planned {String(s.planned)}%
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {String(s.deliverables)
                      .split(' · ')
                      .map((d) => (
                        <li key={d} className="text-[11px] leading-snug text-ink-2">
                          • {d}
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
