/**
 * Pure builders: API dataset → ECharts option. Every chart gets units on axes, a legend, SA-formatted tooltips,
 * theme-aware colours, and ARIA descriptions. Classification colours come from config/palettes.
 */
import type { CategorySet, MatrixSet, Series, SeriesSet } from '@/types/api';
import { binInk, classify, getScale } from '@/config/palettes';
import { formatDate, formatNumber, withUnit } from '@/lib/format';
import type { ChartTheme } from './theme';
import type { EChartsOption } from './echarts';

type Obj = Record<string, unknown>;

const FONT = "'Inter Variable', Inter, system-ui, sans-serif";

function decimalsFor(unit: string | undefined, v: number): number {
  const a = Math.abs(v);
  if (unit === '%' || unit === '% FSC') return a < 10 ? 1 : 0;
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  if (a >= 1) return 2;
  return a === 0 ? 0 : 3;
}

export function fmt(v: unknown, unit?: string): string {
  if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) return '—';
  if (typeof v !== 'number') return String(v);
  // axis-only units: "index" / "no unit" name the axis, they are not printed after a value
  if (unit === 'index' || unit === 'no unit') unit = undefined;
  return withUnit(formatNumber(v, Number.isInteger(v) ? 0 : decimalsFor(unit, v)), unit);
}

