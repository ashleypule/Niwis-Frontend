import clsx from 'clsx';
import { APP } from '@/config/app';
import { AGGREGATION, monthYear, partlyStale, sourceTooltip, staleDate, type PanelProvenance } from './provenance';

const chip =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold';

export const SAMPLE_TOOLTIP =
  'Sample data: generated for design and testing because the national database does not serve this yet. Not for operational decisions.';

/**
 * The provenance chips of a panel: Live · as of …, Data to … (stale), Modelled, Approximate (district-based), or Sample.
 * Text is always printed (meaning never depends on colour alone); details are in the tooltips.
 */
export function ProvenanceChips({ p, className }: { p: PanelProvenance; className?: string }) {
  if (p.kind === 'none' || p.kind === 'unavailable') return null;
  if (p.kind === 'sample')
    return (
      <div className={clsx('flex flex-wrap items-center gap-1', className)}>
        <SampleChip detail={p.detail} />
      </div>
    );
  const stale = staleDate(p);
  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)} data-testid="provenance">
      <span
        className={clsx(chip, 'cursor-help bg-live-soft text-live')}
        title={sourceTooltip(p) || undefined}
        data-marker="live"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {APP.liveLabel}
        {p.asOf && <span className="font-medium"> · as of {monthYear(p.asOf)}</span>}
      </span>
      {stale && (
        <span
          className={clsx(chip, 'cursor-help bg-stale-soft text-stale')}
          title={`Data to ${monthYear(stale)}: this source has not been updated for more than 90 days.`}
          data-marker="stale"
        >
          Data to {monthYear(stale)}
        </span>
      )}
      {partlyStale(p) && (
        <span
          className={clsx(chip, 'cursor-help bg-stale-soft text-stale')}
          title="Some of the sources behind this panel have not been updated for more than 90 days (see the dates in the panel)."
          data-marker="stale"
        >
          Some sources stale
        </span>
      )}
      {p.modelled && (
        <span className={clsx(chip, 'cursor-help bg-surface-3 text-ink-2')} title={p.modelled} data-marker="modelled">
          Modelled
        </span>
      )}
      {p.aggregation === 'district-overlap' && (
        <span
          className={clsx(chip, 'cursor-help bg-surface-3 text-ink-2')}
          title={`Values are ${AGGREGATION['district-overlap']}.`}
          data-marker="approximate"
        >
          Approximate (district-based)
        </span>
      )}
    </div>
  );
}

export function SampleChip({ detail, className }: { detail?: string; className?: string }) {
  return (
    <span
      className={clsx(chip, 'cursor-help border border-sample/30 bg-sample-soft text-sample', className)}
      title={detail ? `Sample data. The national database has no data for this panel yet: ${detail}` : SAMPLE_TOOLTIP}
      data-marker="sample"
    >
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
        <path d="M0 10L10 0M-2 4L4 -2M6 12L12 6" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      Sample
    </span>
  );
}

/** Stale marker for one value (a KPI or an entity field). */
export function StaleChip({ asOf, className }: { asOf?: string | null; className?: string }) {
  return (
    <span
      className={clsx(chip, 'cursor-help bg-stale-soft text-stale', className)}
      title={`Data to ${monthYear(asOf)}: this source has not been updated for more than 90 days.`}
      data-marker="stale"
    >
      Data to {monthYear(asOf)}
    </span>
  );
}
