/**
 * Data-bound panels: each fetches one dataset through the query hooks and renders it in a ChartCard.
 * Tabs switch query params (e.g. SPI timescale), so tab state lives in the panel.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useBreakdown, useForecast, useMatrix, useSeries } from '@/api/queries/core';
import { categoryRows, matrixRows, seriesRows } from '@/lib/exporter';
import { Tabs } from '@/components/ui/Card';
import { ChartCard } from './ChartCard';
import { categoryOption, fmt, matrixOption, seriesOption, type CategoryVariant, type SeriesOpts } from './options';
import { EChart } from './EChart';
import { formatNumber } from '@/lib/format';
import { useChartTheme } from './theme';
import { MatrixLegend } from './MatrixLegend';
import { splitNullCategories, splitNullSeries } from '@/lib/provenance';
import { panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { provenanceOf } from '@/api/client';
import type { SeriesSet } from '@/types/api';
import { UnavailableState } from '@/components/feedback/PanelBoundary';

export interface PanelTab {
  value: string;
  label: string;
  /** extra query params for this tab (default: { metric: value }) */
  params?: QueryParams;
  metric?: string;
  /** module serving this tab (defaults to the panel's), e.g. an Overview tab backed by a live module */
  module?: ModuleId;
  /** series keys this tab must return; if a live response returns none of them the tab shows "Not yet available" */
  expect?: string[];
}

interface PanelBase {
  module: ModuleId;
  metric: string;
  title: string;
  context?: ReactNode;
  info?: string;
  extra?: QueryParams;
  tabs?: PanelTab[];
  height?: number;
  className?: string;
  controls?: ReactNode;
  footer?: ReactNode;
  band?: boolean;
}

function useTabs(tabs?: PanelTab[]) {
  const [tab, setTab] = useState(tabs?.[0]?.value ?? '');
  const active = tabs?.find((t) => t.value === tab);
  const tabRow =
    tabs && tabs.length > 1 ? (
      <Tabs
        label="View"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({ value: t.value, label: t.label }))}
      />
    ) : null;
  return { active, tabRow };
}

export function SeriesPanel({
  module,
  metric,
  title,
  context,
  info,
  extra,
  tabs,
  height = 220,
  className,
  controls,
  footer,
  band,
  forecast,
  opts,
  enabled = true,
}: PanelBase & {
  forecast?: boolean;
  opts?: SeriesOpts;
  /** false until the request can be made (e.g. waiting for the selected entity) */
  enabled?: boolean;
}) {
  const { active, tabRow } = useTabs(tabs);
  const params = { ...extra, ...active?.params };
  const m = active?.metric ?? metric;
  const mod = active?.module ?? module;
  const series = useSeries(mod, m, params, !forecast && enabled);
  const fc = useForecast(mod, m, params, !!forecast && enabled);
  const q = forecast ? fc : series;
  const t = useChartTheme();
  const wrongSet = q.data && active?.expect ? wrongSeries(q.data, active.expect) : undefined;
  // entirely-null series (withheld by the backend) are hidden and listed under the chart
  const split = useMemo(() => (q.data && !wrongSet ? splitNullSeries(q.data) : undefined), [q.data, wrongSet]);
  const prov: PanelProvenance = wrongSet ? { kind: 'unavailable', detail: wrongSet } : panelProvenance(q, mod);
  const option = useMemo(() => (split ? seriesOption(split.set, t, opts) : undefined), [split, t, opts]);
  const rows = useMemo(() => (q.data ? seriesRows(q.data) : undefined), [q.data]);
  if (wrongSet)
    return (
      <ChartCard
        title={title}
        context={context}
        info={info}
        height={height}
        className={className}
        band={band}
        provenance={prov}
        controls={tabRow ?? controls}
      >
        <UnavailableState detail={wrongSet} height={height} />
      </ChartCard>
    );
  return (
    <ChartCard
      title={split ? recordTitle(title, split.set) : title}
      context={context ?? q.data?.note}
      info={info}
      height={height}
      className={className}
      band={band}
      provenance={prov}
      isLoading={q.isLoading || (!enabled && !q.data)}
      isError={q.isError}
      error={q.error}
      missing={split?.missing}
      onRetry={() => q.refetch()}
      empty={!!split && split.set.series.every((s) => !s.data.length)}
      option={option}
      rows={rows}
      footer={footer}
      controls={
        tabRow || controls ? (
          <>
            {tabRow}
            {controls}
          </>
        ) : undefined
      }
    />
  );
}

