import { inkFor } from '@/config/palettes';
import { ArrowDown, ArrowRight, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export interface FlowColumn {
  title: string;
  color: string;
  icon?: LucideIcon;
  items: { title: string; lines?: string[] }[];
}

/**
 * Layered left-to-right architecture / pipeline diagram (Data sources → Ingestion → Processing → Platform → Outputs).
 * Stacks vertically on narrow screens. Text-based, so it remains accessible and printable.
 */
export function FlowDiagram({ columns, compact = false }: { columns: FlowColumn[]; compact?: boolean }) {
  return (
    <ol className="flex flex-col gap-2 xl:flex-row xl:items-stretch" aria-label="Architecture diagram">
      {columns.map((c, k) => {
        const Icon = c.icon;
        return (
          <li key={c.title} className="flex flex-col xl:flex-1 xl:flex-row">
            <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface-2">
              <header className="flex items-center gap-2 px-3 py-2 text-sm font-semibold" style={{ background: c.color, color: inkFor(c.color) }}>
                {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                {c.title}
              </header>
              <ul className={clsx('flex flex-1 flex-col gap-1.5 p-2', compact && 'gap-1')}>
                {c.items.map((it) => (
                  <li key={it.title} className="rounded-lg border border-l-[3px] border-line bg-surface p-2" style={{ borderLeftColor: c.color }}>
                    <p className="text-[12px] font-semibold leading-tight text-ink">
                      {it.title}
                    </p>
                    {it.lines && (
                      <ul className="mt-0.5 space-y-0.5">
                        {it.lines.map((l) => (
                          <li key={l} className="text-[11px] leading-snug text-ink-2">
                            • {l}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            {k < columns.length - 1 && (
              <span className="flex items-center justify-center py-1 text-muted xl:px-1 xl:py-0" aria-hidden="true">
                <ArrowDown className="h-4 w-4 xl:hidden" />
                <ArrowRight className="hidden h-4 w-4 xl:block" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
