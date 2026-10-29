import { useRef, useState, type ReactNode } from 'react';
import { useInView } from '@/lib/useInView';
import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useTable } from '@/api/queries/core';
import { Card, Tabs } from '@/components/ui/Card';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { MissingNote } from '@/components/provenance/MissingNote';
import { tableMissing } from '@/lib/provenance';
import { panelProvenance } from '@/components/provenance/provenance';
import { useUi } from '@/store/filters';
import { DataTable } from './DataTable';
import { ForecastNote, forecastInfoText } from '@/components/provenance/ForecastNote';
import type { Blocker, PanelTab } from '@/components/charts/panels';

export function TablePanel({
  module,
  metric,
  title,
  context,
  info,
  extra,
  tabs,
  limit,
  viewAllHref,
  maxHeight,
  className,
  selectEntity,
  controls,
  enabled = true,
  blockedBy,
}: {
  module: ModuleId;
  metric: string;
  title: string;
  context?: ReactNode;
  info?: string;
  extra?: QueryParams;
  tabs?: PanelTab[];
  limit?: number;
  viewAllHref?: string;
  maxHeight?: number;
  className?: string;
  /** clicking a row selects it as the page entity (uses table.rowKey) */
  selectEntity?: boolean;
  controls?: ReactNode;
  /** false until the request can be made (e.g. waiting for the selected entity) */
  enabled?: boolean;
  blockedBy?: Blocker;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.value ?? '');
  const active = tabs?.find((t) => t.value === tab);
  // data load when the panel nears the viewport: the first screen's requests are not queued behind every panel's
  const box = useRef<HTMLElement>(null);
  const near = useInView(box);
  const q = useTable(module, active?.metric ?? metric, { ...extra, ...active?.params }, enabled && near);
  const entity = useUi((s) => s.filters.entity);
  const setFilter = useUi((s) => s.setFilter);
  return (
    <Card
      title={title}
      context={context}
      info={q.data?.forecast ? forecastInfoText(q.data.forecast, info) : info}
      className={className}
      provenance={panelProvenance(q, module)}
      sectionRef={box}
    >
      {(tabs || controls) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {tabs && (
            <Tabs
              label="View"
              value={tab}
              onChange={setTab}
              options={tabs.map((t) => ({ value: t.value, label: t.label }))}
            />
          )}
          {controls}
        </div>
      )}
      {(!enabled && blockedBy?.isError ? queryStatus(blockedBy as Parameters<typeof queryStatus>[0], 160) : null) ??
        queryStatus(q, Math.min(maxHeight ?? 260, 260)) ?? (
          <>
            <DataTable
              table={q.data!}
              limit={limit}
              viewAllHref={viewAllHref}
              maxHeight={maxHeight}
              caption={title}
              selectedKey={selectEntity ? entity : undefined}
              onRowClick={
                selectEntity && q.data!.rowKey ? (r) => setFilter('entity', String(r[q.data!.rowKey!])) : undefined
              }
            />
            <MissingNote items={tableMissing(q.data!)} />
            {q.data!.forecast && <ForecastNote f={q.data!.forecast} />}
          </>
        )}
    </Card>
  );
}
