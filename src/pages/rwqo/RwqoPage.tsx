import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('rwqo');

export default function RwqoPage() {
  const site = useSelectedEntity('rwqo');
  const p = { entityId: site.id };
  const ctx = site.name ? `[Site: ${site.name}]` : undefined;
  const tabs = (keys: [string, string][]) => keys.map(([v, l]) => ({ value: v, label: l, params: { param: v } }));
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="rwqo" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="rwqo"
          title="RWQO Monitoring Sites – Ecological Condition"
          layers={[
            { id: 'pes', label: 'Present Ecological State' },
            { id: 'compliance', label: 'RWQO compliance' },
            { id: 'sass5', label: 'SASS5 score' },
          ]}
          height={520}
        />
        <div className="grid content-start gap-3">
          <SeriesPanel module="rwqo" metric="ecological" title="Ecological Indices (SASS5, ASPT, FIBI, IHI)" context={ctx} extra={p} height={220} />
          <SeriesPanel module="rwqo" metric="params" title="Water Quality vs Objectives" context={ctx} extra={p} tabs={tabs([['do', 'DO'], ['ph', 'pH'], ['ec', 'EC'], ['turbidity', 'Turbidity']])} height={190} />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel module="rwqo" metric="params" title="Nutrients vs Objectives" context={ctx} extra={p} tabs={tabs([['phosphate', 'Phosphate'], ['nitrate', 'Nitrogen'], ['ammonia', 'Ammonia']])} height={210} />
          <SeriesPanel module="rwqo" metric="params" title="Toxicants vs Objectives" context={ctx} extra={p} tabs={tabs([['lead', 'Lead'], ['arsenic', 'Arsenic']])} height={190} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="rwqo" metric="eflow" title="Hydrological Indicators (E-flow vs Observed)" context={ctx} extra={p} height={230} />
        <CategoryPanel module="rwqo" metric="by-type" title="RWQO Compliance by Water Body Type" variant="stacked" height={230} />
        <CategoryPanel module="rwqo" metric="pes" title="Present Ecological State Distribution" variant="donut" height={180} />
        <TablePanel module="rwqo" metric="results" title="Results vs RWQO Objectives (Selected Site)" extra={p} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr]">
        <EntityInfoCard module="rwqo" id={site.id} title="Site Information (Selected Site)" />
        <TablePanel
          module="rwqo"
          metric="ranking"
          title="Lowest / Highest Ecological Condition Sites"
          selectEntity
          tabs={[
            { value: 'l', label: 'Lowest SASS5', params: { order: 'lowest' } },
            { value: 'h', label: 'Highest SASS5', params: { order: 'highest' } },
          ]}
        />
      </Row>
    </div>
  );
}