function axisLabelFmt(unit?: string) {
  return (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${formatNumber(v / 1e6, 1)} M`;
    return formatNumber(v, a >= 100 || Number.isInteger(v) ? 0 : a >= 1 ? 1 : 2) + (unit === '%' ? '%' : '');
  };
}

/**
 * Approximate legend height (legends wrap instead of paging) for a chart `width` px wide. Options assume a ~380 px card;
 * EChart corrects grid.top for the real width (adjustLegend).
 */
export function legendTop(names: string[], width = 380): number {
  const total = names.reduce((s, n) => s + n.length * 6.1 + 32, 0);
  const rows = Math.max(1, Math.ceil(total / Math.max(120, width - 90)));
  return 12 + rows * 18;
}

function base(t: ChartTheme, ariaDesc: string): Obj {
  return {
    animationDuration: 400,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: t.text2 },
    color: [...t.series],
    aria: { enabled: true, description: ariaDesc },
    tooltip: {
      confine: true,
      backgroundColor: t.surface,
      borderColor: t.border,
      textStyle: { color: t.text, fontSize: 12, fontFamily: FONT },
      extraCssText: 'box-shadow: 0 6px 20px rgba(0,0,0,.18); border-radius: 8px;',
    },
    legend: {
      type: 'plain',
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { color: t.text2, fontSize: 11 },
    },
  };
}

/** Log axes: the data range padded out to whole decades (an axis of 1–10 under values of 400–5 400 shows nothing). */
export function logRange(values: unknown[]): { min: number; max: number } | undefined {
  const pos = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (!pos.length) return undefined;
  const min = 10 ** Math.floor(Math.log10(Math.min(...pos)));
  const max = 10 ** Math.ceil(Math.log10(Math.max(...pos)));
  return { min, max: max === min ? min * 10 : max };
}

function valueAxis(
  t: ChartTheme,
  unit: string,
  o: {
    label?: string;
    min?: number;
    max?: number;
    inverse?: boolean;
    log?: boolean;
    position?: 'left' | 'right';
    showGrid?: boolean;
    /** the axis carries bars: it always includes 0, whatever min / max a dataset sets */
    bars?: boolean;
    /** values plotted on a log axis (sets the range to whole decades) */
    logValues?: unknown[];
  } = {},
): Obj {
  const name = o.label ? `${o.label}${unit ? ` (${unit})` : ''}` : unit;
  const range = o.log ? logRange(o.logValues ?? []) : undefined;
  const bars = !!o.bars && !o.log;
  let min = o.min;
  let max = o.max;
  if (o.log) {
    min = o.min != null && o.min > 0 ? o.min : range?.min;
    max = o.max ?? range?.max;
  } else if (bars) {
    min = o.min != null ? Math.min(o.min, 0) : undefined;
    max = o.max != null ? Math.max(o.max, 0) : undefined;
  }
  return {
    type: o.log ? 'log' : 'value',
    logBase: o.log ? 10 : undefined,
    name,
    // the unit sits above the axis: a rotated name beside it is not counted by containLabel and gets clipped
    nameLocation: 'end',
    nameGap: 10,
    nameTextStyle: {
      color: t.axis,
      fontSize: 11,
      align: o.position === 'right' ? 'right' : 'left',
      padding: o.position === 'right' ? [0, -4, 0, 0] : [0, 0, 0, -4],
    },
    position: o.position,
    min,
    max,
    inverse: o.inverse,
    // bars start at 0 (a bar's length is its value); lines may zoom to their range
    scale: !o.log && !bars && o.min == null,
    axisLabel: { color: t.axis, fontSize: 11, hideOverlap: true, formatter: axisLabelFmt(unit) },
    axisLine: { show: false },
    splitLine: { show: o.showGrid !== false, lineStyle: { color: t.grid } },
  };
}

/** Room above the plot for the value axis's unit title. */
const AXIS_NAME_H = 18;

const DAY = 86_400_000;
/** Shortest tick spacing per label format, so a short series never repeats a label ("Nov 2025 Nov 2025"). */
const MIN_TICK: Record<string, number> = { year: 365 * DAY, month: 28 * DAY, day: DAY };

/** The chart holds values after `asOf` (a forecast or projection): only then is the "Historical | Forecast" divider drawn. */
export function hasForecast(set: SeriesSet): boolean {
  if (!set.asOf || set.xType !== 'time') return false;
  const cut = Date.parse(set.asOf.slice(0, 10));
  if (!Number.isFinite(cut)) return false;
  return set.series.some((s) =>
    s.data.some((p) => Date.parse(String(p[0]).slice(0, 10)) > cut && p.slice(1).some((v) => v != null)),
  );
}

/** Annual series: one value per year, stamped mid-year (mock) or on 1 January (backend). */
function isAnnual(set: SeriesSet): boolean {
  const xs = set.series.flatMap((s) => s.data.map((p) => p[0]));
  if (!xs.length || !xs.every((x) => typeof x === 'string')) return false;
  const strs = xs as string[];
  if (strs.every((x) => x.endsWith('-07-01'))) return true;
  if (!strs.every((x) => /^\d{4}-01-01/.test(x))) return false;
  return new Set(strs.map((x) => x.slice(0, 4))).size > 1;
}

// ------------------------------------------------------------------ time / xy series
export interface SeriesOpts {
  /** stacked areas (e.g. drought D0–D4 area %) */
  stackedArea?: boolean;
  smooth?: boolean;
  dataZoom?: boolean;
  /** legend position */
  legend?: boolean;
  /** x axis label format */
  xFormat?: 'month' | 'year' | 'day' | 'raw';
  /** tooltip date format (defaults to the axis format), e.g. daily values on a monthly axis */
  tooltipFormat?: 'month' | 'year' | 'day';
  /** override colours by series key */
  colors?: Record<string, string>;
}

function bandSeries(s: Series, t: ChartTheme, axisIndex: number, color: string): Obj[] {
  const lower = s.data.map((p) => [p[0], p[1]]);
  const diff = s.data.map((p) => [p[0], p[1] == null || p[2] == null ? null : (p[2] as number) - (p[1] as number)]);
  const stack = `band-${s.key}`;
  return [
    {
      name: s.name,
      id: `${s.key}-lo`,
      type: 'line',
      data: lower,
      stack,
      stackStrategy: 'all',
      yAxisIndex: axisIndex,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      silent: true,
      tooltip: { show: false },
      legendHoverLink: false,
      z: 1,
    },
    {
      name: s.name,
      id: `${s.key}-band`,
      type: 'line',
      data: diff,
      stack,
      stackStrategy: 'all',
      yAxisIndex: axisIndex,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      areaStyle: { color, opacity: t.dark ? 0.28 : 0.2 },
      silent: true,
      z: 1,
    },
  ];
}

export function seriesOption(set: SeriesSet, t: ChartTheme, o: SeriesOpts = {}): EChartsOption {
  const axes = set.axes;
  const time = set.xType === 'time';
  const annual = time && set.series.length > 0 && isAnnual(set);
  const xFormat = o.xFormat ?? (annual ? 'year' : 'month');
  const forecast = hasForecast(set);
  // log axes cannot show 0 or negative values: those points are left out (the FDC ends at zero flow)
  const plotY = (s: Series, v: unknown) => (axes[s.axis ?? 0]?.log ? (typeof v === 'number' && v > 0 ? v : null) : v);
  const keepX = (p: unknown[]) => !set.xLog || (typeof p[0] === 'number' && p[0] > 0);
  const colorOf = (s: Series, i: number) => o.colors?.[s.key] ?? s.color ?? t.series[i % t.series.length];
  const out: Obj[] = [];
  set.series.forEach((s, i) => {
    const color = colorOf(s, i);
    const yAxisIndex = s.axis ?? 0;
    if (s.kind === 'band') {
      if (axes[yAxisIndex]?.log || set.xLog) {
        // stacked areas are undefined on log axes: draw the bounds as dashed lines
        out.push({
          id: `${s.key}-lo`,
          name: s.name,
          type: 'line',
          data: s.data.filter(keepX).map((p) => [p[0], plotY(s, p[1])]),
          yAxisIndex,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 1, color },
          itemStyle: { color },
          tooltip: { show: false },
        });
        out.push({
          id: `${s.key}-hi`,
          name: s.name,
          type: 'line',
          data: s.data.filter(keepX).map((p) => [p[0], plotY(s, p[2])]),
          yAxisIndex,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 1, color },
          itemStyle: { color },
          tooltip: { show: false },
        });
        return;
      }
      out.push(...bandSeries(s, t, yAxisIndex, color));
      return;
    }
    const isBar = s.kind === 'bar';
    const common: Obj = {
      id: s.key,
      name: s.name,
      yAxisIndex,
      data: s.data.filter(keepX).map((p) => [p[0], plotY(s, p[1])]),
      itemStyle: { color },
      emphasis: { focus: 'series' },
      z: isBar ? 2 : 3,
    };
    if (isBar) {
      out.push({
        ...common,
        type: 'bar',
        stack: s.stack,
        barMaxWidth: 14,
        itemStyle: { color, borderRadius: s.stack ? 0 : [2, 2, 0, 0] },
      });
    } else if (s.kind === 'scatter') {
      out.push({ ...common, type: 'scatter', symbolSize: 7, itemStyle: { color, opacity: 0.8 } });
    } else {
      const areaOn = s.kind === 'area' || o.stackedArea;
      out.push({
        ...common,
        type: 'line',
        step: s.kind === 'step' ? 'end' : undefined,
        stack: s.stack ?? (o.stackedArea ? 'total' : undefined),
        smooth: s.smooth ?? o.smooth ?? false,
        showSymbol: s.symbol ?? false,
        symbolSize: 5,
        connectNulls: false,
        lineStyle: { width: s.dash ? 1.5 : 2, type: s.dash ? 'dashed' : 'solid', color },
        areaStyle: areaOn ? { color, opacity: o.stackedArea ? 0.85 : 0.15 } : undefined,
        sampling: 'lttb',
      });
    }
  });

  // background classification bands (e.g. SPI drought classes) as markArea on an invisible helper series
  if (set.bands?.length) {
    out.unshift({
      type: 'line',
      name: '__bands',
      data: [],
      yAxisIndex: 0,
      silent: true,
      tooltip: { show: false },
      markArea: {
        silent: true,
        itemStyle: { opacity: t.dark ? 0.18 : 0.22 },
        label: { show: false },
        data: set.bands.map((b) => [{ yAxis: b.from, itemStyle: { color: b.color }, name: b.label }, { yAxis: b.to }]),
      },
    });
  }
  // reference lines (SANS limits, thresholds, bankfull …)
  const markLines: Obj[] = (set.refLines ?? []).map((r) => ({
    yAxis: r.y,
    name: r.label,
    lineStyle: { color: r.color ?? t.bad, type: 'dashed', width: 1.5 },
    label: { formatter: r.label, position: 'insideEndTop', color: r.color ?? t.bad, fontSize: 11 },
  }));
  // historical | forecast divider: only on charts with forecast values (asOf on its own is provenance)
  if (forecast) {
    markLines.push({
      xAxis: set.asOf,
      lineStyle: { color: t.axis, type: 'dashed', width: 1.5 },
      label: { formatter: 'Historical  |  Forecast', position: 'end', color: t.text2, fontSize: 11, fontWeight: 600 },
    });
  }
  if (markLines.length || forecast) {
    out.push({
      type: 'line',
      name: '__marks',
      data: [],
      silent: true,
      tooltip: { show: false },
      markLine: { symbol: 'none', silent: true, data: markLines },
      markArea: forecast
        ? {
            silent: true,
            itemStyle: { color: t.dark ? 'rgba(255,255,255,0.03)' : 'rgba(21,101,192,0.04)' },
            data: [[{ xAxis: set.asOf }, { xAxis: 'max' }]],
          }
        : undefined,
    });
  }

  const unitOfAxis = (ix: number) => axes[ix]?.unit ?? '';
  const nameUnit = new Map(set.series.map((s) => [s.name, unitOfAxis(s.axis ?? 0)]));
  const bandByName = new Map(set.series.filter((s) => s.kind === 'band').map((s) => [s.name, s]));

  const xRange = set.xLog ? logRange(set.series.flatMap((s) => s.data.map((p) => p[0]))) : undefined;
  const xAxis: Obj = time
    ? {
        type: 'time',
        minInterval: MIN_TICK[xFormat] ?? MIN_TICK.month,
        axisLabel: {
          color: t.axis,
          fontSize: 11,
          hideOverlap: true,
          // a label only where its period starts: mid-period ticks would repeat it
          // ECharts places time ticks in local time (SAST), so period starts are checked in local time
          formatter: (v: number) => {
            const d = new Date(v);
            if (xFormat === 'year') return d.getMonth() === 0 && d.getDate() === 1 ? String(d.getFullYear()) : '';
            if (xFormat === 'day') return formatDate(v, 'short');
            return d.getDate() === 1 ? formatDate(v, 'month') : '';
          },
        },
        axisLine: { lineStyle: { color: t.border } },
        splitLine: { show: false },
      }
    : {
        type: set.xType === 'value' ? (set.xLog ? 'log' : 'value') : 'category',
        logBase: set.xLog ? 10 : undefined,
        min: xRange?.min,
        max: xRange?.max,
        name: set.xUnit,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: t.axis, fontSize: 11 },
        axisLabel: { color: t.axis, fontSize: 11, hideOverlap: true },
        axisLine: { lineStyle: { color: t.border } },
        splitLine: { show: set.xType === 'value', lineStyle: { color: t.grid } },
        scale: set.xType === 'value' && !set.xLog,
      };

  const ariaDesc = `${set.title ?? 'Chart'}: ${set.series
    .filter((s) => s.kind !== 'band')
    .map((s) => s.name)
    .join(', ')}.`;
  const b = base(t, ariaDesc);
  return {
    ...b,
    legend:
      o.legend === false
        ? { show: false }
        : { ...(b.legend as Obj), data: set.series.filter((s) => !s.name.startsWith('__')).map((s) => s.name) },
    grid: {
      left: 8,
      // room for the last date label, which is centred on its tick
      right: axes.length > 1 ? 8 : time ? 24 : 14,
      top:
        (o.legend === false ? 12 : legendTop(set.series.filter((s) => !s.name.startsWith('__')).map((s) => s.name))) +
        (forecast ? 16 : 0) +
        AXIS_NAME_H,
      // an x-axis name (e.g. "% of time exceeded") sits under the labels
      bottom: o.dataZoom ? 46 : !time && set.xUnit ? 26 : 8,
      containLabel: true,
    },
    xAxis,
    yAxis: axes.map((a, i) => {
      const onAxis = set.series.filter((s) => (s.axis ?? 0) === i);
      return valueAxis(t, a.unit, {
        label: a.label,
        min: a.min,
        max: a.max,
        inverse: a.inverse,
        log: a.log,
        position: i === 0 ? 'left' : 'right',
        showGrid: i === 0,
        bars: onAxis.some((s) => s.kind === 'bar'),
        logValues: a.log ? onAxis.flatMap((s) => s.data.flatMap((p) => p.slice(1))) : undefined,
      });
    }),
    dataZoom: o.dataZoom
      ? [
          { type: 'inside' },
          { type: 'slider', height: 18, bottom: 6, borderColor: t.border, textStyle: { color: t.axis } },
        ]
      : undefined,
    tooltip: {
      ...(b.tooltip as Obj),
      trigger: set.xType === 'value' && set.series.every((s) => s.kind === 'scatter') ? 'item' : 'axis',
      axisPointer: { type: set.series.some((s) => s.kind === 'bar') ? 'shadow' : 'line', lineStyle: { color: t.axis } },
      formatter: (params: unknown) => {
        const ps = (Array.isArray(params) ? params : [params]) as {
          seriesName: string;
          seriesId: string;
          value: unknown;
          color: string;
          axisValue?: unknown;
          marker: string;
          dataIndex: number;
        }[];
        if (!ps.length) return '';
        const x0 = ps[0].axisValue ?? (Array.isArray(ps[0].value) ? (ps[0].value as unknown[])[0] : '');
        const tf = o.tooltipFormat ?? xFormat;
        const head = time
          ? tf === 'year'
            ? String(new Date(x0 as string).getUTCFullYear())
            : formatDate(x0 as string, tf === 'day' ? 'day' : 'month')
          : String(x0 ?? '');
        const rows: string[] = [];
        for (const p of ps) {
          if (p.seriesName.startsWith('__')) continue;
          if (p.seriesId?.endsWith('-lo')) continue;
          const v = Array.isArray(p.value) ? (p.value as unknown[])[1] : p.value;
          if (p.seriesId?.endsWith('-band')) {
            const bs = bandByName.get(p.seriesName);
            const raw = bs?.data[p.dataIndex];
            if (raw && raw[1] != null)
              rows.push(
                `${p.marker}${p.seriesName}: <b>${fmt(raw[1], nameUnit.get(p.seriesName))} – ${fmt(raw[2], nameUnit.get(p.seriesName))}</b>`,
              );
            continue;
          }
          if (set.xType === 'value' && Array.isArray(p.value)) {
            rows.push(
              `${p.marker}${p.seriesName}: ${fmt((p.value as unknown[])[0], set.xUnit)} → <b>${fmt(v, nameUnit.get(p.seriesName))}</b>`,
            );
            continue;
          }
          rows.push(`${p.marker}${p.seriesName}: <b>${fmt(v, nameUnit.get(p.seriesName))}</b>`);
        }
        return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${rows.join('<br/>')}`;
      },
    },
    series: out,
  };
}

