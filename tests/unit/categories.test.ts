import { describe, expect, it } from 'vitest';
import type { CategoryTable, SeriesSet } from '@/types/api';
import {
  applyColumnLabels,
  axisPlan,
  categoryChartData,
  categoryRows,
  chartTypeOf,
  coverageCounts,
  duplicatesFor,
  endedBefore,
  lastMonths,
  parseSelection,
  periodMonths,
  serializeSelection,
  variableKind,
  variablesBySource,
} from '@/lib/categories';
import { hasForecast, logRange, seriesOption } from '@/components/charts/options';
import { chartThemes } from '@/components/charts/theme';
import { cellFormat } from '@/components/table/DataTable';
import { tableNumber } from '@/components/charts/ChartCard';
import { vegClass } from '@/config/thresholds';

const T = 'meteorological_drought_master';
const table: CategoryTable = {
  id: 'met',
  table: T,
  label: 'Meteorological Drought',
  specTag: '§3.1',
  resolution: 'monthly',
  groups: [
    {
      id: 'spei',
      label: 'SPEI (index)',
      unit: 'index',
      resolution: 'monthly',
      columns: ['spei_1', 'spei_3', 'spei_6'],
      defaultVisible: ['spei_1', 'spei_3'],
    },
    {
      id: 'mixed',
      label: 'Mixed (test)',
      columns: ['rain_mm', 'rain_anom_mm', 'rh_pct', 'temp_c', 'wind'],
      defaultVisible: ['rain_mm', 'rh_pct'],
    },
  ],
  variables: [
    { column: 'spei_1', label: 'SPEI 1', name: 'SPEI 1', status: 'live', group: 'spei', source: `${T}.spei_1` },
    { column: 'spei_3', label: 'SPEI 3', name: 'SPEI 3', status: 'live', group: 'spei', source: `${T}.spei_3` },
    { column: 'spei_6', label: 'SPEI 6', name: 'SPEI 6', status: 'live', group: 'spei', source: `${T}.spei_6` },
    { column: 'rain_mm', label: 'Monthly Rainfall (mm)', name: 'Monthly Rainfall', unit: 'mm', status: 'live' },
    { column: 'rain_anom_mm', label: 'Rainfall Anomaly (mm)', name: 'Rainfall Anomaly', unit: 'mm', status: 'live' },
    { column: 'rh_pct', label: 'Relative Humidity (%)', name: 'Relative Humidity', unit: '%', status: 'live' },
    { column: 'temp_c', label: 'Tavg (°C)', name: 'Tavg', unit: '°C', status: 'live' },
    { column: 'wind', label: 'Wind (m/s)', unit: 'm/s', status: 'withheld', reason: 'constant 2.5 m/s' },
    {
      column: 'spi_1',
      label: 'SPI 1',
      status: 'duplicate',
      duplicateOf: '6.2_rainfall_derived_drought_indices_master.SPI_1',
    },
    { column: 'spei_1_copy', label: 'SPEI 1 copy', status: 'duplicate', duplicateOf: `${T}.spei_1` },
  ],
};
const spei = table.groups[0];
const mixed = table.groups[1];

const set = (series: SeriesSet['series']): SeriesSet => ({
  id: 'x',
  xType: 'time',
  axes: [{ unit: 'index' }],
  series,
});

