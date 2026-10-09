import clsx from 'clsx';
import { AlertOctagon, AlertTriangle, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { binInk, classify, type ScaleBin } from '@/config/palettes';
import type { Severity } from '@/types/api';

/**
 * Status pill coloured by a palette scale. The class label is always printed, so meaning never depends on
 * colour alone (WCAG 1.4.1).
 */
export function Pill({ scale, value, label, className, size = 'md' }: { scale: string; value: string | number | null | undefined; label?: string; className?: string; size?: 'sm' | 'md' }) {
  const bin: ScaleBin | null = value == null ? null : classify(scale, value);
  const text = label ?? (typeof value === 'string' ? (bin?.id === value ? shortLabel(bin) : value) : bin ? shortLabel(bin) : '—');
  return (
    <span
      className={clsx('inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold', size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs', className)}
      style={bin ? { background: bin.color, color: binInk(bin) } : { background: 'var(--c-surface-3)', color: 'var(--c-muted)' }}
    >
      {text}
    </span>
  );
}

function shortLabel(bin: ScaleBin): string {
  // "D2 – Severe drought" → "D2 Severe"; "Excellent (90–100)" → "Excellent"
  if (/^D\d/.test(bin.label)) return bin.label.replace(' – ', ' ').replace(/ drought$/i, '');
  return bin.label.replace(/\s*\(.*\)$/, '').replace(/^[<≥>≤]?\s?[\d.–\s%-]+\s/, '');
}

const SEV_ICON = { critical: AlertOctagon, high: TriangleAlert, moderate: AlertTriangle, low: CircleCheck, info: Info } as const;
const SEV_COLOR: Record<Severity, string> = { critical: '#B71C1C', high: '#E95F35', moderate: '#C98A00', low: '#5E9E2F', info: '#1565C0' };

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const Icon = SEV_ICON[severity];
  return <Icon className={clsx('h-[18px] w-[18px] shrink-0', className)} style={{ color: SEV_COLOR[severity] }} aria-label={`${severity} severity`} role="img" />;
}
