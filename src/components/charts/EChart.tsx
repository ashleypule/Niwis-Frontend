import { forwardRef, useImperativeHandle, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { echarts, type EChartsOption } from './echarts';

export interface EChartHandle {
  toPng: (bg: string) => string | undefined;
}

/** Thin wrapper: tree-shaken core, canvas renderer, auto-resizes with its container (ResizeObserver). */
export const EChart = forwardRef<EChartHandle, { option: EChartsOption; height: number | string; ariaLabel: string; onClick?: (p: unknown) => void }>(function EChart(
  { option, height, ariaLabel, onClick },
  ref,
) {
  const inner = useRef<ReactEChartsCore>(null);
  useImperativeHandle(ref, () => ({
    toPng: (bg: string) => inner.current?.getEchartsInstance().getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg }),
  }));
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full min-w-0">
      <ReactEChartsCore
        ref={inner}
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={onClick ? { click: onClick } : undefined}
      />
    </div>
  );
});
