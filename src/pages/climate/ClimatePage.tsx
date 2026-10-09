import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { CascadeFlow } from '@/components/viz/CascadeFlow';
import { Row } from '@/components/layout/Grid';
import { ClimateInsights } from './ClimateInsights';

const mod = moduleById('climate');

const LAYERS = [
  { id: 'temp-trend', label: 'Temperature trend' },
  { id: 'temp-anomaly', label: 'Temperature anomaly' },
  { id: 'mean-temp', label: 'Mean temperature' },
  { id: 'rain-trend', label: 'Rainfall change' },
  { id: 'cdd', label: 'CDD' },
  { id: 'hot-days', label: 'Heatwave days' },
  { id: 'et0', label: 'ET₀ / PET' },
  { id: 'vulnerability', label: 'Vulnerability index' },
];

const twoTabs = (a: [string, string, Record<string, string>], b: [string, string, Record<string, string>]) => [
  { value: a[0], label: a[1], params: a[2] },
  { value: b[0], label: b[1], params: b[2] },
];

export default function ClimatePage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="climate" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel module="climate" title="Climate Change Map – South Africa" layers={LAYERS} height={500} />
        <SeriesPanel
          module="climate"
          metric="temperature-long"
          title="Long-term Temperature Trend (1960 – Present)"
          context="Tmax · Tavg · Tmin and anomaly vs 1981–2010"
          height={250}
        />
        <SeriesPanel
          module="climate"
          metric="national-trend"
          title="Climate Trends (1960 – Present)"
          tabs={['temperature', 'rainfall', 'et', 'streamflow'].map((v) => ({
            value: v,
            label: v === 'et' ? 'Evapotranspiration' : v[0].toUpperCase() + v.slice(1),
            params: { var: v },
          }))}
          height={250}
        />
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="climate"
          metric="extremes"
          title="Wet and Dry Spell Indicators (ETCCDI)"
          context="CDD · CWD · Rx1day · Rx5day"
          height={240}
        />
        <CategoryPanel
          module="climate"
          metric="map-seasonality"
          title="Mean Annual Precipitation & Seasonality"
          variant="bar"
          height={240}
        />
        <TablePanel module="climate" metric="statistics" title="Rainfall Statistics" />
        <CategoryPanel
          module="climate"
          metric="seasonal-change"
          title="Seasonal Changes (vs 1961–1990)"
          tabs={twoTabs(['t', 'Temperature', { var: 'temperature' }], ['r', 'Rainfall', { var: 'rainfall' }])}
          variant="bar"
          height={220}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="climate"
          metric="projections"
          title="Climate Projections to 2100 (RCP 4.5 / 8.5)"
          tabs={twoTabs(['t', 'Temperature', { var: 'temperature' }], ['r', 'Rainfall', { var: 'rainfall' }])}
          height={250}
        />
        <SeriesPanel
          module="climate"
          metric="heat-days"
          title="Extreme Temperature Days"
          tabs={twoTabs(
            ['hot', 'Hot days (> 35 °C)', { kind: 'hot' }],
            ['cold', 'Cold nights (< 0 °C)', { kind: 'cold' }],
          )}
          height={230}
        />
        <SeriesPanel
          module="climate"
          metric="extreme-rain"
          title="Extreme Rainfall Events"
          tabs={twoTabs(
            ['r20', 'Heavy rain days', { kind: 'r20' }],
            ['rx1', 'Maximum 1-day rainfall', { kind: 'rx1' }],
          )}
          height={230}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="climate" metric="evaporation" title="Evaporation & Atmospheric Demand" height={240} />
        <SeriesPanel module="climate" metric="irrigation" title="Irrigation Demand Indicators" height={240} />
        <SeriesPanel module="climate" metric="streamflow-linkage" title="Streamflow – Climate Linkage" height={240} />
        <SeriesPanel
          module="climate"
          metric="drought-frequency"
          title="Drought Frequency (SPI-3 ≤ −1.5)"
          height={240}
        />
      </Row>
      <Row>
        <CascadeFlow module="climate" metric="signal-chain" title="Climate Signal Summary – Key Indicators" />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr]">
        <TablePanel module="climate" metric="provinces" title="Climate Indicators by Province" />
        <CategoryPanel
          module="climate"
          metric="risk-index"
          title="Climate Risk Index (Current)"
          variant="hbar"
          height={220}
        />
        <ClimateInsights />
      </Row>
      <Row className="md:grid-cols-2">
        <MapPanel
          module="climate"
          title="Climate Vulnerability Index"
          layers={[{ id: 'vulnerability', label: 'Vulnerability' }]}
          tabs={false}
          height={360}
        />
        <TablePanel module="drought" metric="sources" title="Data Source Status" />
      </Row>
    </div>
  );
}
