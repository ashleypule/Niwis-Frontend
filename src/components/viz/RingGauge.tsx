import { formatNumber } from '@/lib/format';

/** Small ring (data-quality style). Colour follows the value band; the % is always printed. */
export function RingGauge({
  value,
  label,
  size = 76,
  sub,
}: {
  value: number;
  label: string;
  size?: number;
  sub?: string;
}) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 90 ? '#2E9E5B' : value >= 75 ? '#8BC34A' : value >= 60 ? '#F2A900' : '#E95F35';
  return (
    <figure className="flex flex-col items-center gap-1 text-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${formatNumber(value, 0)}%`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface-3)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="num"
          fontSize={size / 4.6}
          fontWeight="700"
          fill="var(--c-text)"
        >
          {formatNumber(value, 0)}%
        </text>
      </svg>
      <figcaption className="text-[12px] font-semibold leading-tight text-ink">
        {label}
        {sub && <span className="block text-[11px] font-normal text-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}
