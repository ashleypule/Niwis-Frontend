import { getScale } from '@/config/palettes';

/** Inline legend for a palette scale (used under heatmaps and in map legends). */
export function MatrixLegend({ scale, compact = true }: { scale: string; compact?: boolean }) {
  const sc = getScale(scale);
  return (
    <ul className={compact ? 'mt-1 flex flex-wrap gap-x-3 gap-y-1' : 'space-y-1'} aria-label={`${sc.title} legend`}>
      {sc.bins.map((b) => (
        <li key={b.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: b.color }} aria-hidden="true" />
          {b.label}
        </li>
      ))}
    </ul>
  );
}
