/**
 * Panels filled from the backend's /meta endpoints (hybrid / api mode): what the national database actually holds,
 * per table and per module. Only facts the backend reports are shown; everything else on these pages stays Sample.
 */
import { useMemo } from 'react';
import { useMetaCoverage, useMetaSources, useMetaVariables } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { ChartCard } from '@/components/charts/ChartCard';
import { DonutBody } from '@/components/charts/panels';
import { categoryOption } from '@/components/charts/options';
import { useChartTheme } from '@/components/charts/theme';
import { DataTable } from '@/components/table/DataTable';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { colorFor } from '@/config/palettes';
import type { CategorySet, MetaSource, TableSet } from '@/types/api';

const MODULE_LABEL: Record<string, string> = {
  rainfall: 'Rainfall',
  drought: 'Drought',
  climate: 'Climate',
  vegetation: 'Vegetation',
  runoff: 'Runoff',
};

/** Feed status of a table: Offline (missing / error), Delayed (stale), Online. */
export function feedStatus(s: MetaSource): 'Online' | 'Delayed' | 'Offline' {
  if (s.exists === false || s.error) return 'Offline';
  return s.isStale ? 'Delayed' : 'Online';
}

function metaProv(q: Parameters<typeof panelProvenance>[0], asOf?: string, source?: string): PanelProvenance {
  const p = panelProvenance(q);
  return p.kind === 'live' ? { ...p, asOf, source: source ? [source] : undefined } : p;
}

export function MetaSourceStatus({ height = 170 }: { height?: number }) {
  const q = useMetaSources();
  const t = useChartTheme();
  const set = useMemo<CategorySet | undefined>(() => {
    if (!q.data) return undefined;
    const cats = ['Online', 'Delayed', 'Offline'] as const;
    const counts = cats.map((c) => q.data!.items.filter((s) => feedStatus(s) === c).length);
    return {
      id: 'source-status',
      unit: 'tables',
      categories: [...cats],
      colors: cats.map((c) => colorFor('feed', c)),
      series: [{ key: 'n', name: 'Tables', values: counts }],
      center: { value: String(q.data.items.length), label: 'tables' },
    };
  }, [q.data]);
  const option = useMemo(() => (set ? categoryOption(set, t, 'donut', {}) : undefined), [set, t]);
  return (
    <ChartCard
      title="Data Source Status (National Database)"
      info="Online = updated within 90 days of the newest record; Delayed = older (stale); Offline = table missing or unreadable."
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => q.refetch()}
      provenance={metaProv(q, q.data?.newestDataDate, '/api/v1/meta/sources')}
    >
      {set && option && <DonutBody set={set} option={option} height={height} title="Data source status" />}
    </ChartCard>
  );
}

export function MetaPipelineTable({ title = 'Data Integration Pipeline Status' }: { title?: string }) {
  const q = useMetaSources();
  const table = useMemo<TableSet | undefined>(
    () =>
      q.data && {
        id: 'pipelines',
        rowKey: 'table',
        columns: [
          { key: 'table', label: 'Table', type: 'text' },
          { key: 'module', label: 'Module', type: 'text' },
          { key: 'resolution', label: 'Cadence', type: 'text' },
          { key: 'rows', label: 'Rows', type: 'number', decimals: 0, align: 'right' },
          { key: 'firstDate', label: 'From', type: 'date' },
          { key: 'coveredTo', label: 'Covered to', type: 'date' },
          { key: 'completeness', label: 'Complete', type: 'bar', unit: '%', decimals: 1 },
          { key: 'status', label: 'Status', type: 'class', scale: 'feed' },
        ],
        rows: q.data.items.map((s) => ({
          table: s.table,
          module: MODULE_LABEL[s.module ?? ''] ?? s.module ?? '—',
          resolution: s.resolution ?? null,
          rows: s.rows ?? null,
          firstDate: s.firstDate ?? null,
          coveredTo: s.coveredTo ?? null,
          completeness: s.completenessPct ?? null,
          status: feedStatus(s),
        })),
      },
    [q.data],
  );
  return (
    <Card title={title} provenance={metaProv(q, q.data?.newestDataDate, '/api/v1/meta/sources')}>
      {queryStatus(q, 200) ?? <DataTable table={table!} caption={title} maxHeight={360} />}
    </Card>
  );
}

