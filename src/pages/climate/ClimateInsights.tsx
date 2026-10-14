import { useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { queryStatus } from '@/components/feedback/PanelBoundary';
import { SeverityIcon } from '@/components/ui/Pill';
import { combineProvenance, panelProvenance } from '@/components/provenance/provenance';

type Sev = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/**
 * Trend & alert insights generated from the climate signal chain and provincial indicators (no hard-coded claims).
 * Reads the mock shape and the backend's (signal / change / severity; province / rain / trend).
 */
export function ClimateInsights() {
  const q = useTable('climate', 'signal-chain');
  const p = useTable('climate', 'provinces');
  const prov = combineProvenance(panelProvenance(q, 'climate'), panelProvenance(p, 'climate'));
  const status = queryStatus(q, 200) ?? queryStatus(p, 200);
  if (status || !q.data || !p.data)
    return (
      <Card title="Trend & Alert Insights" provenance={prov}>
        {status}
      </Card>
    );
  const num = (v: unknown) => (v == null || v === '' ? NaN : Number(v));
  const rows = p.data.rows.filter((r) => Number.isFinite(num(r.trend)));
  const warmest = [...rows].sort((a, b) => num(b.trend) - num(a.trend))[0];
  const rainOf = (r: (typeof rows)[number]) => num(r.r ?? r.rain);
  const driest = [...p.data.rows].filter((r) => Number.isFinite(rainOf(r))).sort((a, b) => rainOf(a) - rainOf(b))[0];
  const nameOf = (r: (typeof rows)[number]) => String(r.name ?? r.province);
  // severity is null with the backend (no agreed thresholds): those insights are informational
  const toSev = (c: unknown): Sev =>
    c == null ? 'info' : c === 'Very High' ? 'critical' : c === 'High' ? 'high' : c === 'Moderate' ? 'moderate' : 'low';
  const baseline = p.data.baseline ? p.data.baseline.replace(/ monthly mean$/, '') : '1981–2010';
  const items: { sev: Sev; text: string }[] = [
    ...q.data.rows.map((r) => ({
      sev: toSev(r.cls ?? r.severity),
      text: `${String(r.stage ?? r.signal)}: ${String(r.value ?? r.change ?? '—')}`,
    })),
    ...(warmest
      ? [
          {
            sev: 'high' as Sev,
            text: `Fastest warming: ${nameOf(warmest)} (${num(warmest.trend).toFixed(2)} °C/decade)`,
          },
        ]
      : []),
    ...(driest
      ? [
          {
            sev: (rainOf(driest) < 0 ? 'moderate' : 'info') as Sev,
            text:
              rainOf(driest) < 0
                ? `Largest rainfall decline: ${nameOf(driest)} (${rainOf(driest).toFixed(0)}% vs ${baseline})`
                : `Smallest rainfall change: ${nameOf(driest)} (+${rainOf(driest).toFixed(0)}% vs ${baseline})`,
          },
        ]
      : []),
  ];
  return (
    <Card title="Trend & Alert Insights" provenance={prov}>
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
