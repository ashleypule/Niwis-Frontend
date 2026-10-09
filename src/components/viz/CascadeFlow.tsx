import { ArrowDown, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { ModuleId } from '@/config/modules';
import { useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { ErrorState, Skeleton } from '@/components/feedback/PanelBoundary';
import { metricIcon } from '@/config/icons';
import { classify } from '@/config/palettes';

/**
 * The drought cascade (spec §3): precipitation deficit → soil moisture → vegetation → streamflow → reservoirs →
 * groundwater → socio-economic impact, with a value and class per stage. Reused for the climate signal chain.
 * Data: a TableSet with columns stage, metric, value (text), cls, scale, bar (0–100 severity).
 */
export function CascadeFlow({ module, metric, title, orientation = 'horizontal', className }: { module: ModuleId; metric: string; title: string; orientation?: 'horizontal' | 'vertical'; className?: string }) {
  const q = useTable(module, metric);
  const rows = q.data?.rows ?? [];
  const vertical = orientation === 'vertical';
  return (
    <Card title={title} className={className}>
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton height={vertical ? 360 : 150} />
      ) : (
        <ol className={clsx(vertical ? 'flex flex-col gap-1' : 'grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:items-stretch xl:gap-1')} aria-label={title}>
          {rows.map((r, i) => {
            const { icon: Icon, tint } = metricIcon(String(r.metric));
            const scale = String(r.scale ?? 'risk');
            const bin = classify(scale, r.cls as string);
            const sev = Number(r.bar ?? 0);
            return (
              <li key={String(r.stage)} className={clsx('flex', vertical ? 'flex-col' : 'items-center xl:flex-1')}>
                <div className={clsx('flex flex-1 rounded-xl border border-line p-2.5', vertical ? 'items-center gap-3' : 'flex-col items-center text-center')} style={{ background: bin ? `${bin.color}1f` : undefined }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint.bg, color: tint.fg }} aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className={clsx('min-w-0', vertical ? 'flex-1' : 'mt-1')}>
                    <p className="text-[12px] font-semibold leading-tight text-ink">
                      {i + 1}. {String(r.stage)}
                    </p>
                    <p className="num text-base font-bold leading-tight text-ink">{String(r.value)}</p>
                    {vertical && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, sev)}%`, background: bin?.color ?? 'var(--c-primary)' }} />
                      </div>
                    )}
                  </div>
                  <div className={vertical ? '' : 'mt-1'}>
                    <Pill scale={scale} value={String(r.cls)} size="sm" />
                  </div>
                </div>
                {i < rows.length - 1 && (
                  <span className={clsx('flex items-center justify-center text-muted', vertical ? 'h-4' : 'hidden w-4 xl:flex')} aria-hidden="true">
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
