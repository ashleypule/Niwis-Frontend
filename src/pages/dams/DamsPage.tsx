import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { TablePanel } from '@/components/table/TablePanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { Row } from '@/components/layout/Grid';
import { WaterExtentCard } from './WaterExtentCard';
import { DatabaseVariables } from '@/components/charts/DatabaseVariables';
import { isLive } from '@/config/app';

const mod = moduleById('dams');

export const DAM_LAYERS = [
  { id: 'storage', label: 'Storage level (% FSC)' },
  { id: 'anomaly', label: 'Storage anomaly' },
  { id: 'inflow', label: 'Inflow (m³/s)' },
  { id: 'status', label: 'Operational status' },
];
/** Live: the database's two plausible reservoir columns, per district, before the storage layers it cannot serve. */
export const DAM_LAYERS_LIVE = [
  { id: 'catchment-rainfall', label: 'Catchment rainfall (month)' },
  { id: 'soil-moisture', label: 'Catchment soil moisture' },
  ...DAM_LAYERS,
];

export default function DamsPage() {
  const sel = useSelectedEntity('dams');
  const ctx = sel.name ? `[${sel.name}]` : undefined;
  const p = { entityId: sel.id };
  const live = isLive('dams');
  return (
    <div>
      <PageTabs mod={mod} />
      {live && (
        <p className="mb-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2" role="note">
          <b>Reservoir storage is not published yet.</b> The database&apos;s storage, level and flow values fail the
          plausibility check (the reason is on each panel). Shown: the district reservoirs, their catchment rainfall and
          soil moisture, and every database variable below.
        </p>
      )}
      <KpiStrip module="dams" count={8} />

      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <MapPanel
          module="dams"
          title={live ? 'Reservoir Catchments by District' : 'Dam Storage Status Map (Major Dams)'}
          layers={live ? DAM_LAYERS_LIVE : DAM_LAYERS}
          height={500}
          baseLayers={['provinces', 'wmas', 'catchments', 'rivers', 'towns', 'basemap']}
          defaultBase={['provinces', 'rivers']}
        />
        <TablePanel
          module="dams"
          metric="top10"
          title="Major Dam Storage (Top 10 by Capacity)"
          selectEntity
          maxHeight={480}
        />
      </div>

      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel
          module="dams"
          metric="by-wma"
          title="Storage by Water Management Area"
          variant="hbar"
          height={240}
        />
        <CategoryPanel
          module="dams"
          metric="distribution"
          title="Storage Level Distribution"
          variant="donut"
          height={190}
        />
        <SeriesPanel module="dams" metric="storage-trend" title="Storage Levels Trend (All Major Dams)" height={240} />
        <SeriesPanel module="dams" metric="flows" title="Inflow and Outflow (Monthly)" height={240} />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <EntityInfoCard
          module="dams"
          id={sel.id}
          title={live ? 'Reservoir (Selected District)' : 'Key Dam (Selected View)'}
        />
        <CategoryPanel module="dams" metric="operational" title="Operational Status" variant="donut" height={190} />
        <WaterExtentCard id={sel.id} />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="dams"
          metric="dam-storage"
          title="Storage Level Trend (Selected Dam)"
          context={ctx}
          extra={p}
          enabled={!!sel.id}
          blockedBy={sel.list}
          height={240}
        />
        <SeriesPanel
          module="dams"
          metric="dam-flows"
          title="Inflow and Outflow (Selected Dam)"
          context={ctx}
          extra={p}
          enabled={!!sel.id}
          blockedBy={sel.list}
          height={240}
        />
        <SeriesPanel
          module="dams"
          metric="dam-monthly"
          title="Monthly Storage Comparison (Selected Dam)"
          context={ctx}
          extra={p}
          enabled={!!sel.id}
          blockedBy={sel.list}
          height={240}
        />
      </Row>

      <Row className="md:grid-cols-3">
        <SeriesPanel
          module="dams"
          metric="rule-curve"
          title="Operational Rule Curve (Selected Dam)"
          context={ctx}
          extra={p}
          enabled={!!sel.id}
          blockedBy={sel.list}
          height={230}
        />
        <SeriesPanel
          module="dams"
          metric="dam-anomaly"
          title="Storage Anomaly (Selected Dam)"
          context={ctx}
          extra={p}
          enabled={!!sel.id}
          blockedBy={sel.list}
          height={230}
        />
        <TablePanel
          module="dams"
          metric="lowest"
          title="Lowest / Highest Storage Dams"
          selectEntity
          tabs={[
            { value: 'lowest', label: 'Lowest storage', params: { order: 'lowest' } },
            { value: 'highest', label: 'Highest storage', params: { order: 'highest' } },
          ]}
          maxHeight={300}
        />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <CategoryPanel
          module="dams"
          metric="wma-volume"
          title="National Storage by Water Management Area"
          variant="mixed"
          height={230}
        />
        <CategoryPanel
          module="dams"
          metric="by-province"
          title="Storage Level by Province"
          variant="bar"
          height={230}
        />
        <SeriesPanel module="dams" metric="cumulative-inflow" title="Cumulative Inflow (Year to Date)" height={230} />
      </Row>
      <DatabaseVariables module="dams" />
    </div>
  );
}
