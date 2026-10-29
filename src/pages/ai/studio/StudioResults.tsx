import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowUp, Download, Info } from 'lucide-react';
import { ChartCard } from '@/components/charts/ChartCard';
import { seriesOption } from '@/components/charts/options';
import { useChartTheme } from '@/components/charts/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { download, safeName, toCsv, type Row } from '@/lib/exporter';
import { formatNumber } from '@/lib/format';
import { SCALES } from '@/config/palettes';
import type { SeriesSet } from '@/types/api';
import type { ComparisonRow, RunResult, RunStatus } from '@/types/forecast';

const ORIGIN_COLORS = ['#8E44AD', '#00838F', '#C74300', '#6D4C41'];
const NO_SKILL = 'This model does not beat the long-term average for this variable.';

const num = (v: unknown) => (typeof v === 'number' ? v : null);
const fmt = (v: number | null | undefined, d = 2) => (v == null ? '—' : formatNumber(v, d));
const month = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-ZA', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** The run as a SeriesSet, drawn by the dashboard's own chart renderer (band, divider at the last observation). */
export function resultSeries(r: RunResult): SeriesSet {
  const last = [...r.history].reverse().find((p) => p[1] != null);
  const join = last ? [[last[0], last[1], last[1]]] : [];
  return {
    id: 'studio',
    title: `${r.target.label} — ${r.scope.name}`,
    xType: 'time',
    axes: [{ unit: r.target.unit ?? '', label: r.target.label }],
    asOf: r.asOf,
    series: [
      {
        key: 'band',
        name: 'Uncertainty (10th–90th pct)',
        kind: 'band',
        color: '#90CAF9',
        data: [...join, ...r.forecast.map((p) => [p[0], p[2], p[3]])],
      },
      { key: 'obs', name: 'Observed', kind: 'line', color: '#13233A', data: r.history.map((p) => [p[0], p[1]]) },
      ...r.backtest.map((o, i) => ({
        key: `bt${i}`,
        name: `Backtest from ${month(o.origin)}`,
        kind: 'line' as const,
        dash: true,
        color: ORIGIN_COLORS[i % ORIGIN_COLORS.length],
        data: o.data.map((p) => [p[0], p[2]]),
      })),
      {
        key: 'median',
        name: 'Forecast (median)',
        kind: 'line',
        color: '#1565C0',
        symbol: true,
        data: [...(last ? [[last[0], last[1]]] : []), ...r.forecast.map((p) => [p[0], p[1]])],
      },
    ],
  };
}

export function forecastRows(r: RunResult): Row[] {
  return r.forecast.map((p) => ({
    date: String(p[0]),
    median: num(p[1]),
    p10: num(p[2]),
    p90: num(p[3]),
    unit: r.target.unit ?? '',
    model: r.model.label,
  }));
}

export function metricRows(r: RunResult): Row[] {
  return r.comparison.map((c) => ({
    model: c.label,
    winner: c.winner ? 'yes' : '',
    mae: c.mae ?? null,
    rmse: c.rmse ?? null,
    mase: c.mase ?? null,
    skill_vs_climatology: c.skill ?? null,
    coverage_pct: c.coverage ?? null,
    error: c.error ?? '',
  }));
}

/** One CSV: the forecast, then the backtest metrics of every model, with the disclaimer. */
export function resultCsv(r: RunResult): string {
  return [
    `# ${r.target.label} (${r.target.unit ?? ''}), ${r.scope.name}; ${r.model.label}; data to ${r.asOf}`,
    `# ${r.disclaimer}`,
    toCsv(forecastRows(r)),
    '',
    '# Backtest (rolling origin) metrics',
    toCsv(metricRows(r)),
  ].join('\n');
}

type SortKey = 'label' | 'mae' | 'rmse' | 'mase' | 'skill' | 'coverage';