// ------------------------------------------------------------------ categories
export type CategoryVariant =
  'bar' | 'hbar' | 'stacked' | 'stacked100' | 'hstacked100' | 'donut' | 'waterfall' | 'line' | 'mixed' | 'range';

export function categoryOption(
  set: CategorySet,
  t: ChartTheme,
  variant: CategoryVariant,
  o: { legend?: boolean; labels?: boolean; log?: boolean } = {},
): EChartsOption {
  const ariaDesc = `${set.title ?? 'Chart'} by ${set.categories.length} categories.`;
  const b = base(t, ariaDesc);
  const unit = set.unit;
  const tooltip = {
    ...(b.tooltip as Obj),
    trigger: variant === 'donut' ? 'item' : 'axis',
    axisPointer: { type: 'shadow' },
  };

  if (variant === 'donut') {
    const s = set.series[0];
    const total = s.values.reduce<number>((a, v) => a + (v ?? 0), 0);
    const data = set.categories.map((c, i) => ({
      name: c,
      value: s.values[i],
      itemStyle: { color: set.colors?.[i] ?? t.series[i % t.series.length], borderColor: t.surface, borderWidth: 2 },
    }));
    return {
      ...b,
      legend: { show: false },
      tooltip: {
        ...tooltip,
        formatter: (p: { name: string; value: number; percent: number; marker: string }) =>
          `${p.marker}${p.name}<br/><b>${fmt(p.value, unit)}</b> (${formatNumber(p.percent, 1)}%)`,
      },
      series: [
        {
          type: 'pie',
          radius: ['56%', '80%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'center',
            formatter: () => `{v|${set.center?.value ?? fmt(total, unit)}}\n{l|${set.center?.label ?? 'Total'}}`,
            rich: {
              v: { fontSize: 20, fontWeight: 700, color: t.text, lineHeight: 26, fontFamily: FONT },
              l: { fontSize: 11, color: t.axis, fontFamily: FONT },
            },
          },
          emphasis: { scale: true, scaleSize: 4, label: { show: true } },
          labelLine: { show: false },
          data,
        },
      ],
    };
  }

  const horizontal = variant === 'hbar' || variant === 'hstacked100';
  const catAxis: Obj = {
    type: 'category',
    data: set.categories,
    inverse: horizontal,
    axisLabel: {
      color: t.axis,
      fontSize: 11,
      interval: horizontal ? 0 : 'auto',
      hideOverlap: !horizontal,
      width: horizontal ? 110 : undefined,
      overflow: 'truncate',
    },
    axisLine: { lineStyle: { color: t.border } },
    axisTick: { show: false },
  };
  const is100 = variant === 'stacked100' || variant === 'hstacked100';
  const allValues = set.series.flatMap((s) => s.values);
  const valAxis = valueAxis(t, is100 ? '%' : unit, {
    min: is100 ? 0 : undefined,
    max: is100 ? 100 : undefined,
    log: o.log,
    // every bar variant starts at 0 (only 'line' may zoom)
    bars: variant !== 'line',
    logValues: o.log ? allValues : undefined,
  });

  let series: Obj[];
  if (variant === 'waterfall') {
    const vals = set.series[0].values.map((v) => v ?? 0);
    const isTotal = set.series.find((s) => s.key === 'isTotal')?.values ?? [];
    let run = 0;
    const helper: (number | string)[] = [];
    const pos: (number | string)[] = [];
    const neg: (number | string)[] = [];
    const tot: (number | string)[] = [];
    vals.forEach((v, i) => {
      if (isTotal[i]) {
        helper.push(0);
        tot.push(v);
        pos.push('-');
        neg.push('-');
        run = v;
        return;
      }
      tot.push('-');
      if (v >= 0) {
        helper.push(run);
        pos.push(v);
        neg.push('-');
        run += v;
      } else {
        run += v;
        helper.push(run);
        neg.push(-v);
        pos.push('-');
      }
    });
    series = [
      {
        type: 'bar',
        stack: 'wf',
        data: helper,
        itemStyle: { color: 'transparent' },
        emphasis: { disabled: true },
        tooltip: { show: false },
        name: '__helper',
      },
      {
        type: 'bar',
        stack: 'wf',
        name: 'Total',
        data: tot,
        itemStyle: { color: t.primary, borderRadius: [3, 3, 0, 0] },
        label: {
          show: true,
          position: 'top',
          color: t.text2,
          fontSize: 11,
          formatter: (p: { value: number }) => fmt(p.value, ''),
        },
      },
      {
        type: 'bar',
        stack: 'wf',
        name: 'Increase',
        data: pos,
        itemStyle: { color: '#2E9E5B' },
        label: {
          show: true,
          position: 'top',
          color: t.text2,
          fontSize: 11,
          formatter: (p: { value: number }) => `+${fmt(p.value, '')}`,
        },
      },
      {
        type: 'bar',
        stack: 'wf',
        name: 'Decrease',
        data: neg,
        itemStyle: { color: '#E95F35' },
        label: {
          show: true,
          position: 'bottom',
          color: t.text2,
          fontSize: 11,
          formatter: (p: { value: number }) => `−${fmt(p.value, '')}`,
        },
      },
    ];
    return {
      ...b,
      legend: { ...(b.legend as Obj), data: ['Total', 'Increase', 'Decrease'] },
      grid: { left: 8, right: 12, top: 32 + AXIS_NAME_H, bottom: 8, containLabel: true },
      xAxis: {
        ...catAxis,
        axisLabel: { ...(catAxis.axisLabel as Obj), interval: 0, rotate: set.categories.length > 7 ? 30 : 0 },
      },
      yAxis: valAxis,
      tooltip: {
        ...tooltip,
        formatter: (ps: { name: string; seriesName: string; value: unknown; marker: string }[]) => {
          const p = ps.find((x) => x.seriesName !== '__helper' && x.value !== '-');
          if (!p) return '';
          const sign = p.seriesName === 'Decrease' ? '−' : p.seriesName === 'Increase' ? '+' : '';
          return `<b>${p.name}</b><br/>${p.marker}${sign}${fmt(p.value, unit)}`;
        },
      },
      series,
    };
  }

  if (variant === 'range') {
    // series: min, mean, max (+ optional limit) per category, drawn as floating bars with a mean marker
    const get = (k: string) => set.series.find((s) => s.key === k)?.values ?? [];
    const mn = get('min');
    const mx = get('max');
    const av = get('mean');
    const lim = get('limit');
    series = [
      {
        type: 'bar',
        stack: 'r',
        name: '__lo',
        data: mn,
        itemStyle: { color: 'transparent' },
        tooltip: { show: false },
        emphasis: { disabled: true },
        barMaxWidth: 18,
      },
      {
        type: 'bar',
        stack: 'r',
        name: 'Range (min–max)',
        data: mx.map((v, i) => (v == null || mn[i] == null ? null : (v as number) - (mn[i] as number))),
        itemStyle: { color: t.primary, opacity: 0.35, borderRadius: 3 },
        barMaxWidth: 18,
      },
      { type: 'scatter', name: 'Mean', data: av, symbol: 'diamond', symbolSize: 10, itemStyle: { color: t.primary } },
      ...(lim.length
        ? [
            {
              type: 'scatter',
              name: 'Limit',
              data: lim,
              symbol: 'rect',
              symbolSize: [18, 3],
              itemStyle: { color: t.bad },
            },
          ]
        : []),
    ];
    return {
      ...b,
      legend: { ...(b.legend as Obj), data: ['Range (min–max)', 'Mean', ...(lim.length ? ['Limit'] : [])] },
      grid: { left: 8, right: 12, top: 34 + AXIS_NAME_H, bottom: 8, containLabel: true },
      xAxis: catAxis,
      yAxis: valueAxis(t, unit, { log: o.log, bars: true, logValues: o.log ? allValues : undefined }),
      tooltip: {
        ...tooltip,
        formatter: (ps: { dataIndex: number; name: string }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          return `<b>${set.categories[i]}</b><br/>Min: ${fmt(mn[i])}<br/>Mean: <b>${fmt(av[i])}</b><br/>Max: ${fmt(mx[i])}${lim.length ? `<br/>Limit: ${fmt(lim[i])}` : ''}`;
        },
      },
      series,
    };
  }

  const totals = set.categories.map((_, i) => set.series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  series = set.series.map((s, si) => {
    const color = s.color ?? (set.series.length === 1 && set.colors ? undefined : t.series[si % t.series.length]);
    const data = s.values.map((v, i) => {
      const val = is100 ? (totals[i] ? ((v ?? 0) / totals[i]) * 100 : 0) : v;
      return set.series.length === 1 && set.colors ? { value: val, itemStyle: { color: set.colors[i] } } : val;
    });
    const kind = variant === 'line' ? 'line' : variant === 'mixed' ? (s.kind ?? 'bar') : 'bar';
    return {
      id: s.key,
      name: s.name,
      type: kind,
      data,
      stack: variant === 'stacked' || is100 ? 'total' : s.stack,
      yAxisIndex: horizontal ? undefined : (s.axis ?? 0),
      barMaxWidth: horizontal ? 16 : 22,
      itemStyle: {
        color,
        borderRadius: variant === 'bar' || variant === 'hbar' ? (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]) : 0,
      },
      lineStyle: kind === 'line' ? { width: 2, color } : undefined,
      showSymbol: kind === 'line',
      symbolSize: 5,
      label:
        o.labels || (variant === 'hbar' && set.series.length === 1)
          ? {
              show: true,
              position: horizontal ? 'right' : 'top',
              color: t.text2,
              fontSize: 11,
              formatter: (p: { value: number }) => fmt(p.value, is100 ? '%' : unit),
            }
          : undefined,
    };
  });
  const yAxes = horizontal
    ? undefined
    : set.axis2Unit
      ? [
          valAxis,
          valueAxis(t, set.axis2Unit, {
            position: 'right',
            showGrid: false,
            bars: set.series.some((s) => s.axis === 1 && (s.kind ?? 'bar') === 'bar'),
          }),
        ]
      : valAxis;
  return {
    ...b,
    legend: o.legend === false || (set.series.length === 1 && variant !== 'line') ? { show: false } : b.legend,
    grid: {
      left: 8,
      right: horizontal ? 52 : 12,
      top:
        (o.legend === false || (set.series.length === 1 && variant !== 'line')
          ? 14
          : legendTop(set.series.map((s) => s.name))) + (horizontal ? 0 : AXIS_NAME_H),
      bottom: horizontal && variant !== 'hbar' ? 28 : 8,
      containLabel: true,
    },
    xAxis: horizontal
      ? {
          ...valAxis,
          nameLocation: 'middle',
          nameGap: 24,
          nameTextStyle: { color: t.axis, fontSize: 11 },
          axisLabel: { show: variant !== 'hbar', color: t.axis, fontSize: 11, hideOverlap: true },
          splitLine: { show: variant !== 'hbar', lineStyle: { color: t.grid } },
        }
      : catAxis,
    yAxis: horizontal ? catAxis : yAxes,
    tooltip: {
      ...tooltip,
      formatter: (
        ps: {
          name: string;
          seriesName: string;
          value: unknown;
          marker: string;
          dataIndex: number;
          seriesIndex: number;
        }[],
      ) => {
        const rows = ps.map((p) => {
          const raw = set.series[p.seriesIndex]?.values[p.dataIndex];
          const v = typeof p.value === 'object' && p.value ? (p.value as { value: number }).value : p.value;
          const u = set.series[p.seriesIndex]?.axis === 1 ? set.axis2Unit : unit;
          return `${p.marker}${p.seriesName}: <b>${is100 ? `${fmt(v, '%')} (${fmt(raw, unit)})` : fmt(v, u)}</b>`;
        });
        return `<b>${ps[0]?.name ?? ''}</b><br/>${rows.join('<br/>')}`;
      },
    },
    series,
  };
}

