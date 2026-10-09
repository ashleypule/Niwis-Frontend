import { useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import { SeverityIcon } from '@/components/ui/Pill';

type Sev = 'critical' | 'high' | 'moderate' | 'low';

/** Trend & alert insights generated from the climate signal chain and provincial indicators (no hard-coded claims). */
export function ClimateInsights() {
  const q = useTable('climate', 'signal-chain');
  const p = useTable('climate', 'provinces');
  if (!q.data || !p.data)
    return (
      <Card title="Trend & Alert Insights">
        <Skeleton height={200} />
      </Card>
    );
  const warmest = [...p.data.rows].sort((a, b) => Number(b.trend) - Number(a.trend))[0];
  const driest = [...p.data.rows].sort((a, b) => Number(a.r) - Number(b.r))[0];
  const toSev = (c: unknown): Sev =>
    c === 'Very High' ? 'critical' : c === 'High' ? 'high' : c === 'Moderate' ? 'moderate' : 'low';
  const items: { sev: Sev; text: string }[] = [
    ...q.data.rows.map((r) => ({ sev: toSev(r.cls), text: `${String(r.stage)}: ${String(r.value)}` })),
    { sev: 'high', text: `Fastest warming: ${String(warmest.name)} (${Number(warmest.trend).toFixed(2)} °C/decade)` },
    {
      sev: 'moderate',
      text: `Largest rainfall decline: ${String(driest.name)} (${Number(driest.r).toFixed(0)}% vs 1981–2010)`,
    },
  ];
  return (
    <Card title="Trend & Alert Insights">
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.text} className="flex items-start gap-2 text-[13px] text-ink-2">
            <SeverityIcon severity={it.sev} />
            {it.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
