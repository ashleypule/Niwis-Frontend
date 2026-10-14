import { ArrowDown, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { ModuleId } from '@/config/modules';
import { useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { StaleChip } from '@/components/provenance/Markers';
import { monthYear, panelProvenance } from '@/components/provenance/provenance';
import { metricIcon } from '@/config/icons';
import { classify } from '@/config/palettes';
import { formatNumber } from '@/lib/format';
import { reasonFor } from '@/lib/provenance';
import type { TableSet } from '@/types/api';

/** Icon / colour scale per stage id for the backend's cascade and signal-chain rows (which carry no metric / scale). */
const STAGE: Record<string, { metric: string; scale?: string }> = {
  meteorological: { metric: 'spi', scale: 'spi' },
  agricultural: { metric: 'vhi', scale: 'vci' },
  hydrological: { metric: 'storagePct', scale: 'storage' },
  'socio-economic': { metric: 'settlementsAtRisk' },
  temp: { metric: 'tmean' },
  et0: { metric: 'et0' },
  rain: { metric: 'rainfall' },
  runoff: { metric: 'runoff' },
};

interface Stage {
  id: string;
  stage: string;
  metric: string;
  value: string;
  cls: string | null;
  scale: string;
  /** numeric value to colour by when the class label isn't on the scale */
  num: number | null;
  bar: number | null;
  asOf?: string;
  stale: boolean;
  missing?: string;
}

/**
 * Rows → stages. Accepts the contract / mock shape `{stage, metric, value (text), cls, scale, bar}` and the backend's
 * shapes: drought cascade `{id, stage, value (number), class, severity, asOf}` and climate signal chain
 * `{id, signal, change, severity}` (docs/backend/BACKEND_ISSUES.md #2–3).
 */
export function cascadeStages(t: TableSet): Stage[] {
  const clsCol = t.columns.find((c) => ['cls', 'class', 'severity'].includes(c.key) && c.type === 'class');
  return t.rows.map((r, i) => {
    const id = String(r[t.rowKey ?? 'id'] ?? r.id ?? i);
    const known = STAGE[id];
    const raw = r.value ?? r.change ?? null;
    const missing = raw == null ? (reasonFor(t.unavailable, id) ?? 'Not in the database') : undefined;
    const value =
      raw == null ? '—' : typeof raw === 'number' ? formatNumber(raw, Math.abs(raw) < 10 ? 2 : 1) : String(raw);
    const cls = (r.cls ?? r.class ?? (typeof r.severity === 'string' ? r.severity : null)) as string | null;
    const bar = typeof r.bar === 'number' ? r.bar : typeof r.severity === 'number' ? r.severity : null;
    const asOf = typeof r.asOf === 'string' ? r.asOf : undefined;
    const comp = t.components?.find((c) => c.key === id);
    return {
      id,
      stage: String(r.stage ?? r.signal ?? id),
      metric: String(r.metric ?? known?.metric ?? 'spi'),
      value,
      cls,
      scale: String(r.scale ?? clsCol?.scale ?? known?.scale ?? 'risk'),
      num: typeof raw === 'number' ? raw : null,
      bar,
      asOf,
      stale: !!comp?.isStale,
      missing,
    };
  });
}

/**
 * The drought cascade (spec §3): precipitation deficit → soil moisture → vegetation → streamflow → reservoirs →
 * groundwater → socio-economic impact, with a value and class per stage. Reused for the climate signal chain.
 * Panels built from several sources show each stage's date, and a stale marker on stages whose source is stale.
 */
export function CascadeFlow({
  module,
  metric,
  title,
  orientation = 'horizontal',
  className,
}: {
  module: ModuleId;
  metric: string;
  title: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  const q = useTable(module, metric);
  const stages = q.data ? cascadeStages(q.data) : [];
  const vertical = orientation === 'vertical';
  return (
    <Card title={title} className={className} provenance={panelProvenance(q, module)}>
      {queryStatus(q, vertical ? 360 : 150) ?? (
        <ol
          className={clsx(
            vertical
              ? 'flex flex-col gap-1'
              : 'grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:items-stretch xl:gap-1',
          )}
          aria-label={title}
        >
          {stages.map((r, i) => {
            const { icon: Icon, tint } = metricIcon(r.metric);
            // colour by class id / label, else by the numeric value on the stage's own scale
            const bin = classify(r.scale, r.cls) ?? (r.num != null ? classify(r.scale, r.num) : null);
            return (
              <li key={r.id} className={clsx('flex', vertical ? 'flex-col' : 'items-center xl:flex-1')}>
                <div
                  className={clsx(
                    'flex flex-1 rounded-xl border border-line p-2.5',
                    vertical ? 'items-center gap-3' : 'flex-col items-center text-center',
                  )}
                  style={{ background: bin ? `${bin.color}1f` : undefined }}
                  title={r.missing}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: tint.bg, color: tint.fg }}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className={clsx('min-w-0', vertical ? 'flex-1' : 'mt-1')}>
                    <p className="text-[12px] font-semibold leading-tight text-ink">
                      {i + 1}. {r.stage}
                    </p>
                    <p className="num text-base font-bold leading-tight text-ink">{r.value}</p>
                    {r.missing && <p className="text-[11px] leading-tight text-muted">{r.missing}</p>}
                    {(r.asOf || r.stale) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                        {r.stale ? <StaleChip asOf={r.asOf} /> : <span>{monthYear(r.asOf)}</span>}
                      </p>
                    )}
                    {vertical && r.bar != null && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(4, r.bar)}%`,
                            background: bin?.color ?? 'var(--c-primary)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className={vertical ? '' : 'mt-1'}>
                    <Pill scale={r.scale} value={r.cls} label={r.cls ?? '—'} size="sm" />
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <span
                    className={clsx(
                      'flex items-center justify-center text-muted',
                      vertical ? 'h-4' : 'hidden w-4 xl:flex',
                    )}
                    aria-hidden="true"
                  >
                    {vertical ? <ArrowDown className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
