import clsx from 'clsx';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { metric, type GoodDirection } from '@/config/metrics';
import { metricIcon } from '@/config/icons';
import { formatNumber, withUnit } from '@/lib/format';
import type { Kpi } from '@/types/api';
import { Pill } from '@/components/ui/Pill';

/** Semantic delta tone: depends on the metric's goodDirection, not on the sign. */
export function deltaTone(delta: number | null | undefined, good: GoodDirection): 'good' | 'bad' | 'neutral' {
  if (delta == null || delta === 0 || good === 'neutral') return 'neutral';
  return delta > 0 === (good === 'up') ? 'good' : 'bad';
}

export function Sparkline({
  data,
  tone,
  height = 26,
}: {
  data: number[];
  tone: 'good' | 'bad' | 'neutral';
  height?: number;
}) {
  if (data.length < 2) return null;
  const w = 120;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 2 - ((v - min) / span) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const color = tone === 'good' ? 'var(--c-good)' : tone === 'bad' ? 'var(--c-bad)' : 'var(--c-primary)';
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-[26px] w-full" aria-hidden="true">
      <path d={`${d}L${w},${height}L0,${height}Z`} fill={color} opacity="0.1" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KpiCard({ kpi, compact = false }: { kpi: Kpi; compact?: boolean }) {
  const md = metric(kpi.metric);
  const good = kpi.goodDirection ?? md.goodDirection;
  const { icon: Icon, tint } = metricIcon(kpi.metric);
  const tone = deltaTone(kpi.delta, good);
  const decimals = kpi.decimals ?? md.decimals;
  const unit = kpi.unit ?? md.unit;
  const deltaUnit = kpi.deltaUnit ?? (unit === '%' || unit === '% FSC' ? ' pp' : unit ? ` ${unit}` : '');
  const Arrow = kpi.delta == null || kpi.delta === 0 ? ArrowRight : kpi.delta > 0 ? ArrowUpRight : ArrowDownRight;
  const valueText = kpi.text ?? formatNumber(kpi.value, decimals);
  // value null + reason: "—" with the reason as tooltip (docs/backend/CONTRACT_CHANGES.md §3)
  const missing = kpi.value == null && !kpi.text && !kpi.status;
  const sparkTone = good === 'neutral' ? 'neutral' : tone;

  return (
    <article
      className="anim-in flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface px-3 pb-2 pt-3 shadow-card"
      aria-label={`${kpi.label}: ${missing ? `not available${kpi.unavailableReason ? ` (${kpi.unavailableReason})` : ''}` : (kpi.text ?? withUnit(valueText, unit))}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: tint.bg, color: tint.fg }}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight text-ink" title={kpi.label}>
            {kpi.label}
          </h3>
          {kpi.sublabel && (
            <p className="truncate text-[11px] leading-tight text-muted" title={kpi.sublabel}>
              {kpi.sublabel}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        {missing ? (
          <p
            className="num cursor-help font-bold leading-none text-muted"
            title={kpi.unavailableReason ?? 'Not available'}
            data-testid="kpi-missing"
          >
            <span className={compact ? 'text-xl' : 'text-[26px]'}>—</span>
          </p>
        ) : kpi.status && !kpi.text ? (
          <Pill scale={kpi.status.scale} value={kpi.status.id} label={kpi.status.label} className="text-sm" />
        ) : (
          <p className="num min-w-0 whitespace-nowrap font-bold leading-none tracking-tight text-ink">
            <span className={compact ? 'text-xl' : 'text-[26px]'}>{valueText}</span>
            {unit && !kpi.text && (
              <span className="ml-1 text-sm font-semibold text-ink-2">
                {unit === 'people' || unit === 'records' ? '' : unit}
              </span>
            )}
          </p>
        )}
        {kpi.delta != null && (
          <span
            className={clsx(
              'num flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold',
              tone === 'good' && 'text-good',
              tone === 'bad' && 'text-bad',
              tone === 'neutral' && 'text-muted',
            )}
            title={tone === 'good' ? 'Improving' : tone === 'bad' ? 'Worsening' : 'Change'}
          >
            <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
            {kpi.delta > 0 ? '+' : ''}
            {formatNumber(kpi.delta, Number.isInteger(kpi.delta) ? 0 : Math.min(2, Math.max(decimals, 1)))}
            {deltaUnit}
            <span className="sr-only">{tone === 'good' ? ' (improving)' : tone === 'bad' ? ' (worsening)' : ''}</span>
          </span>
        )}
      </div>
      {kpi.status && kpi.text && (
        <div className="mt-1">
          <Pill scale={kpi.status.scale} value={kpi.status.id} label={kpi.status.label} size="sm" />
        </div>
      )}
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate" title={missing ? kpi.unavailableReason : undefined}>
          {missing ? (kpi.unavailableReason ?? 'Not available') : kpi.deltaLabel}
        </span>
      </div>
      {kpi.spark && kpi.spark.length > 1 && (
        <div className="-mx-1 mt-auto pt-1">
          <Sparkline data={kpi.spark} tone={sparkTone} />
        </div>
      )}
    </article>
  );
}
