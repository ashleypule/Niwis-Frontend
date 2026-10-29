import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BrainCircuit, Cpu, Database, LineChart, ShieldCheck } from 'lucide-react';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Card } from '@/components/ui/Card';
import { Row } from '@/components/layout/Grid';
import { FlowDiagram } from '@/components/viz/FlowDiagram';
import { ErrorState, Skeleton } from '@/components/feedback/PanelBoundary';
import { isLive } from '@/config/app';
import { useForecastModels, useForecastTargets, useRun, useStartRun } from '@/api/queries/forecast';
import type { ApiError } from '@/api/client';
import { StudioForm } from './studio/StudioForm';
import { StudioProgress, StudioResults } from './studio/StudioResults';
import { DEFAULT_STATE, paramsFromState, requestOf, stateFromParams, type StudioState } from './studio/studioUrl';

const FRAMEWORK = [
  {
    title: 'Input data',
    color: '#1565C0',
    icon: Database,
    items: [
      { title: 'Database catalogue', lines: ['Any live numeric column, with its label and unit'] },
      { title: 'Area', lines: ['South Africa, a province, a district or a WMA'] },
    ],
  },
  {
    title: 'Series',
    color: '#00838F',
    icon: Cpu,
    items: [
      { title: 'Monthly values', lines: ['Amounts summed, states averaged'] },
      { title: 'Dashboard weighting', lines: ['Area-weighted, or summed for volumes'] },
      { title: 'Gap filling', lines: ['Inside each training window only'] },
    ],
  },
  {
    title: 'Models',
    color: '#7B1FA2',
    icon: BrainCircuit,
    items: [
      { title: 'Baselines', lines: ['Naive, seasonal naive, climatology'] },
      { title: 'Statistical / ML', lines: ['ETS, SARIMA(X), Prophet, RF, LightGBM, VAR'] },
      { title: 'Deep (experimental)', lines: ['LSTM, Transformer'] },
    ],
  },
  {
    title: 'Validation',
    color: '#C74300',
    icon: ShieldCheck,
    items: [
      { title: 'Rolling-origin backtest', lines: ['Never sees data after its origin'] },
      { title: 'Scores', lines: ['MAE, RMSE, MASE, skill vs climatology, coverage'] },
    ],
  },
  {
    title: 'Outputs',
    color: '#2E7D32',
    icon: LineChart,
    items: [
      { title: 'Forecast', lines: ['Median with a 10–90 % band'] },
      { title: 'Page forecast tabs', lines: ['Recomputed when new data arrive'] },
    ],
  },
];

