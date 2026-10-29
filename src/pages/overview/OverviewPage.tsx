import { OverviewKpis } from './OverviewKpis';
import { isLive } from '@/config/app';
import type { ModuleId } from '@/config/modules';
import { MapPanel, type PointLayerDef, type ThematicLayer } from '@/components/map/MapPanel';
import { TablePanel } from '@/components/table/TablePanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { ProgrammeCard, DataQualityCard, BudgetCard } from './PlatformCards';

const LAYERS: ThematicLayer[] = [
  { id: 'municipal-class', label: 'Drought', module: 'drought' },
  { id: 'rain-anomaly', label: 'Rainfall', module: 'drought' },
  { id: 'vci', label: 'Vegetation', module: 'drought' },
  { id: 'storage', label: 'Dam Storage', module: 'dams' },
  { id: 'flow-status', label: 'Surface Water', module: 'surface-water' },
  { id: 'gw-level', label: 'Groundwater', module: 'groundwater' },
  { id: 'wqi', label: 'Water Quality', module: 'water-quality' },
  { id: 'coverage', label: 'Water Services', module: 'services' },
  { id: 'tariff', label: 'Tariffs', module: 'tariffs' },
  { id: 'risk', label: 'Vulnerable Settlements', module: 'settlements' },
];

const POINTS: PointLayerDef[] = [
  { id: 'dams', label: 'Major dams', module: 'dams', layer: 'storage' },
  { id: 'gauges', label: 'River gauges', module: 'surface-water', layer: 'stations', shape: 'triangle' },
  { id: 'gw', label: 'Groundwater stations', module: 'drought', layer: 'boreholes', shape: 'square' },
  { id: 'wtp', label: 'Treatment plants (WWTW)', module: 'green-drop', layer: 'compliance', shape: 'square' },
  { id: 'wss', label: 'Water supply systems', module: 'blue-drop', layer: 'compliance', shape: 'triangle' },
];

/** Key-indicator tabs served by a live module: the same request as on that module's page. */
const LIVE_TABS: Record<string, { module: ModuleId; metric: string }> = {
  rainfall: { module: 'rainfall', metric: 'monthly' },
  streamflow: { module: 'surface-water', metric: 'discharge' },
  groundwater: { module: 'groundwater', metric: 'level' },
  quality: { module: 'water-quality', metric: 'station-wqi' },
};

export default function OverviewPage() {
  return (
    <div>
      <OverviewKpis />

      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <MapPanel
          module="overview"
          title="South Africa Water Status Map (Multi-Layer View)"
          layers={LAYERS}
          pointLayers={POINTS}
          height={470}
          className="desk:row-span-2"
        />
        <SeriesPanel
          module="drought"
          metric="drought-area"
          title="National Drought Trend (Area %)"
          extra={{ period: '24M' }}
          height={200}
          info="Share of the land area in each drought class, from gridded SPI-6."
        />
        <TablePanel
          module="dams"
          metric="top10"
          title="Major Dam Storage (Top 10 by Capacity)"
          viewAllHref="/dams"
          maxHeight={240}
        />
        <SeriesPanel
          module="overview"
          metric="key-indicators"
          title="Key Indicators (Last 12 Months)"
          tabs={['rainfall', 'streamflow', 'groundwater', 'quality', 'demand'].map((t) => ({
            value: t,
            label: t === 'quality' ? 'Water Quality' : t[0].toUpperCase() + t.slice(1),
            params: { tab: t },
            // tabs of live modules come from those modules, so they match the module pages
            ...(LIVE_TABS[t] && isLive(LIVE_TABS[t].module) ? { ...LIVE_TABS[t], params: {} } : {}),
          }))}
          height={210}
        />
        <CategoryPanel
          module="overview"
          metric="services-access"
          title="Water Services Access by Province"
          variant="stacked100"
          height={240}
        />
      </div>

      <Row className="xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
        <SeriesPanel
          module="overview"
          metric="ai"
          forecast
          title="Forecasts (Next 12 Months)"
          tabs={[
            { value: 'drought', label: 'Drought (SPI-3)', module: 'drought', metric: 'spi' },
            { value: 'area', label: 'Drought area', module: 'drought', metric: 'area' },
            { value: 'reservoir', label: 'Reservoir', module: 'ai', metric: 'reservoir' },
            { value: 'settlements', label: 'Settlements', module: 'drought', metric: 'settlements' },
          ]}
          height={230}
        />
        <TablePanel
          module="overview"
          metric="settlements"
          title="Drought-Affected Settlements (Top 10)"
          viewAllHref="/settlements"
          maxHeight={300}
        />
        <AlertsList limit={8} />
      </Row>

      <Row className="xl:grid-cols-3">
        <ProgrammeCard />
        <DataQualityCard />
        <BudgetCard />
      </Row>
    </div>
  );
}
