/**
 * One chart group of a database table (docs/backend/FRONTEND_INTEGRATION.md §8): the catalogue's table and group
 * labels as the title, one toggle chip per column (catalogue label and unit, source column in the tooltip), one axis
 * per unit. The selection is in the URL (`?drought.<table>.<group>=col1,col2`), so a view can be shared.
 * A column whose data end before the page period (SGI ends Aug 2024) offers this chart its last available months.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import clsx from 'clsx';
import type { ModuleId } from '@/config/modules';
import type { CategoryGroup, CategoryTable } from '@/types/api';
import { useCategorySeries } from '@/api/queries/core';
import { monthYear, panelProvenance } from '@/components/provenance/provenance';
import { toParams, useFilters } from '@/store/filters';
import { UnavailableState } from '@/components/feedback/PanelBoundary';
import { splitNullSeries } from '@/lib/provenance';
import {
  axisPlan,
  categoryChartData,
  categoryRows,
  chipTooltip,
  duplicatesFor,
  endedBefore,
  groupVariables,
  isAvailable,
  lastMonths,
  parseSelection,
  periodMonths,
  selectionParam,
  serializeSelection,
  unitOf,
} from '@/lib/categories';
import { ChartCard } from './ChartCard';
import { seriesOption } from './options';
import { useChartTheme, type ChartTheme } from './theme';
import type { EChartsOption } from './echarts';

type Obj = Record<string, unknown>;

/** Anomaly bars coloured by sign (warm / wet above 0), around a 0 baseline. */
function divergingBars(option: EChartsOption, keys: { key: string; warmIsPositive: boolean }[], t: ChartTheme) {
  if (!keys.length) return option;
  const o = option as Obj;
  const series = (o.series as Obj[]).map((s) => {
    const d = keys.find((k) => k.key === s.id);
    if (!d) return s;
    const up = d.warmIsPositive ? '#D7301F' : t.dark ? '#5AA2F0' : '#1565C0';
    const down = d.warmIsPositive ? (t.dark ? '#5AA2F0' : '#1565C0') : '#E08214';
    return {
      ...s,
      data: (s.data as unknown[][]).map((p) => ({
        value: p,
        itemStyle: { color: typeof p[1] === 'number' && p[1] < 0 ? down : up, borderRadius: 0 },
      })),
    };
  });
  return { ...o, series } as EChartsOption;
}

