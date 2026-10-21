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
import { entityNoun, useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { DatabaseVariables } from '@/components/charts/DatabaseVariables';
import { isLive } from '@/config/app';
import { AquiferCrossSection } from './AquiferCrossSection';

const mod = moduleById('groundwater-reserve');

export default function GroundwaterReservePage() {
  const aq = useSelectedEntity('groundwater-reserve');
  const p = { entityId: aq.id };
  const noun = entityNoun('groundwater-reserve', 'Aquifer');
  const ctx = aq.name ? `[${noun}: ${aq.name}]` : undefined;
  const live = isLive('groundwater-reserve');
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
          <SeriesPanel
            module="groundwater"
            metric="level-long"
            title={`Groundwater Level Trend (Selected ${live ? noun : 'Borehole'})`}
            context={live ? ctx : undefined}
            extra={live ? p : undefined}
            enabled={!live || !!aq.id}
            blockedBy={live ? aq.list : undefined}
            info="Depth axis inverted. Sen's slope trend shown dashed."
            height={220}
          />
          <CategoryPanel
            module="groundwater-reserve"
            metric="components"
            title={live ? `Aquifer Reserve Components (Selected ${noun})` : 'Aquifer Reserve Components (to 2050)'}
            context={ctx}
            extra={p}
            enabled={!!aq.id}
            blockedBy={aq.list}
            variant="stacked"
            height={210}
          />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="groundwater-reserve"
            metric="recharge-abstraction"
            title={`Recharge vs Abstraction (Selected ${noun})`}
            context={ctx}
            extra={p}
            enabled={!!aq.id}
            blockedBy={aq.list}
            height={210}
          />
          <SeriesPanel
            module="groundwater-reserve"
            metric="yield-ei"
            title="Sustainable Yield and Exploitation Index"
            context={ctx}
            extra={p}
            enabled={!!aq.id}
            blockedBy={aq.list}
            height={220}
          />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
        <EntityInfoCard module="groundwater-reserve" id={aq.id} title={`${noun} Information (Selected ${noun})`} />
        <Card
          title={live ? 'Aquifer Cross-Section (schematic, not data)' : 'Aquifer Cross-Section and Groundwater Levels'}
          context={live ? undefined : aq.name}
          provenance={live ? null : undefined}
        >
          <AquiferCrossSection />
        </Card>
        <div className="grid content-start gap-3">
          <CategoryPanel
            module="groundwater-reserve"
            metric="ei-classes"
            title={live ? 'Districts by Exploitation Class' : 'Aquifer Units by Exploitation Class'}
            variant="hbar"
            height={200}
          />
          <AlertsList module="groundwater" limit={4} />
        </div>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.6fr_1fr]">
        <TablePanel
          module="groundwater-reserve"
          metric="aquifers"
          title="Aquifer Reserve Accounting (Recharge − Abstraction ± ΔStorage)"
          selectEntity
          maxHeight={360}
        />
        <TablePanel module="groundwater" metric="lowest" title="Top / Lowest Groundwater Levels (National)" />
      </Row>
      <DatabaseVariables module="groundwater-reserve" />
    </div>
  );
}
