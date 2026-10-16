import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { DatabaseVariables } from '@/components/charts/DatabaseVariables';
import { entityNoun, useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { isLive } from '@/config/app';
import { MODELLED } from '@/components/provenance/provenance';

const mod = moduleById('runoff');

export const RUNOFF_LAYERS = [
  { id: 'annual-runoff', label: 'Annual runoff' },
  { id: 'runoff-anomaly', label: 'Runoff anomaly' },
  { id: 'monthly-runoff', label: 'Monthly runoff' },
  { id: 'runoff-coefficient', label: 'Runoff coefficient' },
  { id: 'catchment-runoff', label: 'By catchment' },
  { id: 'stations', label: 'River flow (gauges)' },
  { id: 'ssi', label: 'SSI (gauges)' },
  { id: 'flow-status', label: 'Station status' },
];

export default function RunoffPage() {
  const st = useSelectedEntity('runoff');
  const p = { entityId: st.id };
  const noun = entityNoun('runoff');
  const ctx = st.name ? `[${noun}: ${st.name}]` : undefined;
  const ready = !!st.id;
  return (
    <div>
      <PageTabs mod={mod} />
      {isLive('runoff') && (
        <p className="mb-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-2" role="note">
          <b>Modelled values.</b> {MODELLED.runoff}
        </p>
      )}
      <KpiStrip module="runoff" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel module="runoff" title="Runoff Distribution Map – South Africa" layers={RUNOFF_LAYERS} height={520} />
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="runoff"
            metric="discharge"
            title={`River Discharge (Selected ${noun})`}
            context={ctx}
            extra={p}
            enabled={ready}
            blockedBy={st.list}
            height={210}
          />
          <SeriesPanel module="runoff" metric="ssi" title="Standardized Streamflow Index (SSI)" height={200} />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="runoff"
            metric="runoff-anomaly"
            title="Runoff Anomaly (Selected Area)"
            context={undefined}
            height={210}
          />
          <SeriesPanel module="runoff" metric="rainfall-runoff" title="Rainfall–Runoff Relationship" height={200} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="runoff"
          metric="water-balance"
          title="Water Balance Components (Area Average)"
          height={230}
        />
        <SeriesPanel
          module="runoff"
          metric="flood-frequency"
          title="Flood Frequency Analysis (Peak Flow)"
          context={ctx}
          extra={p}
          enabled={ready}
          blockedBy={st.list}
          height={230}
        />
        <SeriesPanel
          module="runoff"
          metric="fdc"
          title={`Flow Duration Curve (Selected ${noun})`}
          context={ctx}
          extra={p}
          enabled={ready}
          blockedBy={st.list}
          height={230}
        />
        <SeriesPanel
          module="runoff"
          metric="seasonal"
          title={`Seasonal Runoff Pattern (Selected ${noun})`}
          context={ctx}
          extra={p}
          enabled={ready}
          blockedBy={st.list}
          height={230}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="runoff"
          metric="drivers"
          title="Runoff Drivers and Supporting Variables"
          tabs={[
            { value: 'rain', label: 'Catchment rainfall', params: { var: 'rain' } },
            { value: 'aet', label: 'Actual ET', params: { var: 'aet' } },
            { value: 'sm', label: 'Soil moisture', params: { var: 'sm' } },
          ]}
          height={220}
        />
        <SeriesPanel module="runoff" metric="national-volume" title="Runoff Volume (Monthly)" height={220} />
        <CategoryPanel
          module="runoff"
          metric="by-wma"
          title="Runoff by Water Management Area"
          variant="hbar"
          height={240}
        />
        <CategoryPanel
          module="runoff"
          metric="by-province"
          title="Runoff Status by Province (Stations)"
          variant="stacked100"
          height={240}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <TablePanel
          module="runoff"
          metric="statistics"
          title="Runoff Statistics (Selected Area)"
          context={ctx}
          extra={p}
          enabled={ready}
          blockedBy={st.list}
        />
        <TablePanel
          module="runoff"
          metric="top-stations"
          title={`Top 10 ${noun === 'District' ? 'Districts' : 'Stations'} by Current Flow`}
          selectEntity
          tabs={[
            { value: 'h', label: 'Highest flow', params: { order: 'highest' } },
            { value: 'l', label: 'Lowest flow (percentile)', params: { order: 'lowest' } },
          ]}
        />
        <TablePanel module="runoff" metric="events" title="Extreme Events (Current Month)" />
      </Row>
      <DatabaseVariables module="runoff" />
    </div>
  );
}
