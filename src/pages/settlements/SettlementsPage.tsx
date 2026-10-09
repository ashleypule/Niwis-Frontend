import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('settlements');

export const SETTLEMENT_LAYERS = [
  { id: 'risk', label: 'Drought-affected settlements (risk)' },
  { id: 'exposure', label: 'Drought exposure' },
  { id: 'reliability', label: 'Water supply reliability' },
  { id: 'status', label: 'Intervention status' },
  { id: 'municipal-share', label: 'Share at risk by municipality' },
];

export default function SettlementsPage() {
  const s = useSelectedEntity('settlements');
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="settlements" count={7} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.3fr)_minmax(0,1.25fr)_minmax(0,0.85fr)]">
        <MapPanel module="settlements" title="Drought-Affected Settlements (Current Conditions)" layers={SETTLEMENT_LAYERS} height={520} />
        <TablePanel module="settlements" metric="top" title="Top 10 Drought-Affected Settlements (Current)" selectEntity maxHeight={470} />
        <div className="grid content-start gap-3">
          <CategoryPanel module="settlements" metric="severity" title="Settlement Severity Distribution" variant="donut" height={170} />
          <CategoryPanel module="settlements" metric="pop-severity" title="Population Affected by Severity" variant="donut" height={170} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="settlements" metric="trend" title="Number of Drought-Affected Settlements (Trend)" height={230} />
        <SeriesPanel module="settlements" metric="population" title="Population Affected (Trend)" height={230} />
        <CategoryPanel module="settlements" metric="supply" title="Water Supply Status of Monitored Settlements" variant="stacked100" height={230} />
        <CategoryPanel module="settlements" metric="interventions" title="Intervention Status (Number of Settlements)" variant="bar" labels height={230} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel module="settlements" metric="by-province" title="Settlements by Province (by Risk)" variant="stacked" height={230} />
        <CategoryPanel module="settlements" metric="by-type" title="Population Affected by Settlement Type" variant="hbar" height={230} />
        <SeriesPanel module="settlements" metric="exposure-deficit" title="Drought Exposure vs Rainfall Deficit" height={240} />
        <CategoryPanel module="settlements" metric="alt-supply" title="Alternative Supply Sources" variant="donut" height={180} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <EntityInfoCard module="settlements" id={s.id} title="Settlement Information (Selected)" />
        <CategoryPanel module="settlements" metric="infrastructure" title="Water Infrastructure Condition (Affected)" variant="hbar" height={220} />
        <TablePanel module="settlements" metric="top" title="Top 5 by Population Affected" extra={{ order: 'population', limit: 5 }} selectEntity />
      </Row>
    </div>
  );
}