export function MetaCoverageTable() {
  const q = useMetaCoverage();
  const table = useMemo<TableSet | undefined>(
    () =>
      q.data && {
        id: 'coverage',
        rowKey: 'module',
        columns: [
          { key: 'module', label: 'Module', type: 'text' },
          { key: 'tables', label: 'Tables', type: 'number', decimals: 0, align: 'right' },
          { key: 'rows', label: 'Rows', type: 'number', decimals: 0, align: 'right' },
          { key: 'firstDate', label: 'From', type: 'date' },
          { key: 'asOf', label: 'Newest', type: 'date' },
          { key: 'oldest', label: 'Oldest source to', type: 'date' },
          { key: 'completeness', label: 'Complete', type: 'bar', unit: '%', decimals: 1 },
          { key: 'live', label: 'Variables served', type: 'number', decimals: 0, align: 'right' },
          { key: 'withheld', label: 'Withheld', type: 'number', decimals: 0, align: 'right' },
          { key: 'status', label: 'Status', type: 'class', scale: 'feed' },
        ],
        rows: q.data.modules.map((m) => ({
          module: MODULE_LABEL[m.module] ?? m.module,
          tables: m.tables.length,
          rows: m.rows ?? null,
          firstDate: m.firstDate ?? null,
          asOf: m.asOf ?? null,
          oldest: m.oldestCoveredTo ?? null,
          completeness: m.completenessPct ?? null,
          live: m.variables?.live ?? null,
          withheld: m.variables?.withheld ?? null,
          status: m.isStale ? 'Delayed' : 'Online',
        })),
      },
    [q.data],
  );
  return (
    <Card
      title="Live Modules – Database Coverage"
      info="Per module: tables used, period covered, completeness and how many variables are served or withheld (failed checks; see the data gaps report)."
      provenance={metaProv(q, q.data?.newestDataDate, '/api/v1/meta/coverage')}
    >
      {queryStatus(q, 200) ?? <DataTable table={table!} caption="Database coverage" />}
    </Card>
  );
}

/** Known data issues and withheld columns, per table (Governance: "Recent Data Quality Issues"). */
export function MetaIssuesTable() {
  const q = useMetaSources();
  const table = useMemo<TableSet | undefined>(
    () =>
      q.data && {
        id: 'issues',
        columns: [
          { key: 'table', label: 'Table', type: 'text' },
          { key: 'kind', label: 'Type', type: 'text' },
          { key: 'issue', label: 'Issue', type: 'text' },
        ],
        rows: q.data.items.flatMap((s) => [
          ...(s.knownIssues ?? []).map((i) => ({ table: s.table, kind: 'Known issue', issue: i })),
          ...(s.variables?.withheld ?? []).map((w) => ({
            table: s.table,
            kind: 'Withheld column',
            issue: `${w.column}: ${w.reason}`,
          })),
        ]),
      },
    [q.data],
  );
  return (
    <Card
      title="Data Quality Issues (National Database)"
      provenance={metaProv(q, q.data?.newestDataDate, '/api/v1/meta/sources')}
    >
      {queryStatus(q, 200) ?? <DataTable table={table!} caption="Data quality issues" maxHeight={360} />}
    </Card>
  );
}

/** Every variable: served (canonical source) or unavailable, with the reason. */
export function MetaVariablesTable() {
  const q = useMetaVariables();
  const table = useMemo<TableSet | undefined>(
    () =>
      q.data && {
        id: 'variables',
        rowKey: 'id',
        columns: [
          { key: 'label', label: 'Variable', type: 'text' },
          { key: 'unit', label: 'Unit', type: 'text' },
          { key: 'status', label: 'Status', type: 'class', scale: 'feed' },
          { key: 'source', label: 'Canonical source / reason', type: 'text' },
          { key: 'duplicates', label: 'Duplicates', type: 'number', decimals: 0, align: 'right' },
        ],
        rows: q.data.items.map((v) => {
          const withheld = (v as { withheld?: unknown[] }).withheld ?? [];
          return {
            id: v.id,
            label: v.label,
            unit: v.unit ?? null,
            status: v.status === 'live' ? 'Online' : 'Offline',
            source: v.source ?? v.reason ?? (withheld.length ? String(withheld[0]) : 'Not in the database'),
            duplicates: v.duplicates?.length ?? 0,
          };
        }),
      },
    [q.data],
  );
  const live = q.data?.items.filter((v) => v.status === 'live').length;
  return (
    <Card
      title="Variable Register (National Database)"
      context={q.data ? `${live} of ${q.data.items.length} variables served` : undefined}
      provenance={metaProv(q, undefined, '/api/v1/meta/variables')}
    >
      {queryStatus(q, 200) ?? <DataTable table={table!} caption="Variable register" maxHeight={420} />}
    </Card>
  );
}
