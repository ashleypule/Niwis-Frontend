/**
 * "Database variables": every table the backend maps to this page, as it exists in the database (category = table,
 * variable = column). Built entirely from `/{module}/categories`: a table or column the data team adds appears here
 * once the backend catalogue is rebuilt. Live modules only (the mock has no database tables).
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { moduleById, type ModuleId } from '@/config/modules';
import { isLive } from '@/config/app';
import type { CategoryTable, TableSet } from '@/types/api';
import { useCategories } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { monthYear, panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { StaleChip } from '@/components/provenance/Markers';
import { DataTable } from '@/components/table/DataTable';
import { coverageCounts, duplicatesFor } from '@/lib/categories';
import { CategoryChart } from './CategoryChart';

const openKey = (module: string, table: string) => `niwis-dbvars-${module}-${table}`;

function readOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}
function saveOpen(key: string, open: boolean) {
  try {
    localStorage.setItem(key, open ? '1' : '0');
  } catch {
    /* storage unavailable: the block simply opens again next time */
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Drought: 4 tables · 50 columns · 24 live · 14 withheld · 16 duplicates", expandable to every column. */
export function SpecCoverage({
  module,
  tables,
  title,
  provenance,
}: {
  module: ModuleId;
  tables: CategoryTable[];
  title: string;
  provenance: PanelProvenance;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = coverageCounts(tables);
  const summary = `${moduleById(module).short}: ${plural(c.tables, 'table')} · ${plural(c.columns, 'column')} · ${c.live} live · ${c.withheld} withheld · ${plural(c.duplicate, 'duplicate')}`;
  const table: TableSet = {
    id: `${module}-coverage`,
    title: `${title}: database columns`,
    columns: [
      { key: 'table', label: 'Table', type: 'text' },
      { key: 'column', label: 'Column', type: 'text' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'status', label: 'Status', type: 'class', scale: 'columnStatus' },
      { key: 'reason', label: 'Reason', type: 'text' },
    ],
    rows: tables.flatMap((t) =>
      t.variables.map((v) => ({
        id: `${t.table}.${v.column}`,
        table: t.table,
        column: v.column,
        label: v.label,
        unit: v.unit ?? null,
        status: v.status,
        reason: v.reason ?? (v.duplicateOf ? `identical to ${v.duplicateOf}` : null),
      })),
    ),
    rowKey: 'id',
  };
  return (
    <Card title="Spec coverage" provenance={provenance} className="mb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="num text-sm font-semibold text-ink" data-testid="coverage-summary">
          {summary}
        </p>
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Hide columns' : 'Show every column →'}
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Live columns are plotted below. Withheld columns failed a check or hold placeholder values (reason given);
        duplicates repeat another column.
      </p>
      {expanded && (
        <div className="mt-2">
          <DataTable table={table} caption={table.title} maxHeight={420} />
        </div>
      )}
    </Card>
  );
}

function TableBlock({ module, table }: { module: ModuleId; table: CategoryTable }) {
  const key = openKey(module, table.id);
  const [open, setOpen] = useState(() => readOpen(key));
  const bodyId = `dbvars-${module}-${table.id}`;
  const dups = duplicatesFor(table);
  const n = table.counts;
  return (
    <section
      className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface-2/40"
      data-category-table={table.id}
      aria-labelledby={`${bodyId}-h`}
    >
      <h3 id={`${bodyId}-h`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            saveOpen(key, !open);
            setOpen(!open);
          }}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left"
        >
          <ChevronDown
            className={clsx('h-4 w-4 shrink-0 text-muted transition-transform', !open && '-rotate-90')}
            aria-hidden="true"
          />
          <span className="text-[15px] font-semibold text-ink">
            {table.label}
            {table.specTag && <span className="ml-1.5 font-medium text-muted">{table.specTag}</span>}
          </span>
          <span className="font-mono text-[11px] text-muted [overflow-wrap:anywhere]">{table.table}</span>
          {n && (
            <span className="num text-xs text-ink-2">
              {n.live} live · {n.withheld} withheld · {plural(n.duplicate, 'duplicate')}
            </span>
          )}
          {table.isStale && table.asOf ? (
            <StaleChip asOf={table.asOf} />
          ) : (
            table.asOf && (
              <span className="text-xs text-muted">
                data to {table.resolution === 'annual' ? table.asOf.slice(0, 4) : monthYear(table.asOf)}
              </span>
            )
          )}
        </button>
      </h3>
      {open && (
        <div id={bodyId} className="px-3 pb-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {table.groups.map((g) => (
              <CategoryChart key={g.id} module={module} table={table} group={g} />
            ))}
          </div>
          {dups.length > 0 && (
            <p
              className="mt-2 px-1 text-[11px] leading-snug text-muted [overflow-wrap:anywhere]"
              data-testid="duplicates-note"
            >
              <span className="font-semibold text-ink-2">Also in the database:</span>{' '}
              {dups.map((d, i) => (
                <span key={d.column} title={d.source}>
                  {i > 0 && '; '}
                  {d.label} (identical to {d.duplicateOf})
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function DatabaseVariables({ module }: { module: ModuleId }) {
  const live = isLive(module);
  const q = useCategories(module, live);
  if (!live) return null;
  const title = 'Database variables';
  return (
    <section className="mt-6" aria-labelledby={`dbvars-${module}`} data-testid="database-variables">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 id={`dbvars-${module}`} className="text-lg font-bold tracking-tight text-ink">
          {title}
        </h2>
        <p className="text-xs text-muted">
          Every table and column of the national database for this page, with the database&apos;s own names and units.
        </p>
      </div>
      {queryStatus(q, 160) ?? (
        <>
          <SpecCoverage module={module} tables={q.data!.tables} title={title} provenance={panelProvenance(q, module)} />
          {q.data!.tables.map((t) => (
            <TableBlock key={t.id} module={module} table={t} />
          ))}
        </>
      )}
    </section>
  );
}
