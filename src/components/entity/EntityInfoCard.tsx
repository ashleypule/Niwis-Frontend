import type { ReactNode } from 'react';
import type { ModuleId } from '@/config/modules';
import { useEntity } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { panelProvenance } from '@/components/provenance/provenance';
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
    <Card title={title} className={className} context={q.data?.title} provenance={panelProvenance(q, module)}>
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
  // fields the backend returns as null, with the reason (`unavailable: [{ field: "fields.<label>", reason }]`)
  const reasons = new Map(
    (e.unavailable ?? []).filter((u) => u.field.startsWith('fields.')).map((u) => [u.field.slice(7), u.reason]),
  );
  const shown = [
    ...new Set(e.fields.filter((f) => f.value == null && reasons.has(f.label)).map((f) => reasons.get(f.label)!)),
  ];
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
                ) : f.value == null && reasons.has(f.label) ? (
                  <span title={reasons.get(f.label)} data-state="unavailable">
                    —<span className="sr-only"> (not available)</span>
                  </span>
                ) : (
                  (f.value ?? '—')
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {shown.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs leading-snug text-muted" data-testid="entity-unavailable">
          {shown.map((r) => (
            <li key={r}>
              <span className="font-semibold text-ink-2">Not available: </span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
