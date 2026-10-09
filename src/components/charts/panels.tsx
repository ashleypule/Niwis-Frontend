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

export interface PanelTab {
  value: string;
  label: string;
  /** extra query params for this tab (default: { metric: value }) */
  params?: QueryParams;
  metric?: string;
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
}: PanelBase & { forecast?: boolean; opts?: SeriesOpts }) {
  const { active, tabRow } = useTabs(tabs);
  const params = { ...extra, ...active?.params };
  const m = active?.metric ?? metric;
  const series = useSeries(module, m, params, !forecast);
  const fc = useForecast(module, m, params, !!forecast);
  const q = forecast ? fc : series;
  const t = useChartTheme();
  const option = useMemo(() => (q.data ? seriesOption(q.data, t, opts) : undefined), [q.data, t, opts]);
  const rows = useMemo(() => (q.data ? seriesRows(q.data) : undefined), [q.data]);
  return (
    <ChartCard
      title={title}
      context={context ?? q.data?.note}
      info={info}
      height={height}
      className={className}
      band={band}
      isLoading={q.isLoading}
      isError={q.isError}
      onRetry={() => q.refetch()}
      empty={!!q.data && q.data.series.every((s) => !s.data.length)}
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
  const q = useBreakdown(module, active?.metric ?? metric, { ...extra, ...active?.params });
  const t = useChartTheme();
  const option = useMemo(
    () => (q.data ? categoryOption(q.data, t, variant, { labels, log, legend }) : undefined),
    [q.data, t, variant, labels, log, legend],
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
        onRetry={() => q.refetch()}
        rows={rows}
        footer={footer}
        controls={tabRow ?? controls}
      >
        {q.data && option && <DonutBody set={q.data} option={option} height={height} title={title} />}
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
      onRetry={() => q.refetch()}
      empty={!!q.data && !q.data.categories.length}
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
  const q = useMatrix(module, active?.metric ?? metric, { ...extra, ...active?.params });
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

function DonutBody({
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
