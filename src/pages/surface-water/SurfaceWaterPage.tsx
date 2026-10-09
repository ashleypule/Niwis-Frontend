import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('surface-water');

const LAYERS = [
  { id: 'flow-status', label: 'Gauging station status' },
  { id: 'stations', label: 'River discharge' },
  { id: 'flow-anomaly', label: 'Flow anomaly' },
  { id: 'ssi', label: 'Flow percentile (SSI)' },
  { id: 'catchment-runoff', label: 'Catchment runoff' },
];

export default function SurfaceWaterPage() {
  const st = useSelectedEntity('surface-water');
  const p = { entityId: st.id };
  const ctx = st.name ? `[Station: ${st.name}]` : undefined;
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="surface-water" count={9} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel module="surface-water" title="River Network & Gauging Stations – South Africa" layers={LAYERS} defaultBase={['provinces', 'rivers']} height={520} />
        <div className="grid content-start gap-3">
          <SeriesPanel module="surface-water" metric="discharge" title="River Discharge (Selected Station)" context={ctx} extra={p} height={200} />
          <SeriesPanel module="surface-water" metric="water-level" title="Water Level (Selected Station)" context={ctx} extra={p} height={200} />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="surface-water"
            metric="sediment"
            title="Suspended Sediment (Selected Station)"
            context={ctx}
            extra={p}
            tabs={[
              { value: 'conc', label: 'Concentration', params: { kind: 'conc' } },
              { value: 'load', label: 'Load (t/day)', params: { kind: 'load' } },
            ]}
            height={180}
          />
          <SeriesPanel module="surface-water" metric="baseflow" title="Baseflow and Quickflow Separation" context={ctx} extra={p} height={200} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="surface-water" metric="fdc" title="Flow Duration Curve" context={ctx} extra={p} height={230} />
        <CategoryPanel module="surface-water" metric="eflow" title="Ecological Flow Compliance" variant="donut" height={180} />
        <CategoryPanel module="surface-water" metric="risk" title="Flood and Drought Risk (Stations)" variant="donut" height={180} />
        <CategoryPanel module="surface-water" metric="status" title="Gauging Station Status" variant="donut" height={180} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <EntityInfoCard module="surface-water" id={st.id} title="Station Information (Selected Station)" />
        <TablePanel module="surface-water" metric="gauge-quality" title="Water Quality at Gauging Station" extra={p} />
        <TablePanel
          module="surface-water"
          metric="top-stations"
          title="Top / Lowest Flows (National)"
          selectEntity
          tabs={[
            { value: 'h', label: 'Highest flows', params: { order: 'highest' } },
            { value: 'l', label: 'Lowest flows', params: { order: 'lowest' } },
          ]}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="surface-water" metric="flow-anomaly" title="Flow Anomaly (Current vs Long-term)" height={220} />
        <SeriesPanel module="surface-water" metric="seasonal" title="Hydrological Regime (Selected Station)" context={ctx} extra={p} height={220} />
        <CategoryPanel module="surface-water" metric="abstraction" title="Water Abstraction by River System" variant="hbar" height={240} />
        <TablePanel module="surface-water" metric="alerts" title="Surface Water Alerts (Last 7 Days)" />
      </Row>
    </div>
  );
}
