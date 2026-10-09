import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('tariffs');

export const TARIFF_LAYERS = [
  { id: 'tariff', label: 'Municipal tariffs' },
  { id: 'increase', label: 'Tariff increases' },
  { id: 'recovery', label: 'Cost recovery' },
  { id: 'affordability', label: 'Affordability' },
  { id: 'nrw', label: 'NRW' },
];

export default function TariffsPage() {
  const m = useSelectedEntity('tariffs');
  const p = { entityId: m.id };
  const ctx = m.name ? `[${m.name}]` : undefined;
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="tariffs" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="tariffs"
          title="Average Municipal Water Tariff Map (R/kL)"
          layers={TARIFF_LAYERS}
          height={520}
        />
        <div className="grid content-start gap-3">
          <CategoryPanel
            module="tariffs"
            metric="comparison"
            title="Tariff Comparison (R/kL)"
            variant="bar"
            height={210}
          />
          <CategoryPanel
            module="tariffs"
            metric="cost-vs-tariff"
            title="Cost of Supply vs Tariff (R/kL)"
            variant="mixed"
            height={210}
          />
        </div>
        <div className="grid content-start gap-3">
          <CategoryPanel module="tariffs" metric="revenue" title="Revenue by Source" variant="donut" height={170} />
          <CategoryPanel module="tariffs" metric="increases" title="Tariff Increases (%)" variant="line" height={210} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <CategoryPanel
          module="tariffs"
          metric="blocks"
          title="Domestic Block Tariff Structure (Selected Municipality)"
          context={ctx}
          extra={p}
          variant="bar"
          labels
          height={220}
        />
        <CategoryPanel
          module="tariffs"
          metric="affordability"
          title="Household Affordability (Selected Municipality)"
          context={ctx}
          extra={p}
          variant="mixed"
          height={220}
        />
        <CategoryPanel
          module="tariffs"
          metric="muni-nrw"
          title="Non-Revenue Water (Selected Municipality)"
          context={ctx}
          extra={p}
          variant="mixed"
          height={220}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <EntityInfoCard module="tariffs" id={m.id} title="Selected Municipality Information" />
        <div className="grid content-start gap-3">
          <TablePanel
            module="tariffs"
            metric="ranking"
            title="Top 5 Municipalities (Highest Tariff)"
            extra={{ order: 'highest' }}
            selectEntity
          />
          <TablePanel
            module="tariffs"
            metric="ranking"
            title="Top 5 Municipalities (Lowest Tariff)"
            extra={{ order: 'lowest' }}
            selectEntity
          />
        </div>
        <AlertsList limit={7} />
      </Row>
    </div>
  );
}
