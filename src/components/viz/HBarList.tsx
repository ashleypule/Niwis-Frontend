import { classify } from '@/config/palettes';
import { formatNumber, withUnit } from '@/lib/format';

export interface HBarItem {
  label: string;
  value: number;
  sub?: string;
  color?: string;
}

/** Ranked horizontal bars (e.g. storage by WMA, risk index). Colour from a scale; value always printed. */
export function HBarList({
  items,
  unit = '%',
  max,
  scale,
  decimals = 0,
}: {
  items: HBarItem[];
  unit?: string;
  max?: number;
  scale?: string;
  decimals?: number;
}) {
  const m = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const color = it.color ?? (scale ? classify(scale, it.value)?.color : undefined) ?? 'var(--c-primary)';
        return (
          <li key={it.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-[13px]">
            <span className="truncate text-ink-2" title={it.label}>
              {it.label}
            </span>
            <span className="h-3 overflow-hidden rounded-sm bg-surface-3" aria-hidden="true">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${Math.max(1.5, (it.value / m) * 100)}%`, background: color }}
              />
            </span>
            <span className="num w-14 text-right font-semibold text-ink">
              {withUnit(formatNumber(it.value, decimals), unit)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
