/**
 * Register names on a dataset's derived series and axes (docs/NAMING_REGISTER.md): a series that is not a database
 * column drawn under its catalogue label (no single `source`) takes the register's spelling (SPI-3, Heavy rain days
 * (R20mm), Standardised, Mm³/year …); a series whose name carries a unit other than its axis's gets its own axis, so
 * one axis never mixes units (one axis per unit, at most two).
 */
import { canonLabel, canonUnit, unitInLabel } from '@/config/naming';
import type { CategorySet, SeriesSet } from '@/types/api';

export function registerNames<T extends SeriesSet | CategorySet>(set: T): T {
  if ('axes' in set) return registerSeries(set) as T;
  return {
    ...set,
    categories: set.categories.map((c) => canonLabel(c)),
    series: set.series.map((s) => ({ ...s, name: canonLabel(s.name) })),
    unit: set.unit,
  } as T;
}

function registerSeries(set: SeriesSet): SeriesSet {
  const series = set.series.map((s) => (s.source?.length === 1 ? s : { ...s, name: canonLabel(s.name) }));
  const axes = set.axes.map((a) => ({ ...a, label: a.label ? canonLabel(a.label) : a.label }));
  // a second axis for series whose own unit differs from the (only) axis's unit, e.g. "FIBI (%)" on a score axis
  if (axes.length === 1) {
    const axisUnit = canonUnit(axes[0].unit);
    const others = new Set<string>();
    for (const s of series) {
      const u = unitInLabel(s.name);
      if (u != null && canonUnit(u) !== axisUnit) others.add(canonUnit(u));
    }
    if (others.size === 1) {
      const unit = [...others][0];
      return {
        ...set,
        axes: [axes[0], { unit }],
        series: series.map((s) => {
          const u = unitInLabel(s.name);
          return u != null && canonUnit(u) === unit ? { ...s, axis: 1 } : s;
        }),
      };
    }
  }
  return { ...set, series, axes };
}
