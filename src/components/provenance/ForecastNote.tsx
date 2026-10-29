import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';
import type { ForecastInfo } from '@/types/api';
import { formatNumber } from '@/lib/format';

const NO_SKILL = 'This model does not beat the long-term average for this variable.';

const month = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-ZA', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Info-tooltip text for a forecast panel: always the disclaimer, then the model and its skill. */
export function forecastInfoText(f: ForecastInfo, info?: string): string {
  const skill = f.skill == null ? 'n/a' : formatNumber(f.skill, 2);
  return [
    info,
    f.disclaimer,
    `${f.label}: ${f.modelLabel}. Backtest skill against climatology ${skill}${f.mase != null ? `, MASE ${formatNumber(f.mase, 2)}` : ''}; data to ${month(f.dataAsOf)}.`,
    f.why,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The line under a forecast panel: model, skill and data date; the no-skill sentence when the model has none. */
export function ForecastNote({ f }: { f: ForecastInfo }) {
  const noSkill = f.beatsClimatology === false;
  return (
    <div className="space-y-1 text-[11.5px] text-muted" data-testid="forecast-note">
      <p>
        <span className="font-semibold text-ink-2">{f.label}</span> · {f.modelLabel} · skill vs climatology{' '}
        {f.skill == null ? 'n/a' : formatNumber(f.skill, 2)} · data to {month(f.dataAsOf)}
        {f.studio && (
          <>
            {' · '}
            <Link to={f.studio} className="text-primary underline-offset-2 hover:underline">
              Open in Forecasting Studio
            </Link>
          </>
        )}
      </p>
      {noSkill && (
        <p className="flex items-start gap-1 text-ink-2">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
          {f.skillNote ?? NO_SKILL}
        </p>
      )}
    </div>
  );
}
