/**
 * The ECharts part of EChart: the canvas chart itself. Loaded with a dynamic import when the chart nears the viewport,
 * so ECharts is not part of any page's first download.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { echarts, type EChartsOption } from './echarts';
import { adjustLegend, type EChartHandle } from './EChart';

const EChartCanvas = forwardRef<EChartHandle, { option: EChartsOption; onClick?: (p: unknown) => void }>(
  function EChartCanvas({ option, onClick }, ref) {
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
    return (
      <div ref={box} className="h-full w-full">
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
  },
);

export default EChartCanvas;
