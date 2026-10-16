import { describe, expect, it } from 'vitest';
import type { CategoryTable, SeriesSet } from '@/types/api';
import {
  applyColumnLabels,
  axisPlan,
  categoryChartData,
  categoryRows,
  coverageCounts,
  duplicatesFor,
  parseSelection,
  serializeSelection,
  variableKind,
  variablesBySource,
} from '@/lib/categories';
import { normalizeVegClasses } from '@/lib/vegClasses';
import { hasForecast, logRange, seriesOption } from '@/components/charts/options';
import { chartThemes } from '@/components/charts/theme';
import { cellFormat } from '@/components/table/DataTable';
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

  it('labels summary series that are a database column with its catalogue label and unit', () => {
    const out = applyColumnLabels(
      {
        id: 'spi',
        xType: 'time',
        axes: [{ unit: '—', label: 'SPEI-1' }],
        series: [{ key: 'spei1', name: 'SPEI-1', kind: 'line', data: [] }],
      },
      { spei1: `${T}.spei_1` },
      variablesBySource([table]),
    );
    expect(out.series[0].name).toBe('SPEI 1');
    expect(out.axes[0]).toEqual({ unit: 'index', label: undefined });
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

describe('vegetation classes (spec §5.3)', () => {
  it('classifies VCI / VHI with the spec names', () => {
    expect([90, 70, 50, 30, 10].map(vegClass)).toEqual(['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor']);
  });

  it("maps the backend's legacy names in KPIs, class columns, text columns, cascade rows and category lists", () => {
    const kpis = normalizeVegClasses({
      kpis: [{ status: { scale: 'vci', id: 'Very Healthy', label: 'Very Healthy' } }],
    });
    expect(kpis.kpis[0].status).toEqual({ scale: 'vci', id: 'Excellent', label: 'Excellent' });
    const tbl = normalizeVegClasses({
      columns: [
        { key: 'vci', type: 'number', scale: 'vci' },
        { key: 'status', type: 'text' },
        { key: 'risk', type: 'text' },
      ],
      rows: [
        { vci: 90, status: 'Very Healthy', risk: 'Moderate' },
        { vci: 50, status: 'Moderate', risk: 'High', scale: 'vci', cls: 'Stressed' },
      ],
    });
    expect(tbl.rows.map((r) => r.status)).toEqual(['Excellent', 'Fair']);
    // a risk column with a "Moderate" value is not a vegetation class
    expect(tbl.rows.map((r) => r.risk)).toEqual(['Moderate', 'High']);
    expect(tbl.rows[1].cls).toBe('Poor');
    const cats = normalizeVegClasses({
      categories: ['Very Healthy', 'Healthy', 'Moderate', 'Stressed', 'Very Stressed'],
      series: [],
    });
    expect(cats.categories).toEqual(['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor']);
    // elsewhere, a lone "Moderate" stays
    expect(normalizeVegClasses({ categories: ['Low', 'Moderate'], series: [] }).categories).toEqual([
      'Low',
      'Moderate',
    ]);
  });
});
