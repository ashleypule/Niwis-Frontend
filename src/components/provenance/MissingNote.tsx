import type { MissingItem } from '@/lib/provenance';

/** "Not available: Pan evaporation (withheld: …)" under a chart or table whose series / columns are null. */
export function MissingNote({ items }: { items: MissingItem[] }) {
  if (!items.length) return null;
  return (
    <p className="mt-1.5 text-[11px] leading-snug text-muted" data-testid="missing-note">
      <span className="font-semibold text-ink-2">Not available:</span>{' '}
      {items.map((m, i) => (
        <span key={m.name}>
          {i > 0 && '; '}
          {m.name} <span className="italic">({m.reason})</span>
        </span>
      ))}
    </p>
  );
}