// ------------------------------------------------------------------ matrix heatmap
export function matrixOption(set: MatrixSet, t: ChartTheme): EChartsOption {
  const scale = getScale(set.scale);
  const data: Obj[] = [];
  set.rows.forEach((_, r) =>
    set.cols.forEach((__, c) => {
      const v = set.values[r][c];
      const bin = v == null ? null : classify(scale, v);
      data.push({
        value: [c, r, v],
        itemStyle: { color: bin?.color ?? scale.noData, borderColor: t.surface, borderWidth: 1 },
        label: { color: bin ? binInk(bin) : t.text2 },
      });
    }),
  );
  const b = base(t, `${set.title ?? 'Heatmap'}: ${set.rows.length} rows × ${set.cols.length} columns.`);
  // ECharts heatmaps require a visualMap; it mirrors the palette scale (hidden — the legend is rendered in HTML)
  const visualMap =
    scale.kind === 'category'
      ? {
          show: false,
          type: 'piecewise',
          dimension: 2,
          categories: scale.bins.map((bn) => bn.id ?? bn.label),
          inRange: { color: scale.bins.map((bn) => bn.color) },
        }
      : {
          show: false,
          type: 'piecewise',
          dimension: 2,
          pieces: scale.bins.map((bn) => ({ min: bn.min, max: bn.max, color: bn.color })),
          outOfRange: { color: scale.noData },
        };
  const showLabels = set.cols.length <= 8 && set.rows.length <= 12;
  return {
    ...b,
    legend: { show: false },
    visualMap,
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: set.cols,
      splitArea: { show: false },
      axisLabel: { color: t.axis, fontSize: 11, hideOverlap: true },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: set.rows,
      inverse: true,
      axisLabel: { color: t.axis, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: {
      ...(b.tooltip as Obj),
      trigger: 'item',
      formatter: (p: { value: [number, number, unknown] }) =>
        `<b>${set.rows[p.value[1]]}</b> · ${set.cols[p.value[0]]}<br/>${fmt(p.value[2], set.unit)}${typeof p.value[2] === 'number' ? ` — ${classify(scale, p.value[2])?.label ?? ''}` : ''}`,
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: showLabels,
          fontSize: 11,
          formatter: (p: { value: [number, number, unknown] }) =>
            typeof p.value[2] === 'number'
              ? formatNumber(p.value[2], Math.abs(p.value[2]) < 10 ? 1 : 0)
              : String(p.value[2] ?? ''),
        },
        emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1.5 } },
      },
    ],
  };
}

