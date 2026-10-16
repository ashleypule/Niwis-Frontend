/**
 * Panel provenance: where a panel's numbers come from (Live backend data, Sample data, or nothing yet), and the facts
 * the backend attaches to them (as-of date, source tables, staleness, baseline, aggregation). Derived from the query
 * result, so every data-bound panel marks itself; cards without a data query default to Sample in hybrid mode.
 */
import { createContext, useContext } from 'react';
import { isUnavailable, provenanceOf } from '@/api/client';
import { APP, showProvenance } from '@/config/app';
import { MONTH_NAMES } from '@/lib/format';
import type { Component } from '@/types/api';

export interface PanelProvenance {
  /** none = no marker (static content, mock mode, or still loading / failed: the body says so) */
  kind: 'live' | 'sample' | 'unavailable' | 'none';
  asOf?: string;
  source?: string[];
  isStale?: boolean;
  components?: Component[];
  baseline?: string;
  baselineNote?: string;
  aggregation?: string;
  /** backend reason a live panel shows sample data / no data (501 detail) */
  detail?: string;
  /** values are modelled, not measured (runoff) */
  modelled?: string;
}

export const NO_MARKER: PanelProvenance = { kind: 'none' };
export const SAMPLE: PanelProvenance = { kind: 'sample' };

/** Modules whose live values are modelled rather than measured, with the explanation shown on the marker. */
export const MODELLED: Record<string, string> = {
  runoff:
    'Modelled, not gauged: runoff depth from the runoff model; flows and volumes = depth × district area. No river gauge data in the database.',
};

type Body = {
  asOf?: string;
  periodEnd?: string;
  source?: string[];
  isStale?: boolean;
  components?: Component[];
  baseline?: string;
  baselineNote?: string;
  aggregation?: string;
};

/** Provenance of one query result. */
export function panelProvenance(
  q: { data?: unknown; error?: unknown; isError?: boolean },
  module?: string,
): PanelProvenance {
  if (!showProvenance) return NO_MARKER;
  if (q.isError && isUnavailable(q.error)) return { kind: 'unavailable', detail: q.error.detail };
  const p = provenanceOf(q.data);
  if (!p) return NO_MARKER;
  if (p.kind === 'sample') return { kind: 'sample', detail: p.detail };
  if (p.kind !== 'live') return NO_MARKER;
  const b = q.data as Body;
  return {
    kind: 'live',
    // the end of the period for monthly / annual values ("as of Dec 2025" for the year 2025, stamped 2025-01-01)
    asOf: b.periodEnd ?? b.asOf,
    source: b.source,
    isStale: b.isStale || b.components?.some((c) => c.isStale),
    components: b.components,
    baseline: b.baseline,
    baselineNote: b.baselineNote,
    aggregation: b.aggregation,
    modelled: module ? MODELLED[module] : undefined,
  };
}

/** Several queries in one panel (e.g. a map with point layers): sample wins over live, so nothing sample looks live. */
export function combineProvenance(...ps: PanelProvenance[]): PanelProvenance {
  const real = ps.filter((p) => p.kind !== 'none');
  if (!real.length) return NO_MARKER;
  const sample = real.find((p) => p.kind === 'sample');
  const live = real.find((p) => p.kind === 'live');
  if (sample && live) return { ...live, kind: 'sample', detail: sample.detail ?? 'Part of this panel is sample data.' };
  return sample ?? live ?? real[0];
}

/** Default marker for cards that don't pass one: Sample in hybrid / api mode (only data panels can claim Live). */
export const DefaultProvenance = createContext<PanelProvenance>(SAMPLE);
export const useDefaultProvenance = () => useContext(DefaultProvenance);

// ------------------------------------------------------------------ labels

/** "2026-09-06" → "Sep 2026" */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/** Date the stale marker shows: the oldest stale component (or the panel's own as-of). */
export function staleDate(p: PanelProvenance): string | undefined {
  const stale = (p.components ?? []).filter((c) => c.isStale && c.asOf).map((c) => c.asOf!);
  if (stale.length) return stale.sort()[0];
  if (!p.isStale || !p.asOf) return undefined;
  // stale, but its own as-of is recent: it mixes sources (e.g. a table of tables), so no single date applies
  return isRecent(p.asOf) ? undefined : p.asOf;
}

/** Stale without a date to show: some of the panel's sources are stale. */
export const partlyStale = (p: PanelProvenance): boolean => !!p.isStale && !staleDate(p);

function isRecent(iso: string): boolean {
  const t = Date.parse(iso.slice(0, 10));
  return Number.isFinite(t) && APP.asOf.getTime() - t < 90 * 86_400_000;
}

export function sourceTooltip(p: PanelProvenance): string {
  const lines: string[] = [];
  if (p.source?.length) lines.push(`Source tables: ${p.source.join(', ')}`);
  if (p.components?.length)
    lines.push(
      ...p.components.map((c) => `${c.key}: data to ${monthYear(c.asOf) || 'n/a'}${c.isStale ? ' (stale)' : ''}`),
    );
  if (p.baseline) lines.push(`Baseline: ${p.baseline}`);
  if (p.aggregation) lines.push(`Aggregation: ${AGGREGATION[p.aggregation] ?? p.aggregation}`);
  return lines.join('\n');
}

export const AGGREGATION: Record<string, string> = {
  district: 'district values',
  'district-area-weighted': 'area-weighted from districts',
  'district-overlap': 'approximate: districts weighted by their overlap with the WMA',
};

const OLD_BASELINES = /1981\s*[–-]\s*2010|1961\s*[–-]\s*1990/;

/**
 * Never show "1981–2010" over live data: replace it with the real baseline ("vs 2000–2026 mean"). Without a stated
 * baseline the phrase becomes "record mean" (the backend's anomalies use the mean of its whole record).
 */
export function withBaseline(text: string, p: PanelProvenance): string;
export function withBaseline(text: string | undefined, p: PanelProvenance): string | undefined;
export function withBaseline(text: string | undefined, p: PanelProvenance): string | undefined {
  if (!text || p.kind !== 'live' || !OLD_BASELINES.test(text)) return text;
  const range = p.baseline ? /\d{4}\s*[–-]\s*\d{4}/.exec(p.baseline)?.[0] : undefined;
  return text.replace(new RegExp(OLD_BASELINES.source, 'g'), range ? `${range} mean` : 'record mean');
}

/** Info tooltip: the panel's own info plus the baseline note, with old baselines replaced. */
export function baselineInfo(info: string | undefined, p: PanelProvenance): string | undefined {
  if (p.kind !== 'live' || (!p.baseline && !p.baselineNote)) return withBaseline(info, p);
  const note = [p.baseline && `Baseline: ${p.baseline}.`, p.baselineNote].filter(Boolean).join(' ');
  return [withBaseline(info, p), note].filter(Boolean).join(' ');
}