function ComparisonTable({ rows, signedKey }: { rows: ComparisonRow[]; signedKey: 'smape' | 'mape' }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'mase', asc: true });
  const sorted = useMemo(() => {
    const v = (r: ComparisonRow) => (sort.key === 'label' ? r.label : (r[sort.key] ?? null));
    return [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
      return sort.asc ? c : -c;
    });
  }, [rows, sort]);
  const head = (key: SortKey, label: string) => (
    <th
      scope="col"
      className="px-2 py-1.5 text-right font-semibold first:text-left"
      aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-0.5 hover:text-primary"
        onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key === 'label' || key !== 'skill' }))}
      >
        {label}
        {sort.key === key && (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]" data-testid="comparison-table">
        <thead className="bg-surface-2 text-ink-2">
          <tr>
            {head('label', 'Model')}
            {head('mase', 'MASE')}
            {head('skill', 'Skill vs climatology')}
            {head('mae', 'MAE')}
            {head('rmse', 'RMSE')}
            <th scope="col" className="px-2 py-1.5 text-right font-semibold">
              {signedKey === 'smape' ? 'sMAPE %' : 'MAPE %'}
            </th>
            {head('coverage', 'Band coverage %')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.model}
              className={clsx('border-t border-line', r.winner && 'bg-primary/10 font-semibold')}
              data-winner={r.winner || undefined}
            >
              <td className="px-2 py-1 text-left">
                {r.label}
                {r.winner && <span className="ml-1 rounded bg-primary px-1 text-[10px] text-white">chosen</span>}
                {r.baseline && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted">baseline</span>}
                {r.experimental && (
                  <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] text-ink">experimental</span>
                )}
                {r.error && <span className="block text-[11px] font-normal text-bad">Failed: {r.error}</span>}
              </td>
              <td className="num px-2 py-1 text-right">{fmt(r.mase)}</td>
              <td className={clsx('num px-2 py-1 text-right', (r.skill ?? 0) <= 0 && r.skill != null && 'text-bad')}>
                {fmt(r.skill)}
              </td>
              <td className="num px-2 py-1 text-right">{fmt(r.mae, 3)}</td>
              <td className="num px-2 py-1 text-right">{fmt(r.rmse, 3)}</td>
              <td className="num px-2 py-1 text-right">{fmt(r[signedKey], 1)}</td>
              <td className="num px-2 py-1 text-right">{fmt(r.coverage, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassTable({ r }: { r: RunResult }) {
  const cls = r.classes ?? [];
  const keys = ['None', 'D0', 'D1', 'D2', 'D3', 'D4'];
  const color = (k: string) => SCALES.drought.bins.find((b) => b.id === k)?.color ?? '#999';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]" data-testid="class-table">
        <thead className="bg-surface-2 text-ink-2">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left">
              Month
            </th>
            <th scope="col" className="px-2 py-1.5 text-left">
              Class of the median
            </th>
            {keys.map((k) => (
              <th key={k} scope="col" className="px-2 py-1.5 text-right">
                <span
                  className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                  style={{ background: color(k) }}
                />
                {k === 'None' ? 'No drought' : k}
              </th>
            ))}
            <th scope="col" className="px-2 py-1.5 text-right">
              P(D1–D4)
            </th>
          </tr>
        </thead>
        <tbody>
          {cls.map((c) => (
            <tr key={c.date} className="border-t border-line">
              <td className="px-2 py-1">{month(c.date)}</td>
              <td className="px-2 py-1 font-semibold">{c.class === 'None' ? 'No drought' : c.class}</td>
              {keys.map((k) => (
                <td key={k} className="num px-2 py-1 text-right">
                  {fmt(c.probabilities[k], 0)} %
                </td>
              ))}
              <td className="num px-2 py-1 text-right font-semibold">{fmt(c.pDrought, 0)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudioProgress({ run }: { run: RunStatus }) {
  const pct = Math.round(run.progress * 100);
  return (
    <Card title="Forecast running">
      <div role="status" aria-live="polite" className="space-y-2" data-testid="run-progress">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
        <p className="text-sm text-ink-2">
          {run.status === 'queued'
            ? `Queued${run.queuePosition ? ` (position ${run.queuePosition})` : ''}: models train a few at a time.`
            : `${pct} % — ${run.message}`}
        </p>
      </div>
    </Card>
  );
}

export function StudioResults({ result: r }: { result: RunResult }) {
  const t = useChartTheme();
  const set = useMemo(() => resultSeries(r), [r]);
  const option = useMemo(() => seriesOption(set, t), [set, t]);
  const rows = useMemo(() => forecastRows(r), [r]);
  const m = r.metrics;
  const noSkill = m.skill != null && m.skill <= 0;
  const signedKey: 'smape' | 'mape' = m.smape != null ? 'smape' : 'mape';
  const info = `${r.disclaimer} Model: ${r.model.label}. Backtest skill against climatology ${fmt(m.skill)}; data to ${month(r.asOf)}.`;
  return (
    <div className="space-y-3" data-testid="studio-results">
      <ChartCard
        title={`${r.target.label} forecast — ${r.scope.name}`}
        context={`${r.label}: ${r.model.label}. ${r.model.why}`}
        info={info}
        height={360}
        option={option}
        rows={rows}
        footer={
          <p className="text-[12px] text-muted">
            {r.disclaimer} Observed values to {month(r.asOf)}; dashed lines are the backtest forecasts made from each
            origin with only the data before it. Sources: {r.sources.join(', ')}.
          </p>
        }
      />
      {noSkill && (
        <p
          className="flex items-start gap-2 rounded-lg border border-warn bg-warn-soft p-3 text-sm text-ink"
          role="note"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {NO_SKILL} Its backtest skill against
          the same-month average is {fmt(m.skill)}.
        </p>
      )}
      <div className="grid gap-3 xl:grid-cols-[1fr_2fr]">
        <Card title="Accuracy of the chosen model" context="Rolling-origin backtest on held-back recent data">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" data-testid="metrics">
            {(
              [
                ['MAE', fmt(m.mae, 3), 'Mean absolute error'],
                ['RMSE', fmt(m.rmse, 3), 'Root mean squared error'],
                ['MASE', fmt(m.mase), r.metricNotes?.mase ?? ''],
                ['Skill vs climatology', fmt(m.skill), r.metricNotes?.skill ?? ''],
                [
                  signedKey === 'smape' ? 'sMAPE' : 'MAPE',
                  `${fmt(m[signedKey], 1)} %`,
                  r.metricNotes?.[signedKey] ?? '',
                ],
                ['Interval coverage', `${fmt(m.coverage, 0)} %`, r.metricNotes?.coverage ?? ''],
              ] as const
            ).map(([k, v, note]) => (
              <div key={k} title={note}>
                <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
                <dd className="num text-lg font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] text-muted">
            Backtest origins: {r.backtestOrigins.map(month).join(', ')}. Interval: {r.model.interval}.
            {r.runtimeSeconds != null && ` Run time ${fmt(r.runtimeSeconds, 0)} s.`}
          </p>
        </Card>
        <Card
          title="Model comparison"
          context="Same backtest for every model; the baselines always run. Click a column to sort."
        >
          <ComparisonTable rows={r.comparison} signedKey={signedKey} />
        </Card>
      </div>
      {r.classes && r.classes.length > 0 && (
        <Card
          title="Drought class probabilities"
          context="From the forecast median and its 10–90 % band (spec §3.4 classes)"
        >
          <ClassTable r={r} />
        </Card>
      )}
      {r.warnings.length > 0 && (
        <Card title="Notes on this forecast">
          <ul className="space-y-1.5 text-sm text-ink-2" data-testid="warnings">
            {r.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => download(`${safeName(`${r.target.label} ${r.scope.name} forecast`)}.csv`, resultCsv(r))}
        >
          <Download className="h-4 w-4" /> Download CSV (forecast and metrics)
        </Button>
        <span className="self-center text-[12px] text-muted">PNG: the chart's menu (⋮ → Download PNG).</span>
      </div>
    </div>
  );
}
