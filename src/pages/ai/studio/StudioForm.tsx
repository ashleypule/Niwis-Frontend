import { useMemo } from 'react';
import { Link2, Play } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useReference } from '@/api/queries/core';
import { moduleById, type ModuleId } from '@/config/modules';
import type { ForecastModels, ForecastTarget, ForecastTargets } from '@/types/forecast';
import type { Level, StudioState } from './studioUrl';

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'national', label: 'South Africa' },
  { value: 'province', label: 'Province' },
  { value: 'district', label: 'District / metro' },
  { value: 'wma', label: 'Water management area' },
];
const REF: Record<Exclude<Level, 'national'>, string> = {
  province: 'provinces',
  district: 'municipalities',
  wma: 'wmas',
};
/** Models that use input variables; Auto / Compare all add SARIMAX and VAR to their candidates when inputs are chosen. */
const INPUT_CHOICES = new Set(['auto', 'compare']);

interface Props {
  models: ForecastModels;
  targets: ForecastTargets;
  state: StudioState;
  onChange: (s: StudioState) => void;
  onRun: () => void;
  onShare: () => void;
  busy: boolean;
  shared?: boolean;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-xl border border-line p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {n}. {title}
      </legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}

export function findTarget(targets: ForecastTargets, table?: string, column?: string): ForecastTarget | undefined {
  return targets.tables.find((t) => t.table === table)?.columns.find((c) => c.column === column);
}

