import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('water-quality');

export const WQ_LAYERS = [
  { id: 'wqi', label: 'Water Quality Index (WQI)' },
  { id: 'ph', label: 'pH' },
  { id: 'do', label: 'Dissolved oxygen' },
  { id: 'ec', label: 'Electrical conductivity' },
  { id: 'turbidity', label: 'Turbidity' },
  { id: 'nitrate', label: 'Nitrate' },
  { id: 'phosphate', label: 'Phosphate' },
  { id: 'ammonia', label: 'Ammonia' },
  { id: 'bod', label: 'BOD' },
  { id: 'cod', label: 'COD' },
  { id: 'ecoli', label: 'E. coli' },
  { id: 'lead', label: 'Metals (lead)' },
];

const PARAMS = ['ec', 'ph', 'turbidity', 'do', 'bod', 'cod', 'nitrate', 'phosphate', 'ecoli'];
const LABEL: Record<string, string> = {
  ec: 'EC',
  ph: 'pH',
  turbidity: 'Turbidity',
  do: 'DO',
  bod: 'BOD',
  cod: 'COD',
  nitrate: 'Nitrate',
  phosphate: 'Phosphate',
  ecoli: 'E. coli',
};

export default function WaterQualityPage() {
  const st = useSelectedEntity('water-quality');
  const p = { entityId: st.id };
  const ctx = st.name ? `[Station: ${st.name}]` : undefined;
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="water-quality" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="water-quality"
          title="Water Quality Index (WQI) – Monitoring Stations"
          layers={WQ_LAYERS}
          height={520}
        />
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="water-quality"
            metric="param-trend"
            title="Key Water Quality Trends (Selected Station)"
            context={ctx}
            extra={p}
            tabs={PARAMS.map((v) => ({ value: v, label: LABEL[v], params: { param: v } }))}
            height={210}
          />
          <CategoryPanel
            module="water-quality"
            metric="param-range"
            title="Water Quality by Parameter (Range, Log Scale)"
            variant="range"
            log
            height={220}
          />
        </div>
        <div className="grid content-start gap-3">
          <TablePanel
            module="water-quality"
            metric="ranking"
            title="Top / Poorest Stations by WQI"
            selectEntity
            tabs={[
              { value: 'p', label: 'Poorest', params: { order: 'poorest' } },
              { value: 'b', label: 'Best', params: { order: 'best' } },
            ]}
          />
          <CategoryPanel
            module="water-quality"
            metric="compliance"
            title="Water Quality Compliance"
            variant="donut"
            height={170}
          />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="water-quality"
          metric="station-wqi"
          title="WQI Time Series (Selected Station)"
          context={ctx}
          extra={p}
          height={230}
        />
        <CategoryPanel
          module="water-quality"
          metric="by-province"
          title="Water Quality Status by Province"
          variant="hstacked100"
          height={260}
        />
        <CategoryPanel
          module="water-quality"
          metric="param-compliance"
          title="Compliance by Parameter"
          variant="hbar"
          height={260}
        />
        <CategoryPanel
          module="water-quality"
          metric="wqi-distribution"
          title="Water Quality Index Distribution"
          variant="bar"
          labels
          height={230}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="water-quality"
          metric="group"
          title="Nutrients (Selected Station)"
          context={ctx}
          extra={{ ...p, group: 'nutrients' }}
          height={220}
        />
        <SeriesPanel
          module="water-quality"
          metric="group"
          title="Metals (Selected Station)"
          context={ctx}
          extra={{ ...p, group: 'metals' }}
          height={220}
        />
        <SeriesPanel
          module="water-quality"
          metric="group"
          title="Microbiological – E. coli (Selected Station)"
          context={ctx}
          extra={{ ...p, group: 'micro' }}
          height={220}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1.2fr]">
        <EntityInfoCard module="water-quality" id={st.id} title="Station Information" />
        <TablePanel module="water-quality" metric="latest" title="Latest Results (Selected Station)" extra={p} />
        <div className="grid content-start gap-3">
          <TablePanel module="water-quality" metric="hotspots" title="Hotspots / Non-compliance Locations" />
          <CategoryPanel
            module="water-quality"
            metric="by-type"
            title="Monitoring Stations by Water Body Type"
            variant="donut"
            height={170}
          />
        </div>
      </Row>
    </div>
  );
}