function useStudio() {
  const [sp, setSp] = useSearchParams();
  const [state, setState] = useState<StudioState>(() => ({ ...DEFAULT_STATE, ...stateFromParams(sp) }));
  const [runId, setRunId] = useState<string>();
  const [shared, setShared] = useState(false);
  const start = useStartRun();
  const run = useRun(runId);
  const autoRan = useRef(false);

  const go = (s: StudioState = state) => {
    const req = requestOf(s);
    if (!req) return;
    setSp(paramsFromState(s, sp, true), { replace: true });
    start.mutate(req, { onSuccess: (a) => setRunId(a.runId) });
  };
  // a shared link (run=1) re-runs on open: the server answers from its cache when nothing changed
  useEffect(() => {
    if (!autoRan.current && sp.get('run') === '1' && requestOf(state)) {
      autoRan.current = true;
      go(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = (s: StudioState) => {
    setState(s);
    setShared(false);
    setSp(paramsFromState(s, sp, false), { replace: true });
  };
  const share = () => {
    const url = new URL(window.location.href);
    url.search = paramsFromState(state, sp, true).toString();
    void navigator.clipboard?.writeText(url.toString()).then(() => setShared(true));
  };
  return { state, change, go, share, shared, start, run };
}

function Studio() {
  const models = useForecastModels();
  const targets = useForecastTargets();
  const { state, change, go, share, shared, start, run } = useStudio();
  const status = run.data;
  const busy = start.isPending || status?.status === 'queued' || status?.status === 'running';
  const startError = start.error as ApiError | null;
  const failed = status?.status === 'failed' ? status.error : undefined;
  const shown = useMemo(() => {
    // first visit: preselect SPI-3 when it exists, so Run works in one click
    if (state.table || !targets.data) return state;
    const t = targets.data.tables.find((x) => x.columns.some((c) => c.column.startsWith('SPI_3')));
    const c = t?.columns.find((x) => x.column.startsWith('SPI_3'));
    return t && c ? { ...state, table: t.table, column: c.column } : state;
  }, [state, targets.data]);

  if (models.isError || targets.isError)
    return (
      <ErrorState
        error={models.error ?? targets.error}
        onRetry={() => {
          void models.refetch();
          void targets.refetch();
        }}
      />
    );
  if (!models.data || !targets.data) return <Skeleton height={220} />;
  return (
    <div className="space-y-3">
      <StudioForm
        models={models.data}
        targets={targets.data}
        state={shown}
        onChange={change}
        onRun={() => go(shown)}
        onShare={share}
        busy={busy}
        shared={shared}
      />
      <p className="text-[12px] text-muted">
        {models.data.disclaimer} Each run trains on the database&apos;s own history, validates on held-back recent data,
        then refits on all of it. Up to {models.data.limits.runsPerHour} new runs per hour per address; results are kept{' '}
        {models.data.limits.retentionHours} h and shared by identical requests.
      </p>
      {startError && (
        <p
          role="alert"
          className="rounded-lg border border-bad bg-bad-soft p-3 text-sm text-ink"
          data-testid="run-error"
        >
          {startError.message}
        </p>
      )}
      {failed && (
        <p
          role="alert"
          className="rounded-lg border border-bad bg-bad-soft p-3 text-sm text-ink"
          data-testid="run-error"
        >
          The forecast did not finish: {failed.detail}
        </p>
      )}
      {status && (status.status === 'queued' || status.status === 'running') && <StudioProgress run={status} />}
      {status?.status === 'done' && status.result && <StudioResults result={status.result} />}
    </div>
  );
}

function ModelList() {
  const models = useForecastModels();
  if (!models.data) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 desk:grid-cols-4" data-testid="model-list">
      {models.data.models.map((m) => (
        <li key={m.id} className="rounded-xl border border-line p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">{m.groupLabel}</p>
          <p className="text-[13px] font-semibold leading-tight text-ink">
            {m.label}
            {m.experimental && (
              <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] font-medium">experimental</span>
            )}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-2">{m.description}</p>
          <p className="mt-1 text-[11px] text-muted">
            ≥ {m.minHistoryMonths} months{m.supportsInputs ? ' · uses input variables' : ''}
            {m.resolutions.includes('daily') ? ' · daily too' : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function AiPage() {
  const live = isLive('ai');
  return (
    <div>
      <p className="mb-3 text-sm text-ink-2">
        Forecasting Studio (spec §22): statistical forecasts of any variable in the national database, for any area,
        validated on held-back data and compared with simple baselines.
      </p>
      <KpiStrip module="ai" count={6} />
      <Row>
        <Card
          title="Forecasting Studio"
          context="Choose a variable, an area, a model and a horizon, then Run"
          info="Statistical forecast from historical data; not an official SAWS / DWS outlook."
        >
          {live ? (
            <Studio />
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              The Forecasting Studio trains models on the national database, so it needs the NIWIS backend. It is not
              available with sample data.
            </p>
          )}
        </Card>
      </Row>
      {live && (
        <Row>
          <Card title="Models available" context="From the forecasting engine (GET /api/v1/forecast/models)">
            <ModelList />
          </Card>
        </Row>
      )}
      <Row>
        <Card title="How a forecast is made">
          <FlowDiagram columns={FRAMEWORK} />
        </Card>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="ai" metric="drought" forecast title="Drought Forecast (SPI-3)" height={230} />
        <SeriesPanel module="ai" metric="streamflow" forecast title="River Discharge Forecast" height={230} />
        <SeriesPanel module="ai" metric="groundwater" forecast title="Groundwater Level Forecast" height={230} />
        <SeriesPanel
          module="ai"
          metric="reservoir"
          forecast
          title="Reservoir Storage Forecast (National)"
          height={230}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
        <TablePanel module="ai" metric="models" title="Page Forecast Models (Backtest Scores)" />
        <CategoryPanel
          module="ai"
          metric="importance"
          title="Feature Importance – Drought Model"
          variant="hbar"
          height={250}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
        <SeriesPanel
          module="ai"
          metric="scenario"
          forecast
          title="Scenario Analysis (Baseline vs RCP 2.6 vs RCP 8.5)"
          tabs={[
            { value: 'reservoir', label: 'Reservoir storage', params: { target: 'reservoir' } },
            { value: 'drought', label: 'Drought (SPI-3)', params: { target: 'drought' } },
            { value: 'groundwater', label: 'Groundwater', params: { target: 'groundwater' } },
          ]}
          height={300}
        />
        <TablePanel module="ai" metric="early-warning" title="AI Early Warning Signals" />
      </Row>
    </div>
  );
}