export function StudioForm({ models, targets, state, onChange, onRun, onShare, busy, shared }: Props) {
  const set = (patch: Partial<StudioState>) => onChange({ ...state, ...patch });
  const modules = useMemo(
    () => [...new Set(targets.tables.flatMap((t) => t.modules))].sort((a, b) => a.localeCompare(b)),
    [targets],
  );
  const table = targets.tables.find((t) => t.table === state.table);
  const module = table?.modules[0] ?? modules[0];
  const tables = targets.tables.filter((t) => t.modules.includes(module));
  const target = findTarget(targets, state.table, state.column);
  const refType = state.level === 'national' ? undefined : REF[state.level];
  const areas = useReference(refType ?? 'provinces');
  const freq = state.resolution;
  const usable = models.models.filter((m) => m.resolutions.includes(freq));
  const model = models.models.find((m) => m.id === state.model);
  const takesInputs = freq === 'monthly' && (INPUT_CHOICES.has(state.model) || !!model?.supportsInputs);
  const maxH = freq === 'monthly' ? models.limits.monthlyHorizon[1] : models.limits.dailyHorizon[1];
  const inputOptions = targets.tables.flatMap((t) =>
    t.columns
      .filter((c) => !(t.table === state.table && c.column === state.column))
      .map((c) => ({ value: `${t.table}|${c.column}`, label: `${c.label} — ${t.label}` })),
  );
  const ready = !!state.table && !!state.column && (state.level === 'national' || !!state.area);
  const groups = models.groups.map((g) => ({ ...g, models: usable.filter((m) => m.group === g.id) }));

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-5">
      <Step n={1} title="Variable">
        <Select
          hideLabel={false}
          label="Module"
          value={module}
          onChange={(m) => {
            const first = targets.tables.find((t) => t.modules.includes(m ?? ''));
            set({ table: first?.table, column: undefined, inputs: [] });
          }}
          options={modules.map((m) => ({ value: m, label: moduleById(m as ModuleId)?.label ?? m }))}
        />
        <Select
          hideLabel={false}
          label="Table"
          value={state.table ?? tables[0]?.table}
          onChange={(t) => set({ table: t, column: undefined, inputs: [] })}
          options={tables.map((t) => ({ value: t.table, label: `${t.label}${t.spec ? ` (§${t.spec})` : ''}` }))}
        />
        <Select
          hideLabel={false}
          label="Column"
          value={state.column}
          placeholder="Choose a column"
          onChange={(c) => {
            const t = findTarget(targets, state.table ?? tables[0]?.table, c);
            set({
              table: state.table ?? tables[0]?.table,
              column: c,
              resolution: t?.resolutions.includes(state.resolution) ? state.resolution : 'monthly',
            });
          }}
          options={(table ?? tables[0])?.columns.map((c) => ({ value: c.column, label: c.label })) ?? []}
        />
        {target && (
          <p className="text-[12px] leading-snug text-ink-2" data-testid="target-info">
            {target.resolution === 'daily'
              ? `Daily column; monthly values are ${target.aggregate === 'sum' ? 'totals' : 'means'} of the days`
              : 'Monthly column'}
            {target.monthlyUnit ? ` (${target.monthlyUnit})` : ''}. History {target.firstDate?.slice(0, 7)} –{' '}
            {target.lastDate?.slice(0, 7)} ({target.historyMonths ?? '?'} months).
            {!target.enoughHistory && (
              <span className="block text-bad">Less than 36 months of history: it cannot be forecast.</span>
            )}
          </p>
        )}
      </Step>

      <Step n={2} title="Area">
        <Select
          hideLabel={false}
          label="Level"
          value={state.level}
          onChange={(l) => set({ level: (l as Level) ?? 'national', area: undefined })}
          options={LEVEL_OPTIONS}
        />
        {state.level !== 'national' && (
          <Select
            hideLabel={false}
            label={LEVEL_OPTIONS.find((o) => o.value === state.level)!.label}
            value={state.area}
            placeholder="Choose"
            onChange={(a) => set({ area: a })}
            options={(areas.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
        )}
        <p className="text-[12px] text-muted">
          District values are combined as on the dashboard: area-weighted, or summed for volumes and flows.
        </p>
      </Step>

      <Step n={3} title="Model">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Model</span>
          <select
            className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink hover:border-line-strong focus:border-primary"
            value={state.model}
            onChange={(e) => set({ model: e.target.value })}
          >
            {models.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            {groups
              .filter((g) => g.models.length)
              .map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {g.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>
        <p className="text-[12px] leading-snug text-ink-2">
          {model?.description ?? models.choices.find((c) => c.id === state.model)?.description}
          {model?.experimental && (
            <span className="mt-1 block font-medium text-warn">
              Experimental: with a few hundred monthly values deep models rarely beat the statistical ones; the
              comparison table shows how this one did.
            </span>
          )}
        </p>
      </Step>

      <Step n={4} title="Horizon">
        {target?.resolutions.includes('daily') && (
          <Select
            hideLabel={false}
            label="Resolution"
            value={freq}
            onChange={(r) => {
              const res = r === 'daily' ? 'daily' : 'monthly';
              const ok = models.models.find((m) => m.id === state.model)?.resolutions.includes(res);
              set({
                resolution: res,
                horizon: Math.min(state.horizon, res === 'daily' ? 30 : 24),
                model: ok || INPUT_CHOICES.has(state.model) ? state.model : 'auto',
                inputs: res === 'daily' ? [] : state.inputs,
              });
            }}
            options={[
              { value: 'monthly', label: 'Monthly (1–24 months)' },
              { value: 'daily', label: 'Daily (1–30 days)' },
            ]}
          />
        )}
        <Select
          hideLabel={false}
          label="Forecast"
          value={String(Math.min(state.horizon, maxH))}
          onChange={(h) => set({ horizon: Number(h ?? 12) })}
          options={Array.from({ length: maxH }, (_, i) => i + 1).map((h) => ({
            value: String(h),
            label: `${h} ${freq === 'monthly' ? 'month' : 'day'}${h > 1 ? 's' : ''} ahead`,
          }))}
        />
      </Step>

      <Step n={5} title="Inputs and run">
        {takesInputs ? (
          <>
            {[0, 1, 2].slice(0, Math.min(models.limits.maxInputs, state.inputs.length + 1)).map((i) => (
              <Select
                key={i}
                hideLabel={false}
                label={`Input variable ${i + 1}`}
                value={state.inputs[i]}
                placeholder="None"
                onChange={(v) => {
                  const next = [...state.inputs];
                  if (v) next[i] = v;
                  else next.splice(i, 1);
                  set({ inputs: [...new Set(next.filter(Boolean))] });
                }}
                options={inputOptions}
              />
            ))}
            <p className="text-[12px] text-muted">
              Inputs need future values: they are forecast with their own best statistical model, never held at their
              last value.
            </p>
          </>
        ) : (
          <p className="text-[12px] text-muted">
            {freq === 'daily' ? 'Daily forecasts use the target only.' : 'This model uses the target only.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onRun} disabled={!ready || busy || (target && !target.enoughHistory)}>
            <Play className="h-4 w-4" /> {busy ? 'Running…' : 'Run'}
          </Button>
          <Button variant="outline" onClick={onShare} disabled={!ready}>
            <Link2 className="h-4 w-4" /> {shared ? 'Link copied' : 'Copy link'}
          </Button>
        </div>
      </Step>
    </div>
  );
}
