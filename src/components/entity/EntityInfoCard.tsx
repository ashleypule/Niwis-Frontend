import type { ReactNode } from 'react';
import type { ModuleId } from '@/config/modules';
import { useEntity } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { formatNumber, withUnit } from '@/lib/format';
import type { EntityDetail } from '@/types/api';
import { EntityIllustration } from './EntityIllustration';

/** "Selected Dam / Station / Borehole …" panel: illustration slot + key–value table. */
export function EntityInfoCard({
  module,
  id,
  title,
  controls,
  className,
  compact,
}: {
  module: ModuleId;
  id?: string;
  title: string;
  controls?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const q = useEntity(module, id);
  return (
    <Card title={title} className={className} context={q.data?.title}>
      {controls && <div className="mb-2">{controls}</div>}
      {!id ? (
        <p className="py-8 text-center text-sm text-muted">Select an item on the map or in a table.</p>
      ) : (
        (queryStatus(q, 200) ?? <EntityBody e={q.data!} compact={compact} />)
      )}
    </Card>
  );
}

export function EntityBody({ e, compact }: { e: EntityDetail; compact?: boolean }) {
  return (
    <div className="@container">
      <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-3 @[34rem]:flex-row'}>
        {e.image && (
          <div className={compact ? 'h-28 w-full' : 'h-36 w-full shrink-0 @[34rem]:h-auto @[34rem]:w-[40%]'}>
            <EntityIllustration kind={e.image} name={e.name} />
          </div>
        )}
        <dl className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-x-3 text-[13px]">
          {e.status && (
            <>
              <dt className="border-b border-line py-1 text-muted">Status</dt>
              <dd className="border-b border-line py-1">
                <Pill scale={e.status.scale} value={e.status.id} label={e.status.label} size="sm" />
              </dd>
            </>
          )}
          {e.fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="border-b border-line py-1 leading-snug text-muted" title={f.label}>
                {f.label}
              </dt>
              <dd
                className="num break-words border-b border-line py-1 font-medium leading-snug text-ink"
                title={String(f.value ?? '')}
              >
                {f.scale && f.value != null ? (
                  <Pill scale={f.scale} value={f.value} size="sm" />
                ) : typeof f.value === 'number' ? (
                  withUnit(
                    formatNumber(
                      f.value,
                      Math.abs(f.value) < 10 && !Number.isInteger(f.value) ? 2 : Number.isInteger(f.value) ? 0 : 1,
                    ),
                    f.unit,
                  )
                ) : (
                  (f.value ?? '—')
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
