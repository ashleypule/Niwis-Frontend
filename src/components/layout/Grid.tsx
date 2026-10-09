import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Responsive page grids (build prompt §8):
 *  ≥1440: map ~40% + charts in a 2–3 column grid; 1024–1439: map full width, charts 2 columns;
 *  768–1023: 1–2 columns; < 768: single column.
 */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mt-3 grid gap-3', className)}>{children}</div>;
}

/** Map (left, ~40%) + content (right) at ≥1440px; stacked below. */
export function MapRow({ map, children, className }: { map: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('mt-3 grid gap-3 desk:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]', className)}>
      <div className="min-w-0">{map}</div>
      <div className="grid min-w-0 content-start gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

export const cols = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 xl:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
  '2-1': 'xl:grid-cols-[2fr_1fr]',
  '1-2': 'xl:grid-cols-[1fr_2fr]',
  '3-2': 'xl:grid-cols-[3fr_2fr]',
} as const;
