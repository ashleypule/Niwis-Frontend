import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { entityNoun, useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { DatabaseVariables } from '@/components/charts/DatabaseVariables';

const mod = moduleById('groundwater');

const LAYERS = [
  { id: 'gw-level', label: 'Groundwater level (m bgl)' },
  { id: 'sgi', label: 'SGI' },
  { id: 'level-change', label: 'Level change' },
  { id: 'status', label: 'Borehole status' },
  { id: 'ec', label: 'Water quality (EC)' },
  { id: 'recharge', label: 'Recharge potential', module: 'groundwater-reserve' as const },
];

export default function GroundwaterPage() {
  const bh = useSelectedEntity('groundwater');
  const p = { entityId: bh.id };
  const noun = entityNoun('groundwater', 'Borehole');
  const ctx = bh.name ? `[${noun}: ${bh.name}]` : undefined;
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="groundwater" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel module="groundwater" title="Groundwater Level Map – South Africa" layers={LAYERS} height={520} />
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="groundwater"
            metric="level"
            title={`Groundwater Level Trend (Selected ${noun})`}
            info="Depth axis is inverted: deeper water levels plot lower."
            context={ctx}
            extra={p}
            enabled={!!bh.id}
            blockedBy={bh.list}
            height={210}
          />
          <SeriesPanel
            module="groundwater"
            metric="sgi"
            title="Groundwater Level Anomaly (SGI)"
            context={ctx}
            extra={p}
            enabled={!!bh.id}
            blockedBy={bh.list}
            height={200}
          />
        </div>
        <div className="grid content-start gap-3">
          <CategoryPanel
            module="groundwater"
            metric="by-aquifer"
            title="Groundwater Level by Aquifer"
            variant="hbar"
            height={230}
          />
          <TablePanel
            module="groundwater"
            metric="lowest"
            title={
              noun === 'District' ? 'Districts with the Deepest / Shallowest Levels' : 'Boreholes with Lowest Levels'
            }
            selectEntity
            tabs={[
              { value: 'd', label: 'Deepest levels', params: { order: 'deepest' } },
              { value: 's', label: 'Shallowest', params: { order: 'shallowest' } },
            ]}
          />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="groundwater"
          metric="level-long"
          title={`Long-term Level Record (Selected ${noun})`}
          context={ctx}
          extra={p}
          enabled={!!bh.id}
          blockedBy={bh.list}
          height={230}
        />
        <SeriesPanel
          module="groundwater"
          metric="seasonal"
          title="Seasonal Groundwater Level (Last 5 Years)"
          context={ctx}
          extra={p}
          enabled={!!bh.id}
          blockedBy={bh.list}
          height={230}
        />
        <SeriesPanel
          module="groundwater"
          metric="anomaly"
          title="Groundwater Level Anomaly (vs Long-term)"
          height={230}
        />
        <CategoryPanel
          module="groundwater"
          metric="status"
          title="Borehole Status Distribution"
          variant="donut"
          height={180}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="groundwater"
          metric="quality"
          title={`Groundwater Quality (Selected ${noun})`}
          context={ctx}
          extra={p}
          enabled={!!bh.id}
          blockedBy={bh.list}
          tabs={['ec', 'ph', 'nitrate', 'fluoride', 'tds'].map((v) => ({
            value: v,
            label: v === 'ec' ? 'EC' : v === 'ph' ? 'pH' : v === 'tds' ? 'TDS' : v[0].toUpperCase() + v.slice(1),
            params: { param: v },
          }))}
          height={210}
        />
        <SeriesPanel module="groundwater" metric="recharge-abstraction" title="Recharge and Abstraction" height={230} />
        <CategoryPanel
          module="groundwater"
          metric="sector"
          title="Groundwater Abstraction by Sector"
          variant="donut"
          height={180}
        />
        <CategoryPanel
          module="groundwater"
          metric="distribution"
          title="Groundwater Level Distribution"
          variant="bar"
          height={230}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <EntityInfoCard module="groundwater" id={bh.id} title={`Borehole Information (Selected ${noun})`} />
        <TablePanel module="groundwater" metric="aquifers" title="Aquifer Status (Selected Region)" />
        <div className="grid content-start gap-3">
          <TablePanel
            module="groundwater"
            metric="declining"
            title={noun === 'District' ? 'Districts with Declining Levels' : 'Top Boreholes with Declining Levels'}
            selectEntity
          />
          <AlertsList module="groundwater" limit={4} />
        </div>
      </Row>
      <DatabaseVariables module="groundwater" />
    </div>
  );
}