export function CategoryPanel({
  module,
  metric,
  title,
  context,
  info,
  extra,
  tabs,
  height = 220,
  className,
  controls,
  footer,
  band,
  variant = 'bar',
  labels,
  log,
  legend,
}: PanelBase & { variant?: CategoryVariant; labels?: boolean; log?: boolean; legend?: boolean }) {
  const { active, tabRow } = useTabs(tabs);
  const mod = active?.module ?? module;
  const q = useBreakdown(mod, active?.metric ?? metric, { ...extra, ...active?.params });
  const t = useChartTheme();
  const split = useMemo(() => (q.data ? splitNullCategories(q.data) : undefined), [q.data]);
  const prov = panelProvenance(q, mod);
  const option = useMemo(
    () => (split ? categoryOption(split.set, t, variant, { labels, log, legend }) : undefined),
    [split, t, variant, labels, log, legend],
  );
  const rows = useMemo(() => (q.data ? categoryRows(q.data) : undefined), [q.data]);
  if (variant === 'donut') {
    return (
      <ChartCard
        title={title}
        context={context}
        info={info}
        className={className}
        band={band}
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error}
        missing={split?.missing}
        provenance={prov}
        onRetry={() => q.refetch()}
        rows={rows}
        footer={footer}
        controls={tabRow ?? controls}
      >
        {split && option && split.set.series.length > 0 && (
          <DonutBody set={split.set} option={option} height={height} title={title} />
        )}
      </ChartCard>
    );
  }
  return (
    <ChartCard
      title={title}
      context={context}
      info={info}
      height={height}
      className={className}
      band={band}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      missing={split?.missing}
      provenance={prov}
      onRetry={() => q.refetch()}
      empty={!!split && (!split.set.categories.length || !split.set.series.length)}
      option={option}
      rows={rows}
      footer={footer}
      controls={
        tabRow || controls ? (
          <>
            {tabRow}
            {controls}
          </>
        ) : undefined
      }
    />
  );
}

export function MatrixPanel({
  module,
  metric,
  title,
  context,
  info,
  extra,
  tabs,
  height = 240,
  className,
  controls,
  band,
}: PanelBase) {
  const { active, tabRow } = useTabs(tabs);
  const mod = active?.module ?? module;
  const q = useMatrix(mod, active?.metric ?? metric, { ...extra, ...active?.params });
  const t = useChartTheme();
  const option = useMemo(() => (q.data ? matrixOption(q.data, t) : undefined), [q.data, t]);
  const rows = useMemo(() => (q.data ? matrixRows(q.data) : undefined), [q.data]);
  return (
    <ChartCard
      title={title}
      context={context}
      info={info}
      height={height}
      className={className}
      band={band}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      provenance={panelProvenance(q, mod)}
      onRetry={() => q.refetch()}
      option={option}
      rows={rows}
      footer={q.data ? <MatrixLegend scale={q.data.scale} /> : undefined}
      controls={
        tabRow || controls ? (
          <>
            {tabRow}
            {controls}
          </>
        ) : undefined
      }
    />
  );
}

export function DonutBody({
  set,
  option,
  height,
  title,
}: {
  set: import('@/types/api').CategorySet;
  option: import('./echarts').EChartsOption;
  height: number;
  title: string;
}) {
  const s = set.series[0];
  const total = s.values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const t = useChartTheme();
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-3 @[22rem]:flex-row">
        <div className="w-full max-w-[200px] shrink-0 @[22rem]:w-[44%]">
          <EChart option={option} height={height} ariaLabel={`${title} donut chart`} />
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-1.5 text-[12px]">
          {set.categories.map((c, i) => {
            const v = s.values[i] ?? 0;
            return (
              <li key={c} className="flex items-start gap-2">
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: set.colors?.[i] ?? t.series[i % t.series.length] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 leading-tight text-ink-2">{c}</span>
                <span className="num shrink-0 whitespace-nowrap font-semibold text-ink">
                  {fmt(v, set.unit === 'dams' || set.unit === 'km²' ? '' : set.unit)}
                </span>
                <span className="num w-9 shrink-0 text-right text-muted">
                  {formatNumber(total ? (v / total) * 100 : 0, 0)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Live response that contains none of the series a tab asked for: the reason, else undefined. */
function wrongSeries(set: SeriesSet, expect: string[]): string | undefined {
  if (provenanceOf(set)?.kind !== 'live') return undefined;
  const got = set.series.map((s) => s.key.toLowerCase());
  if (got.some((k) => expect.includes(k))) return undefined;
  const names = set.series.map((s) => s.name).join(', ');
  return `The national database does not serve ${expect.map((e) => e.toUpperCase()).join(', ')} for this chart yet (it returned ${names}).`;
}

/** "(1960 – Present)" over a live record that starts later: show the year the data actually start. */
function recordTitle(title: string, set: SeriesSet): string {
  if (provenanceOf(set)?.kind !== 'live' || !/1960\s*–\s*Present/.test(title)) return title;
  const years = set.series.flatMap((s) => s.data.map((p) => Number(String(p[0]).slice(0, 4)))).filter(Number.isFinite);
  const first = years.length ? Math.min(...years) : undefined;
  return first && first > 1960 ? title.replace(/1960(\s*–\s*Present)/, `${first}$1`) : title;
}
