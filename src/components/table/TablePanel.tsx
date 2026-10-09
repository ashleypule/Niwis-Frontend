import { useState, type ReactNode } from 'react';
import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useTable } from '@/api/queries/core';
import { Card, Tabs } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/feedback/PanelBoundary';
import { useUi } from '@/store/filters';
import { DataTable } from './DataTable';
import type { PanelTab } from '@/components/charts/panels';

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
}) {
  const [tab, setTab] = useState(tabs?.[0]?.value ?? '');
  const active = tabs?.find((t) => t.value === tab);
  const q = useTable(module, active?.metric ?? metric, { ...extra, ...active?.params });
  const entity = useUi((s) => s.filters.entity);
  const setFilter = useUi((s) => s.setFilter);
  return (
    <Card title={title} context={context} info={info} className={className}>
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
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} height={160} />
      ) : q.isLoading || !q.data ? (
        <Skeleton height={Math.min(maxHeight ?? 260, 260)} />
      ) : (
        <DataTable
          table={q.data}
          limit={limit}
          viewAllHref={viewAllHref}
          maxHeight={maxHeight}
          caption={title}
          selectedKey={selectEntity ? entity : undefined}
          onRowClick={
            selectEntity && q.data.rowKey ? (r) => setFilter('entity', String(r[q.data!.rowKey!])) : undefined
          }
        />
      )}
    </Card>
  );
}
