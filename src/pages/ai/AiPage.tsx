import { useState } from 'react';
import { BrainCircuit, CloudRain, Cpu, Database, Gauge, Leaf, Play, ShieldCheck, Sun, Waves, Wrench, Droplets, FlaskConical, Landmark, LineChart } from 'lucide-react';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Row } from '@/components/layout/Grid';
import { FlowDiagram } from '@/components/viz/FlowDiagram';
import { useEntities } from '@/api/queries/core';
import { ScenarioModal } from './ScenarioModal';

const MODULE_CARDS = [
  { icon: Sun, title: 'Drought forecast', model: 'LSTM + Transformer ensemble', out: '1–6 month drought class (D0–D4)', color: '#E65100' },
  { icon: Waves, title: 'Streamflow forecast', model: 'CNN-LSTM spatio-temporal', out: '7–90 day river flow', color: '#1565C0' },
  { icon: Landmark, title: 'Reservoir forecast', model: 'Random Forest + LSTM', out: '30–180 day dam level', color: '#0FA3B1' },
  { icon: FlaskConical, title: 'Water quality', model: 'Gradient Boosting + LSTM', out: 'Exceedance probability', color: '#8E44AD' },
  { icon: Leaf, title: 'Vegetation forecast', model: 'CNN + LSTM', out: '30-day vegetation health map', color: '#2E7D32' },
  { icon: Wrench, title: 'Infrastructure failure', model: 'Isolation Forest + LSTM', out: 'Pipe break prediction score', color: '#6D4C41' },
  { icon: Gauge, title: 'Demand forecast', model: 'XGBoost + regression', out: 'Monthly demand by WSA', color: '#F2A900' },
  { icon: Droplets, title: 'Groundwater level', model: 'LSTM autoregressive', out: '6–12 month level forecast', color: '#00838F' },
  { icon: CloudRain, title: 'Flood early warning', model: 'Hydrological model + GBM', out: '1–7 day flood exceedance', color: '#C62828' },
];

const FRAMEWORK = [
  { title: 'Input data', color: '#1565C0', icon: Database, items: [{ title: 'Climate & weather', lines: ['SAWS stations, CHIRPS, ERA5'] }, { title: 'Hydrology & storage', lines: ['DWS gauges, dams, NGA boreholes'] }, { title: 'Earth observation', lines: ['SANSA NDVI, LST, soil moisture, GRACE-FO'] }, { title: 'Socio-economic', lines: ['Stats SA, municipal returns, tariffs'] }] },
  { title: 'Pre-processing', color: '#00838F', icon: Cpu, items: [{ title: 'Quality control', lines: ['Range / spike / spatial checks'] }, { title: 'Gap filling', lines: ['Kriging, LSTM imputation (< 10% missing)'] }, { title: 'Feature engineering', lines: ['Lags 1–24 m, rolling means, anomalies'] }] },
  { title: 'AI / ML models', color: '#7B1FA2', icon: BrainCircuit, items: [{ title: 'Deep learning', lines: ['LSTM, CNN-LSTM, Transformer'] }, { title: 'Ensembles', lines: ['Random Forest, XGBoost, GBM'] }, { title: 'Anomaly detection', lines: ['Isolation Forest'] }] },
  { title: 'Validation', color: '#E65100', icon: ShieldCheck, items: [{ title: 'Hold-out 2019–2024', lines: ['RMSE, NSE, MAE, R²'] }, { title: 'Expert review', lines: ['DWS / SAWS drought labels'] }, { title: 'Uncertainty', lines: ['Quantile p10 / p50 / p90'] }] },
  { title: 'Outputs', color: '#2E7D32', icon: LineChart, items: [{ title: 'Forecasts & maps', lines: ['Module forecast tabs, API'] }, { title: 'Early warnings', lines: ['Alerts, SMS / e-mail'] }, { title: 'Scenario analysis', lines: ['Baseline, RCP 2.6, RCP 8.5'] }] },
];

export default function AiPage() {
  const [open, setOpen] = useState(false);
  const dams = useEntities('dams', { limit: 500 });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">Prediction engine (Module 10, spec §22) — forecasts across all water-system components.</p>
        <Button onClick={() => setOpen(true)}>
          <Play className="h-4 w-4" /> Run Scenario
        </Button>
      </div>
      <KpiStrip module="ai" count={6} />
      <Row>
        <Card title="AI Analytics Modules" context="Spec §22.1 predictive model requirements">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 desk:grid-cols-5 wide:grid-cols-9">
            {MODULE_CARDS.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.title} className="rounded-xl border border-line p-3" style={{ borderTop: `3px solid ${m.color}` }}>
                  <Icon className="h-6 w-6" style={{ color: m.color }} aria-hidden="true" />
                  <p className="mt-1.5 text-[13px] font-semibold leading-tight text-ink">{m.title}</p>
                  <p className="mt-1 text-[11px] text-muted">{m.model}</p>
                  <p className="mt-1 text-[11px] text-ink-2">→ {m.out}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      </Row>
      <Row>
        <Card title="AI Modelling Framework">
          <FlowDiagram columns={FRAMEWORK} />
        </Card>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="ai" metric="streamflow" forecast title="Streamflow Forecast (Main-stem Station)" height={230} />
        <SeriesPanel module="ai" metric="reservoir" forecast title="Reservoir Storage Forecast (National)" height={230} />
        <SeriesPanel module="ai" metric="groundwater" forecast title="Groundwater Level Forecast" height={230} />
        <SeriesPanel module="ai" metric="demand" forecast title="Water Demand Forecast (Municipal)" height={230} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
        <TablePanel module="ai" metric="models" title="Model Performance (Validation 2019–2024)" />
        <CategoryPanel module="ai" metric="importance" title="Feature Importance – Drought Model" variant="hbar" height={250} />
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
      {open && <ScenarioModal onClose={() => setOpen(false)} dams={dams.data?.items ?? []} />}
    </div>
  );
}
