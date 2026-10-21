import { Link } from 'react-router';
import type { ModuleId } from '@/config/modules';
import { useAlerts } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Pill, SeverityIcon } from '@/components/ui/Pill';
import { ErrorState, Skeleton, UnavailableState } from '@/components/feedback/PanelBoundary';
import { isUnavailable } from '@/api/client';
import { panelProvenance } from '@/components/provenance/provenance';
import { formatDate } from '@/lib/format';
import { isLive, isLivePath } from '@/config/app';
import { endpoints } from '@/api/endpoints';
import { BellOff } from 'lucide-react';

export function AlertsList({
  module,
  limit = 6,
  title = 'Alerts & Early Warnings',
  className,
  scoped = true,
}: {
  module?: ModuleId;
  limit?: number;
  title?: string;
  className?: string;
  scoped?: boolean;
}) {
  // on a live module, sample alerts would contradict the live data next to them (e.g. "D4 drought" beside SPI 0.4)
  const waiting = !!module && isLive(module) && !isLivePath(endpoints.alerts());
  const q = useAlerts({ module, limit, scoped: scoped ? '1' : undefined }, !waiting);
  if (waiting)
    return (
      <Card title={title} className={className} provenance={null}>
        <div
          className="flex min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface-2/50 p-4 text-center"
          data-state="alerts-pending"
        >
          <BellOff className="h-5 w-5 text-muted" aria-hidden="true" />
          <p className="text-sm text-ink-2">Alerts will appear when the alert service is connected.</p>
        </div>
      </Card>
    );
  return (
    <Card
      title={title}
      className={className}
      provenance={q.isError && isUnavailable(q.error) ? panelProvenance(q) : undefined}
      actions={
        <Link
          to={module ? `/alerts?module=${module}` : '/alerts'}
          className="text-xs font-semibold text-primary hover:underline"
        >
          View all →
        </Link>
      }
    >
      {q.isError && isUnavailable(q.error) ? (
        <UnavailableState detail={q.error.detail} height={140} />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton height={180} />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.items.slice(0, limit).map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 py-2">
              <SeverityIcon severity={a.severity} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink">{a.title}</p>
                <p className="truncate text-[11px] text-muted">{a.location}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="whitespace-nowrap text-[11px] text-muted">{formatDate(a.date, 'short')}</span>
                <Pill scale="severity" value={a.severity} size="sm" />
              </div>
            </li>
          ))}
          {q.data.items.length === 0 && <li className="py-6 text-center text-sm text-muted">No active alerts.</li>}
        </ul>
      )}
    </Card>
  );
}
