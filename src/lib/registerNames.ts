/**
 * Register names on a dataset's derived series and axes (docs/NAMING_REGISTER.md): a series that is not a database
 * column drawn under its catalogue label (no single `source`) takes the register's spelling (SPI-3, Heavy rain days
 * (R20mm), Standardised, Mm³/year …); a series whose name carries a unit other than its axis's gets its own axis, so
 * one axis never mixes units (one axis per unit, at most two).
 */
import { canonLabel, canonUnit, unitInLabel } from '@/config/naming';
import { DROUGHT_CLASSES } from '@/config/thresholds';
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

/** "D0" … "D4" → the register's class label ("D0 Abnormally Dry"). */
function className(name: string): string {
  const c = /^D[0-4]$/.test(name) ? DROUGHT_CLASSES.find((d) => d.id === name) : undefined;
  return c ? `${c.id} ${c.label}` : name;
}

/** Axes no series is drawn on (the series was withheld) are dropped, the remaining series re-indexed. */
export function pruneEmptyAxes(set: SeriesSet): SeriesSet {
  if (set.axes.length < 2) return set;
  const used = set.axes.map((_, i) => set.series.some((s) => (s.axis ?? 0) === i));
  if (used.every(Boolean)) return set;
  const keep = set.axes.filter((_, i) => used[i]);
  if (!keep.length) return set;
  const index = new Map(set.axes.map((_, i) => [i, used.slice(0, i).filter(Boolean).length] as const));
  return { ...set, axes: keep, series: set.series.map((s) => ({ ...s, axis: index.get(s.axis ?? 0) ?? 0 })) };
}

function registerSeries(set: SeriesSet): SeriesSet {
  const series = set.series.map((s) => (s.source?.length === 1 ? s : { ...s, name: className(canonLabel(s.name)) }));
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