// ------------------------------------------------------------------ gauge
export function gaugeOption(
  value: number,
  t: ChartTheme,
  o: { min?: number; max?: number; scale?: string; unit?: string; label?: string } = {},
): EChartsOption {
  const min = o.min ?? 0;
  const max = o.max ?? 100;
  const scale = o.scale ? getScale(o.scale) : null;
  const stops: [number, string][] = scale
    ? scale.bins.map(
        (bn) =>
          [Math.min(1, Math.max(0, (((bn.max ?? max) as number) - min) / (max - min))), bn.color] as [number, string],
      )
    : [
        [0.3, '#D7301F'],
        [0.7, '#F6CF3E'],
        [1, '#2E9E5B'],
      ];
  stops[stops.length - 1][0] = 1;
  return {
    ...base(t, `${o.label ?? 'Gauge'}: ${fmt(value, o.unit)}`),
    series: [
      {
        type: 'gauge',
        min,
        max,
        startAngle: 200,
        endAngle: -20,
        radius: '92%',
        center: ['50%', '62%'],
        axisLine: { lineStyle: { width: 14, color: stops } },
        pointer: { length: '62%', width: 5, itemStyle: { color: t.text } },
        anchor: { show: true, size: 10, itemStyle: { color: t.text } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: { show: !!o.label, offsetCenter: [0, '38%'], color: t.axis, fontSize: 11 },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '12%'],
          fontSize: 20,
          fontWeight: 700,
          color: t.text,
          formatter: (v: number) => fmt(v, o.unit),
        },
        data: [{ value, name: o.label ?? '' }],
      },
    ],
  };
}
