import { forwardRef, lazy, Suspense, useImperativeHandle, useMemo, useRef } from 'react';
import type { EChartsOption } from './echarts';
import { useInView } from '@/lib/useInView';
import { legendTop } from './options';

const EChartCanvas = lazy(() => import('./EChartCanvas'));

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

/**
 * The chart's box (accessible name, size and the `data-chart` summary the tests read) renders at once; the ECharts
 * canvas (EChartCanvas: tree-shaken core, canvas renderer, auto-resizing) is imported only when the box nears the
 * viewport, so a page's first download carries no charting library.
 */
export const EChart = forwardRef<
  EChartHandle,
  { option: EChartsOption; height: number | string; ariaLabel: string; onClick?: (p: unknown) => void }
>(function EChart({ option, height, ariaLabel, onClick }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const canvas = useRef<EChartHandle>(null);
  useImperativeHandle(ref, () => ({ toPng: (bg: string) => canvas.current?.toPng(bg) }));
  const summary = useMemo(() => optionSummary(option), [option]);
  return (
    <div ref={box} role="img" aria-label={ariaLabel} style={{ height }} className="w-full min-w-0" data-chart={summary}>
      {inView && (
        <Suspense fallback={null}>
          <EChartCanvas ref={canvas} option={option} onClick={onClick} />
        </Suspense>
      )}
    </div>
  );
});
