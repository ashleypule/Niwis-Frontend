import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { PanelBoundary } from '@/components/feedback/PanelBoundary';

interface CardProps {
  title?: ReactNode;
  /** small context tag, e.g. "[Station: Vaal at Bloemhof]" */
  context?: ReactNode;
  info?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** dark header band (the "-b" mockup style) */
  band?: boolean;
  id?: string;
}

export function Card({ title, context, info, actions, children, className, bodyClassName, band, id }: CardProps) {
  return (
    <section
      id={id}
      className={clsx(
        'card anim-in flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card',
        className,
      )}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {(title || actions) && (
        <header
          className={clsx(
            'flex min-h-[44px] items-center gap-2 px-4 pt-2.5',
            band ? 'bg-navy-2 pb-2.5 text-white' : 'pb-1',
          )}
        >
          <div className="min-w-0 flex-1">
            <h2
              className={clsx('line-clamp-2 text-[15px] font-semibold leading-tight', band ? 'text-white' : 'text-ink')}
            >
              {title}
              {info && (
                <span title={info} className="ml-1 inline-block cursor-help align-[-2px] text-muted">
                  <Info className="h-3.5 w-3.5" aria-label={info} />
                </span>
              )}
            </h2>
            {context && (
              <div className={clsx('truncate text-xs', band ? 'text-white/75' : 'text-muted')}>{context}</div>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={clsx('min-h-0 flex-1 px-4 pb-3', !title && 'pt-3', bodyClassName)}>
        <PanelBoundary>{children}</PanelBoundary>
      </div>
    </section>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: 'sm' | 'md';
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full overflow-x-auto rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'shrink-0 whitespace-nowrap rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-primary text-primary-ink shadow-sm' : 'text-ink-2 hover:bg-surface-3',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
