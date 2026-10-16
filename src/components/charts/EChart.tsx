import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { echarts, type EChartsOption } from './echarts';
import { legendTop } from './options';

export interface EChartHandle {
  toPng: (bg: string) => string | undefined;
}

type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : v ? [v as Obj] : []);

/**
 * What the chart draws, as a data attribute: value axes (name, type, min, scale), series (name, type, axis) and
 * whether the "Historical | Forecast" divider is on. The e2e tests check axis units, zero baselines and dividers on it.
 */
export function optionSummary(option: EChartsOption): string {
  const o = option as Obj;
  const series = list(o.series);
  const divider = series.some((s) =>
    list((s.markLine as Obj | undefined)?.data).some((d) => !Array.isArray(d) && d.xAxis != null),
  );
  return JSON.stringify({
    y: list(o.yAxis).map((a) => ({ name: a.name ?? '', type: a.type, min: a.min ?? null, scale: !!a.scale })),
    s: series
      .filter((s) => typeof s.name === 'string' && !(s.name as string).startsWith('__'))
      .map((s) => ({ name: s.name, type: s.type, axis: (s.yAxisIndex as number | undefined) ?? 0 })),
    divider,
  });
}

/** Options estimate the legend's height for a ~380 px card: re-estimate it for the chart's real width. */
export function adjustLegend(option: EChartsOption, width: number): EChartsOption {
  const o = option as Obj;
  const legend = o.legend as Obj | undefined;
  const grid = o.grid as Obj | undefined;
  if (!width || !legend || legend.show === false || !grid || typeof grid.top !== 'number') return option;
  const names = (
    (legend.data as unknown[] | undefined) ??
    list(o.series)
      .map((s) => s.name)
      .filter((n) => typeof n === 'string' && !n.startsWith('__'))
  ).map(String);
  if (!names.length) return option;
  const top = grid.top - legendTop(names) + legendTop(names, width);
  return top === grid.top ? option : ({ ...o, grid: { ...grid, top } } as EChartsOption);
}

/** Thin wrapper: tree-shaken core, canvas renderer, auto-resizes with its container (ResizeObserver). */
export const EChart = forwardRef<
  EChartHandle,
  { option: EChartsOption; height: number | string; ariaLabel: string; onClick?: (p: unknown) => void }
>(function EChart({ option, height, ariaLabel, onClick }, ref) {
  const inner = useRef<ReactEChartsCore>(null);
  useImperativeHandle(ref, () => ({
    toPng: (bg: string) =>
      inner.current?.getEchartsInstance().getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg }),
  }));
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // rounded to 20 px so a resize re-lays the chart out only when the legend may wrap differently
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width / 20) * 20));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const shown = useMemo(() => adjustLegend(option, width), [option, width]);
  const summary = useMemo(() => optionSummary(option), [option]);
  return (
    <div ref={box} role="img" aria-label={ariaLabel} style={{ height }} className="w-full min-w-0" data-chart={summary}>
      <ReactEChartsCore
        ref={inner}
        echarts={echarts}
        option={shown}
        notMerge
        lazyUpdate
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={onClick ? { click: onClick } : undefined}
      />
    </div>
  );
});
