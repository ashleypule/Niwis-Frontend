import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Card } from '@/components/ui/Card';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { AquiferCrossSection } from './AquiferCrossSection';

const mod = moduleById('groundwater-reserve');

export default function GroundwaterReservePage() {
  const aq = useSelectedEntity('groundwater-reserve');
  const p = { entityId: aq.id };
  const ctx = aq.name ? `[Aquifer: ${aq.name}]` : undefined;
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="groundwater-reserve" count={7} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="groundwater-reserve"
          title="Aquifer Reserve Status Map – South Africa"
          layers={[
            { id: 'ei', label: 'Exploitation index (EI)' },
            { id: 'recharge', label: 'Recharge (mm/yr)' },
            { id: 'gw-level', label: 'Groundwater level' },
            { id: 'sgi', label: 'SGI' },
          ]}
          height={520}
        />
        <div className="grid content-start gap-3">
          <SeriesPanel module="groundwater" metric="level-long" title="Groundwater Level Trend (Selected Borehole)" info="Depth axis inverted. Sen's slope trend shown dashed." height={220} />
          <CategoryPanel module="groundwater-reserve" metric="components" title="Aquifer Reserve Components (to 2050)" context={ctx} extra={p} variant="stacked" height={210} />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel module="groundwater-reserve" metric="recharge-abstraction" title="Recharge vs Abstraction (Selected Aquifer)" context={ctx} extra={p} height={210} />
          <SeriesPanel module="groundwater-reserve" metric="yield-ei" title="Sustainable Yield and Exploitation Index" context={ctx} extra={p} height={220} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
        <EntityInfoCard module="groundwater-reserve" id={aq.id} title="Aquifer Information (Selected Aquifer)" />
        <Card title="Aquifer Cross-Section and Groundwater Levels" context={aq.name}>
          <AquiferCrossSection />
        </Card>
        <div className="grid content-start gap-3">
          <CategoryPanel module="groundwater-reserve" metric="ei-classes" title="Aquifer Units by Exploitation Class" variant="hbar" height={200} />
          <AlertsList module="groundwater" limit={4} />
        </div>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.6fr_1fr]">
        <TablePanel module="groundwater-reserve" metric="aquifers" title="Aquifer Reserve Accounting (Recharge − Abstraction ± ΔStorage)" selectEntity maxHeight={360} />
        <TablePanel module="groundwater" metric="lowest" title="Top / Lowest Groundwater Levels (National)" />
      </Row>
    </div>
  );
}
