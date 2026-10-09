import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';

export interface Option {
  value: string;
  label: string;
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  label: string;
  value: string | undefined;
  options: Option[];
  placeholder?: string;
  onChange: (v: string | undefined) => void;
  icon?: React.ReactNode;
  hideLabel?: boolean;
  size?: 'sm' | 'md';
}

/** Native select (fully keyboard / screen-reader accessible) styled to match the mockups. */
export function Select({
  label,
  value,
  options,
  placeholder,
  onChange,
  icon,
  hideLabel = true,
  className,
  size = 'md',
  ...rest
}: Props) {
  return (
    <label className={clsx('relative flex min-w-0 items-center', className)}>
      <span className={hideLabel ? 'sr-only' : 'mr-2 text-xs font-medium text-muted'}>{label}</span>
      {icon && <span className="pointer-events-none absolute left-2.5 text-primary">{icon}</span>}
      <select
        {...rest}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={clsx(
          'w-full min-w-0 appearance-none truncate rounded-lg border border-line bg-surface pr-8 text-ink shadow-[0_1px_0_rgb(0_0_0/0.02)] hover:border-line-strong focus:border-primary',
          size === 'sm' ? 'h-8 py-1 text-xs' : 'h-9 py-1.5 text-[13px]',
          icon ? 'pl-8' : 'pl-3',
        )}
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" aria-hidden="true" />
    </label>
  );
}
