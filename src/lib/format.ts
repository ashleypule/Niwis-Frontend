/**
 * South African number conventions: space (U+00A0) as thousands separator, "." decimal (as used in the
 * NIWIS mockups), R prefix for rand, SI-style unit spacing (e.g. "482 mm", "1 250 Mm³").
 */
import { metric } from '@/config/metrics';

const NBSP = ' ';

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.length >= 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : int;
  const out = frac ? `${grouped}.${frac}` : grouped;
  // U+2212 minus sign reads better than a hyphen in tabular figures
  return neg && Number(fixed) !== 0 ? `−${out}` : out;
}

/** Compact large values: 8 400 000 → "8.4 M", 15 200 → "15 200". */
export function formatCompact(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  const a = Math.abs(value);
  if (a >= 1e9) return `${formatNumber(value / 1e9, decimals)}${NBSP}bn`;
  if (a >= 1e6) return `${formatNumber(value / 1e6, decimals)}${NBSP}M`;
  return formatNumber(value, 0);
}

const UNIT_NO_SPACE = new Set(['%', '°', '']);

export function withUnit(text: string, unit?: string): string {
  if (!unit) return text;
  if (unit === 'R' || unit.startsWith('R ') || unit === 'R million') {
    if (unit === 'R million') return `R${NBSP}${text}${NBSP}m`;
    return `R${NBSP}${text}`;
  }
  if (UNIT_NO_SPACE.has(unit)) return `${text}${unit}`;
  return `${text}${NBSP}${unit}`;
}

export function formatValue(value: number | null | undefined, unit?: string, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return withUnit(formatNumber(value, decimals), unit);
}

export function formatRand(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `R${NBSP}${formatNumber(value, decimals)}`;
}

export function formatPct(value: number | null | undefined, decimals = 0, signed = false): string {
  if (value == null || Number.isNaN(value)) return '—';
  const t = formatNumber(value, decimals);
  return `${signed && value > 0 ? '+' : ''}${t}%`;
}

export function formatSigned(value: number | null | undefined, decimals = 1, unit?: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  const t = formatNumber(value, decimals);
  return withUnit(`${value > 0 ? '+' : ''}${t}`, unit);
}

/** Format using the metric registry (unit + decimals). */
export function formatMetric(
  id: string,
  value: number | null | undefined,
  opts: { decimals?: number; unit?: boolean } = {},
): string {
  const md = metric(id);
  const d = opts.decimals ?? md.decimals;
  if (opts.unit === false) return formatNumber(value, d);
  return formatValue(value, md.unit, d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(d: Date | string | number, style: 'day' | 'month' | 'datetime' | 'short' = 'day'): string {
  const date = toSast(d);
  const day = date.getUTCDate();
  const mon = MONTHS[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  if (style === 'month') return `${mon} ${y}`;
  if (style === 'short') return `${String(day).padStart(2, '0')} ${mon}`;
  if (style === 'datetime') {
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${String(day).padStart(2, '0')} ${mon} ${y}, ${hh}:${mm}`;
  }
  return `${String(day).padStart(2, '0')} ${mon} ${y}`;
}

/** Shift a timestamp so that its UTC fields read as SAST (UTC+2, no DST). */
export function toSast(d: Date | string | number): Date {
  const t = typeof d === 'object' ? d.getTime() : new Date(d).getTime();
  return new Date(t + 2 * 3600_000);
}

export const MONTH_NAMES = MONTHS;