export function CategoryChart({
  module,
  table,
  group,
  height = 240,
}: {
  module: ModuleId;
  table: CategoryTable;
  group: CategoryGroup;
  height?: number;
}) {
  const t = useChartTheme();
  const vars = useMemo(() => groupVariables(table, group), [table, group]);
  const available = vars.filter(isAvailable);
  const param = selectionParam(module, table.id, group.id);
  const [sp, setSp] = useSearchParams();
  const raw = sp.get(param);
  const visible = useMemo(() => parseSelection(raw, group, vars), [raw, group, vars]);
  const plan = useMemo(() => axisPlan(vars, visible, group), [vars, visible, group]);
  // this chart's own period ("last available months"), kept only while the page filters stay as they were
  const filters = useFilters();
  const filterKey = JSON.stringify(toParams(filters));
  const [own, setOwn] = useState<{ from: string; to: string; key: string } | null>(null);
  const ownPeriod = useMemo(
    () => (own && own.key === filterKey ? { from: own.from, to: own.to } : undefined),
    [own, filterKey],
  );
  const q = useCategorySeries(module, table.id, group.id, available.length > 0, ownPeriod);

  const select = useCallback(
    (cols: string[]) =>
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          const v = serializeSelection(cols, group, vars);
          if (v == null) next.delete(param);
          else next.set(param, v);
          return next;
        },
        { replace: true, preventScrollReset: true },
      ),
    [setSp, group, vars, param],
  );
  const toggle = (col: string) => select(visible.includes(col) ? visible.filter((c) => c !== col) : [...visible, col]);

  const data = useMemo(
    () => (q.data ? categoryChartData(q.data, table, group, visible) : undefined),
    [q.data, table, group, visible],
  );
  // columns whose data end before the page period: "Data ends …" with an offer of their last months
  const ended = useMemo(
    () => (q.data && !ownPeriod ? endedBefore(q.data, vars, visible) : undefined),
    [q.data, ownPeriod, vars, visible],
  );
  const months = periodMonths(filters.period);
  const offer = ended ? lastMonths(ended.end, months) : undefined;
  // a live column with no values in this scope is hidden and listed under the chart (ended columns: the banner says why)
  const split = useMemo(() => {
    if (!data) return undefined;
    const sp = splitNullSeries(data.set);
    const said = new Set(ended?.columns.map((v) => v.label));
    return ended ? { ...sp, missing: sp.missing.filter((m) => !said.has(m.name)) } : sp;
  }, [data, ended]);
  const hasData = !!split && split.set.series.some((s) => s.data.some((p) => p.slice(1).some((v) => v != null)));
  const option = useMemo(
    () =>
      split && data
        ? divergingBars(
            seriesOption(split.set, t, { xFormat: data.xFormat, tooltipFormat: data.tooltipFormat, legend: false }),
            data.diverging,
            t,
          )
        : undefined,
    [split, data, t],
  );
  const rows = useMemo(
    () => (q.data ? categoryRows(q.data, table, group, visible) : undefined),
    [q.data, table, group, visible],
  );

  const title = `${table.label} · ${group.label}${table.specTag ? ` · ${table.specTag}` : ''}`;
  const colorOf = (col: string, i: number) =>
    q.data?.series.find((s) => s.key === col)?.color ?? t.series[i % t.series.length];
  const dups = duplicatesFor(table, group);
  const withheld = vars.filter((v) => v.status === 'withheld');
  const axes = plan.units.map((u) => ({
    unit: u || group.unit || '',
    columns: vars.filter((v) => visible.includes(v.column) && unitOf(v, group) === u).map((v) => v.column),
  }));

  const chips = (
    <div className="w-full min-w-0">
      <div
        className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap"
        role="group"
        aria-label={`${group.label}: variables`}
      >
        {vars.map((v, i) => {
          const blocked = plan.blocked.get(v.column);
          const on = visible.includes(v.column) && isAvailable(v) && !blocked;
          const disabled = !isAvailable(v) || !!blocked;
          return (
            <button
              key={v.column}
              type="button"
              aria-pressed={on}
              aria-disabled={disabled || undefined}
              data-column={v.column}
              data-status={v.status}
              title={chipTooltip(v, blocked)}
              onClick={disabled ? undefined : () => toggle(v.column)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                disabled
                  ? 'cursor-not-allowed border-dashed border-line bg-surface-2 text-muted line-through decoration-muted/60'
                  : on
                    ? 'border-primary/40 bg-primary-soft text-ink'
                    : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  background: disabled ? 'transparent' : on ? colorOf(v.column, i) : 'transparent',
                  boxShadow: `inset 0 0 0 1.5px ${disabled ? 'var(--c-border)' : colorOf(v.column, i)}`,
                }}
                aria-hidden="true"
              />
              {v.label}
              {v.isStale && isAvailable(v) && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-stale"
                  aria-label="stale: not updated for more than 90 days"
                  data-marker="stale-dot"
                />
              )}
            </button>
          );
        })}
        {available.length > 1 && (
          <span className="flex shrink-0 items-center gap-1 pl-1 text-[12px]">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 font-semibold text-primary hover:bg-surface-2"
              onClick={() => select(available.map((v) => v.column))}
            >
              All
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 font-semibold text-primary hover:bg-surface-2"
              onClick={() => select(parseSelection(null, group, vars))}
            >
              Reset
            </button>
          </span>
        )}
      </div>
    </div>
  );

  const footer =
    dups.length > 0 ? (
      <p className="mt-1.5 text-[11px] leading-snug text-muted [overflow-wrap:anywhere]" data-testid="duplicates-note">
        <span className="font-semibold text-ink-2">Also in the database:</span>{' '}
        {dups.map((d, i) => (
          <span key={d.column} title={d.source}>
            {i > 0 && '; '}
            {d.label} (identical to {d.duplicateOf})
          </span>
        ))}
      </p>
    ) : undefined;

  const endedBanner =
    ended && offer ? (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-stale/30 bg-stale-soft px-3 py-2 text-[12px] text-ink"
        data-testid="data-ends"
      >
        <span>
          <b>Data ends {monthYear(ended.end)}</b>
          {ended.columns.length < visible.length && ` (${ended.columns.map((v) => v.label).join(', ')})`}: nothing in
          the selected period.
        </span>
        <button
          type="button"
          className="rounded-md border border-primary/40 bg-surface px-2 py-1 font-semibold text-primary hover:bg-primary-soft"
          onClick={() => setOwn({ ...offer, key: filterKey })}
        >
          Show last available {months} months ({monthYear(offer.from)} – {monthYear(offer.to)})
        </button>
      </div>
    ) : null;
  const windowNote = ownPeriod ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2" data-testid="chart-own-period">
      <span>
        This chart only: {monthYear(ownPeriod.from)} – {monthYear(ownPeriod.to)}, the last {months} months with data.
      </span>
      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setOwn(null)}>
        Back to the page period
      </button>
    </div>
  ) : null;

  const common = {
    title,
    info: q.data?.note,
    height,
    controls: (
      <>
        {chips}
        {windowNote}
        {hasData && endedBanner}
      </>
    ),
    footer,
    provenance: available.length ? panelProvenance(q, module) : { kind: 'unavailable' as const },
  };
  const wrap = (body: React.ReactNode) => (
    <div
      data-category-chart={`${table.id}/${group.id}`}
      data-axes={JSON.stringify(axes)}
      data-visible={visible.join(',')}
      className="min-w-0"
    >
      {body}
    </div>
  );

  if (!available.length)
    return wrap(
      <ChartCard {...common}>
        <UnavailableState
          height={height - 40}
          detail={`Withheld: ${withheld.map((v) => `${v.label} (${v.reason ?? 'withheld'})`).join('; ')}`}
        />
      </ChartCard>,
    );

  return wrap(
    <ChartCard
      {...common}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => q.refetch()}
      missing={split?.missing}
      empty={visible.length > 0 && !!split && !hasData && !endedBanner}
      option={visible.length && (hasData || !endedBanner) ? option : undefined}
      rows={rows}
    >
      {visible.length > 0 && !hasData && endedBanner && (
        <div className="flex flex-col justify-center" style={{ minHeight: height }}>
          {endedBanner}
        </div>
      )}
      {visible.length === 0 && (
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted"
          style={{ height }}
        >
          Switch on a variable above to plot it.
        </div>
      )}
    </ChartCard>,
  );
}
