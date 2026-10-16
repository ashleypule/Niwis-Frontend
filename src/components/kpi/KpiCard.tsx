import clsx from 'clsx';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { metric, type GoodDirection } from '@/config/metrics';
import { metricIcon } from '@/config/icons';
import { formatNumber, withUnit } from '@/lib/format';
import type { Kpi } from '@/types/api';
import { Pill } from '@/components/ui/Pill';
import { SampleChip, StaleChip } from '@/components/provenance/Markers';
import { monthYear, type PanelProvenance } from '@/components/provenance/provenance';
import { APP } from '@/config/app';

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

/** SPI / SPEI / anomaly KPIs refer to the latest complete month: show it if the backend's sub-label doesn't. */
export function kpiSublabel(kpi: Kpi): string | undefined {
  const monthly = !!kpi.asOf && /-01$/.test(kpi.asOf) && /spi|spei|anomaly/i.test(kpi.metric);
  if (!monthly) return kpi.sublabel;
  const month = monthYear(kpi.asOf);
  if (kpi.sublabel?.includes(month)) return kpi.sublabel;
  return kpi.sublabel ? `${kpi.sublabel} · ${month}` : month;
}

/**
 * The backend labels the runoff anomaly KPI "Mean Annual Runoff" although its value is a % anomaly (BACKEND_ISSUES #9):
 * name what is shown, with the comparison period from its sub-label.
 */
export function kpiLabel(kpi: Kpi): string {
  if (kpi.metric === 'runoffAnomaly' && /mean annual runoff/i.test(kpi.label) && kpi.unit === '%') {
    const period = /\d{4}\s*[–-]\s*\d{4}/.exec(kpi.sublabel ?? '')?.[0] ?? '2000–2025';
    return `Runoff anomaly (vs ${period})`;
  }
  return kpi.label;
}

export function KpiCard({
  kpi,
  compact = false,
  provenance,
  marker = false,
}: {
  kpi: Kpi;
  compact?: boolean;
  /** strip provenance: Sample cards are hatched and say so */
  provenance?: PanelProvenance;
  /** show a Live chip on the card itself (strips that mix live and sample KPIs) */
  marker?: boolean;
}) {
  const sample = provenance?.kind === 'sample';
  const sublabel = kpiSublabel(kpi);
  const label = kpiLabel(kpi);
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
      className={clsx(
        'anim-in flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface px-3 pb-2 pt-3 shadow-card',
        sample && 'prov-sample',
      )}
      data-provenance={provenance?.kind}
      aria-label={`${label}: ${missing ? `not available${kpi.unavailableReason ? ` (${kpi.unavailableReason})` : ''}` : (kpi.text ?? withUnit(valueText, unit))}`}
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
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight text-ink" title={label}>
            {label}
          </h3>
          {sublabel && (
            // two lines: the drought class sub-value ("85 % of area in D1–D4 · …") must stay readable
            <p className="line-clamp-2 text-[11px] leading-tight text-muted" title={sublabel}>
              {sublabel}
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
        ) : kpi.status && !kpi.text && kpi.value == null ? (
          <Pill scale={kpi.status.scale} value={kpi.status.id} label={kpi.status.label} className="text-sm" />
        ) : kpi.status && !kpi.text ? (
          // an index with its class: the number, and the class it falls in
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="num whitespace-nowrap font-bold leading-none tracking-tight text-ink">
              <span className={compact ? 'text-xl' : 'text-[26px]'}>{valueText}</span>
              {unit && <span className="ml-1 text-sm font-semibold text-ink-2">{unit}</span>}
            </p>
            <Pill scale={kpi.status.scale} value={kpi.status.id} label={kpi.status.label} size="sm" />
          </div>
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
      {(sample || kpi.isStale || (marker && provenance?.kind === 'live')) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {sample && <SampleChip detail={provenance?.detail} />}
          {marker && provenance?.kind === 'live' && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-live-soft px-2 py-px text-[11px] font-semibold text-live"
              data-marker="live"
              title={kpi.source?.length ? `Source tables: ${kpi.source.join(', ')}` : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {APP.liveLabel}
              {kpi.asOf && <span className="font-medium"> · {monthYear(kpi.asOf)}</span>}
            </span>
          )}
          {kpi.isStale && <StaleChip asOf={kpi.asOf} />}
        </div>
      )}
      {kpi.spark && kpi.spark.length > 1 && (
        <div className="-mx-1 mt-auto pt-1">
          <Sparkline data={kpi.spark} tone={sparkTone} />
        </div>
      )}
    </article>
  );
}