describe('category charts', () => {
  it('draws totals as bars, anomalies diverging, SPI/SPEI over bands, the rest as lines', () => {
    expect(variableKind({ column: 'a', label: 'Daily Rainfall Total (mm)', unit: 'mm' })).toBe('total');
    expect(variableKind({ column: 'a', label: 'CHIRPS Daily Rainfall Estimate (mm/day)', unit: 'mm/day' })).toBe(
      'total',
    );
    expect(variableKind({ column: 'a', label: 'ET₀ (mm/day)', unit: 'mm/day' })).toBe('state');
    expect(variableKind({ column: 'a', label: 'MAP (mm)', unit: 'mm' })).toBe('state');
    expect(variableKind({ column: 'a', label: 'Dam Storage (Mm³)', unit: 'Mm³' })).toBe('state');
    expect(variableKind({ column: 'a', label: 'Monthly Anomaly (%)', unit: '%' })).toBe('anomaly');
    expect(variableKind({ column: 'a', label: 'SPI 3 – Short Term Agricultural Drought' })).toBe('spi');
    expect(variableKind({ column: 'a', label: 'LST Day (°C)', unit: '°C' })).toBe('state');
  });

  it('never puts two units on one axis and never draws a third axis', () => {
    const vars = table.variables.filter((v) => mixed.columns.includes(v.column));
    const plan = axisPlan(vars, ['rain_mm', 'rh_pct'], mixed);
    expect(plan.units).toEqual(['mm', '%']);
    expect(plan.blocked.get('temp_c')).toBe('Different unit — hide Relative Humidity (%) to compare');
    // same unit as an existing axis: allowed
    expect(plan.blocked.has('rain_anom_mm')).toBe(false);
    // withheld columns are unavailable, not "blocked"
    expect(plan.blocked.has('wind')).toBe(false);
    const data = categoryChartData(
      set([
        { key: 'rain_mm', name: 'Monthly Rainfall (mm)', kind: 'line', data: [['2026-01-01', 80]] },
        { key: 'rh_pct', name: 'Relative Humidity (%)', kind: 'line', data: [['2026-01-01', 60]] },
        { key: 'temp_c', name: 'Tavg (°C)', kind: 'line', data: [['2026-01-01', 20]] },
      ]),
      table,
      mixed,
      ['rain_mm', 'rh_pct', 'temp_c'],
    );
    expect(data.set.axes.map((a) => a.unit)).toEqual(['mm', '%']);
    expect(data.set.series.map((s) => [s.key, s.axis, s.kind])).toEqual([
      ['rain_mm', 0, 'bar'],
      ['rh_pct', 1, 'line'],
    ]);
  });

  it('puts the D0–D4 bands behind SPEI and keeps the index axis', () => {
    const data = categoryChartData(
      set([{ key: 'spei_1', name: 'SPEI 1', kind: 'line', data: [['2026-01-01', -1]] }]),
      table,
      spei,
      ['spei_1'],
    );
    expect(data.set.axes).toEqual([{ unit: 'index' }]);
    expect(data.set.bands?.map((b) => b.label)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4']);
    expect(data.set.bands?.[0]).toMatchObject({ from: -0.8, to: -0.5 });
    expect(data.set.bands?.[4]).toMatchObject({ from: -3.5, to: -2 });
  });

  it('shares the selection through the URL, defaults omitted, unknown / unavailable columns dropped', () => {
    const vars = table.variables;
    expect(parseSelection(null, spei, vars)).toEqual(['spei_1', 'spei_3']);
    expect(parseSelection('spei_6,nope,spei_6', spei, vars)).toEqual(['spei_6']);
    expect(parseSelection('', spei, vars)).toEqual([]);
    expect(serializeSelection(['spei_3', 'spei_1'], spei, vars)).toBeNull();
    expect(serializeSelection(['spei_6', 'spei_1'], spei, vars)).toBe('spei_1,spei_6');
    expect(parseSelection('rain_mm,wind', mixed, vars)).toEqual(['rain_mm']);
  });

  it('exports the visible columns only, with units in the headers', () => {
    const rows = categoryRows(
      set([
        { key: 'spei_1', name: 'SPEI 1', kind: 'line', data: [['2026-01-01', 0.5]] },
        { key: 'spei_3', name: 'SPEI 3', kind: 'line', data: [['2026-01-01', 0.2]] },
      ]),
      table,
      spei,
      ['spei_3'],
    );
    expect(rows).toEqual([{ date: '2026-01-01', 'SPEI 3 (index)': 0.2 }]);
  });

  it('lists duplicates under the chart of the column they repeat, else under the table', () => {
    expect(duplicatesFor(table, spei).map((v) => v.column)).toEqual(['spei_1_copy']);
    expect(duplicatesFor(table).map((v) => v.column)).toEqual(['spi_1']);
    expect(coverageCounts([table])).toEqual({ tables: 1, columns: 10, live: 7, withheld: 1, duplicate: 2 });
  });

  it('labels summary series from their source column, if its unit is the axis unit; derived series keep their name', () => {
    const lookup = variablesBySource([table]);
    const out = applyColumnLabels(
      {
        id: 'spi',
        xType: 'time',
        axes: [{ unit: '—', label: 'SPEI-1' }],
        series: [
          { key: 'spei1', name: 'SPEI-1', kind: 'line', data: [], source: [`${T}.spei_1`] },
          { key: 'mean', name: 'Long-term mean', kind: 'line', data: [] },
        ],
      },
      lookup,
    );
    expect(out.series.map((s) => s.name)).toEqual(['SPEI 1', 'Long-term mean']);
    // one series on the axis is derived: the axis keeps the backend's label
    expect(out.axes[0]).toEqual({ unit: '—', label: 'SPEI-1' });
    const only = applyColumnLabels(
      { id: 'x', xType: 'time', axes: [{ unit: '—', label: 'SPEI-1' }], series: [out.series[0]] },
      lookup,
    );
    expect(only.axes[0]).toEqual({ unit: 'index', label: undefined });
    // an annual total of a daily-rate column is not the column: the backend's name stays
    const total = applyColumnLabels(
      {
        id: 'r',
        xType: 'time',
        axes: [{ unit: 'mm/yr' }],
        series: [{ key: 'rain', name: 'Rainfall', kind: 'bar', data: [], source: [`${T}.rain_mm`] }],
      },
      lookup,
    );
    expect(total.series[0].name).toBe('Rainfall');
  });
});

describe('backend recommendations and columns that end early', () => {
  const tt: CategoryTable = {
    ...table,
    groups: [
      {
        id: 'temp',
        label: 'Temperature (°C)',
        unit: '°C',
        columns: ['tmin', 'tmax', 'tavg'],
        defaultVisible: ['tmin', 'tmax', 'tavg'],
        chart: 'band',
        band: ['tmin', 'tmax'],
      },
      { id: 'idx', label: 'SSI / SGI (index)', columns: ['sgi'], defaultVisible: ['sgi'], chart: 'line' },
    ],
    variables: [
      { column: 'tmin', label: 'Tmin (°C)', unit: '°C', status: 'live', chart: 'line' },
      { column: 'tmax', label: 'Tmax (°C)', unit: '°C', status: 'live', chart: 'line' },
      { column: 'tavg', label: 'Tavg (°C)', unit: '°C', status: 'live', chart: 'line' },
      { column: 'sgi', label: 'SGI', status: 'live', chart: 'line', isStale: true, periodEnd: '2024-08-31' },
    ],
  };
  const pts = (v: number | null) => [
    ['2025-01-01', v] as [string, number | null],
    ['2025-02-01', v] as [string, number | null],
  ];

  it("uses the backend's chart type and keeps the inference only as a fallback", () => {
    // the name says "anomaly" (inference: diverging bars) but the backend says line
    expect(chartTypeOf({ column: 'a', label: 'Rainfall Anomaly (mm)', unit: 'mm', chart: 'line' })).toBe('line');
    expect(chartTypeOf({ column: 'a', label: 'Rainfall Anomaly (mm)', unit: 'mm' }, { chart: 'bar' })).toBe('bar');
    expect(chartTypeOf({ column: 'a', label: 'Rainfall Anomaly (mm)', unit: 'mm' })).toBe('diverging-bar');
    // an unknown value is not a recommendation
    expect(chartTypeOf({ column: 'a', label: 'Daily Rainfall Total (mm)', unit: 'mm', chart: 'pie' })).toBe('bar');
  });

  it("draws the group's band pair as one band and the other columns by their own type", () => {
    const set: SeriesSet = {
      id: 't',
      xType: 'time',
      axes: [{ unit: '°C' }],
      series: ['tmin', 'tmax', 'tavg'].map((k, i) => ({ key: k, name: k, kind: 'line', data: pts(10 + i) })),
    };
    const all = categoryChartData(set, tt, tt.groups[0], ['tmin', 'tmax', 'tavg']);
    expect(all.set.series.map((s) => [s.key, s.kind])).toEqual([
      ['tmin__tmax', 'band'],
      ['tavg', 'line'],
    ]);
    expect(all.set.series[0].data[0]).toEqual(['2025-01-01', 10, 11]);
    // half the pair switched off: no band, the other end is a line
    const half = categoryChartData(set, tt, tt.groups[0], ['tmax', 'tavg']);
    expect(half.set.series.map((s) => s.kind)).toEqual(['line', 'line']);
  });

  it('finds columns whose data end before the window, and their last months', () => {
    const empty: SeriesSet = {
      id: 'g',
      xType: 'time',
      axes: [{ unit: 'index' }],
      series: [{ key: 'sgi', name: 'SGI', kind: 'line', data: pts(null) }],
    };
    expect(endedBefore(empty, tt.variables, ['sgi'])).toMatchObject({ end: '2024-08-31' });
    // empty here but its data run into the window: not "ended" (no data for this scope)
    const recent = tt.variables.map((v) => (v.column === 'sgi' ? { ...v, periodEnd: '2025-12-31' } : v));
    expect(endedBefore(empty, recent, ['sgi'])).toBeUndefined();
    expect(
      endedBefore({ ...empty, series: [{ ...empty.series[0], data: pts(0.4) }] }, tt.variables, ['sgi']),
    ).toBeUndefined();
    expect(lastMonths('2024-08-31', 12)).toEqual({ from: '2023-09-01', to: '2024-08-31' });
    expect(lastMonths('2024-08-31', 3)).toEqual({ from: '2024-06-01', to: '2024-08-31' });
    expect([periodMonths('24M'), periodMonths('5Y'), periodMonths('historical'), periodMonths()]).toEqual([
      24, 60, 12, 12,
    ]);
  });
});

describe('chart presets (audit fixes)', () => {
  const t = chartThemes.LIGHT;
  type Y = { type: string; min?: number; max?: number; scale: boolean };

  it('pads log axes out to the data, in decades', () => {
    expect(logRange([400, 5400, 0, -1, null])).toEqual({ min: 100, max: 10000 });
    const o = seriesOption(
      {
        id: 'fdc',
        xType: 'value',
        axes: [{ unit: 'm³/s', log: true }],
        series: [
          {
            key: 'q',
            name: 'Q',
            kind: 'line',
            data: [
              [0, 5400],
              [50, 400],
              [100, 0],
            ],
          },
        ],
      },
      t,
    ) as { yAxis: Y[]; series: { data: unknown[][] }[] };
    expect(o.yAxis[0]).toMatchObject({ type: 'log', min: 100, max: 10000 });
    // a zero flow cannot sit on a log axis: left out instead of dragging the axis to 1
    expect(o.series[0].data[2]).toEqual([100, null]);
  });

  it('starts bar axes at 0, whatever min the dataset sets', () => {
    const o = seriesOption(
      {
        id: 'a',
        xType: 'time',
        axes: [{ unit: '%', min: 15 }],
        series: [{ key: 'b', name: 'B', kind: 'bar', data: [['2025-01-01', 19]] }],
      },
      t,
    ) as { yAxis: Y[] };
    expect(o.yAxis[0]).toMatchObject({ min: 0, scale: false });
  });

  it('draws the Historical | Forecast divider only with forecast values', () => {
    const status: SeriesSet = {
      id: 's',
      xType: 'time',
      asOf: '2026-08-01',
      axes: [{ unit: 'mm' }],
      series: [{ key: 'a', name: 'A', kind: 'line', data: [['2026-08-01', 1]] }],
    };
    expect(hasForecast(status)).toBe(false);
    expect(hasForecast({ ...status, series: [{ ...status.series[0], data: [['2026-10-01', 2]] }] })).toBe(true);
  });

  it('uses a row unit / decimals over the column in mixed tables, and trend decimals for trends', () => {
    const value = { key: 'value', label: 'Value', type: 'number' as const, decimals: 1 };
    const trend = { key: 'trend', label: 'Trend', type: 'number' as const, unit: '/decade', decimals: 2 };
    expect(cellFormat(value, { unit: 'mm', decimals: 0 })).toMatchObject({ unit: 'mm', decimals: 0 });
    expect(cellFormat(trend, { unit: 'mm', decimals: 0 })).toMatchObject({ unit: '/decade', decimals: 2 });
    expect(cellFormat(trend, { trendDecimals: 4 })).toMatchObject({ decimals: 4 });
  });
});

describe('chart data table', () => {
  it('prints numbers with a decimal point and grouped thousands (not the en-ZA decimal comma)', () => {
    expect(tableNumber(9.43)).toBe('9.43');
    expect(tableNumber(0.1234)).toBe('0.123');
    expect(tableNumber(2)).toBe('2');
    expect(tableNumber(1234.5)).toBe('1 234.5');
    expect(tableNumber(-0.5)).toBe('−0.5');
  });
});

describe('vegetation classes (spec §5.3)', () => {
  it('classifies VCI / VHI with the spec names', () => {
    expect([90, 70, 50, 30, 10].map(vegClass)).toEqual(['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor']);
  });
});
