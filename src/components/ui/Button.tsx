import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'action' | 'outline' | 'ghost' | 'danger';
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

const V: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover border border-transparent',
  action: 'bg-action text-white hover:bg-action-hover border border-transparent',
  outline: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2',
  ghost: 'border border-transparent text-ink-2 hover:bg-surface-2',
  danger: 'bg-bad text-white hover:opacity-90 border border-transparent',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-[13px]',
        V[variant],
        className,
      )}
      {...rest}
    />
  );
});
