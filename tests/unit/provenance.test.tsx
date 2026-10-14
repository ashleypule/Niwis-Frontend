/** Rendering the backend's null-with-reason convention and its provenance fields. */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '@/components/kpi/KpiCard';
import { splitNullSeries, tableMissing } from '@/lib/provenance';
import type { SeriesSet, TableSet } from '@/types/api';

describe('null values with reasons', () => {
  it('a null KPI renders "—" with the reason as tooltip, never a number', () => {
    render(
      <KpiCard
        kpi={{
          id: 'stations',
          metric: 'activeStations',
          label: 'Active Rainfall Stations',
          value: null,
          unavailableReason: 'No station data in the database',
        }}
      />,
    );
    const v = screen.getByTestId('kpi-missing');
    expect(v).toHaveTextContent('—');
    expect(v).toHaveAttribute('title', 'No station data in the database');
    expect(screen.getByRole('article')).toHaveAccessibleName(/not available \(No station data in the database\)/);
  });

  const base: Omit<SeriesSet, 'series'> = { id: 'x', xType: 'time', axes: [{ unit: 'mm' }] };

  it('an all-null series is hidden and listed with its reason', () => {
    const { set, missing } = splitNullSeries({
      ...base,
      series: [
        { key: 'et0', name: 'ET₀', kind: 'line', data: [['2026-01-01', 4.1]] },
        { key: 'pan', name: 'Pan evaporation', kind: 'line', data: [['2026-01-01', null]] },
      ],
      unavailable: [{ field: 'series.pan', reason: 'withheld: implausible values' }],
    });
    expect(set.series.map((s) => s.key)).toEqual(['et0']);
    expect(missing).toEqual([{ name: 'Pan evaporation', reason: 'withheld: implausible values' }]);
  });

  it('the empty half of a positive / negative split bar is kept (it is not missing data)', () => {
    const { set, missing } = splitNullSeries({
      ...base,
      series: [
        { key: 'pos', name: 'Positive anomaly', kind: 'bar', stack: 'a', data: [['2026-01-01', 12]] },
        { key: 'neg', name: 'Negative anomaly', kind: 'bar', stack: 'a', data: [['2026-01-01', null]] },
      ],
    });
    expect(set.series).toHaveLength(2);
    expect(missing).toEqual([]);
  });

  it('table fields in `unavailable` are named by column label', () => {
    const t: TableSet = {
      id: 'sources',
      columns: [
        { key: 'source', label: 'Source', type: 'text' },
        { key: 'stations', label: 'Stations', type: 'number' },
      ],
      rows: [{ source: 'District daily rainfall', stations: null }],
      unavailable: [{ field: 'rows.stations', reason: 'No station data in the database' }],
    };
    expect(tableMissing(t)).toEqual([{ name: 'Stations', reason: 'No station data in the database' }]);
  });
});

describe('baselines, staleness and combined panels', async () => {
  const { withBaseline, baselineInfo, staleDate, combineProvenance, monthYear } =
    await import('@/components/provenance/provenance');
  const live = (extra: object = {}) => ({ kind: 'live' as const, ...extra });

  it('never shows 1981–2010 over live data', () => {
    const p = live({ baseline: '2000–2026 monthly mean', baselineNote: 'Shorter than the WMO 30-year standard.' });
    expect(withBaseline('Rainfall Anomaly (vs 1981–2010)', p)).toBe('Rainfall Anomaly (vs 2000–2026 mean)');
    expect(withBaseline('Seasonal Changes (vs 1961–1990)', p)).toBe('Seasonal Changes (vs 2000–2026 mean)');
    expect(withBaseline('Rainfall Anomaly (vs 1981–2010)', live())).toBe('Rainfall Anomaly (vs record mean)');
    expect(baselineInfo(undefined, p)).toBe('Baseline: 2000–2026 monthly mean. Shorter than the WMO 30-year standard.');
  });

  it('keeps 1981–2010 on sample data (that is what the mock is calibrated on)', () => {
    expect(withBaseline('Rainfall Anomaly (vs 1981–2010)', { kind: 'sample' })).toBe('Rainfall Anomaly (vs 1981–2010)');
  });

  it('a panel built from components is stale if any component is, dated by the oldest stale one', () => {
    const p = live({
      asOf: '2026-08-01',
      isStale: true,
      components: [
        { key: 'meteorological', asOf: '2026-08-01', isStale: false },
        { key: 'agricultural', asOf: '2025-12-01', isStale: true },
        { key: 'hydrological', asOf: '2025-11-01', isStale: true },
      ],
    });
    expect(monthYear(staleDate(p))).toBe('Nov 2025');
    expect(staleDate(live({ asOf: '2026-08-01', isStale: false }))).toBeUndefined();
  });

  it('a panel mixing live and sample data is marked Sample', () => {
    expect(combineProvenance(live({ asOf: '2026-08-01' }), { kind: 'sample' }).kind).toBe('sample');
    expect(combineProvenance(live(), { kind: 'none' }).kind).toBe('live');
  });
});
