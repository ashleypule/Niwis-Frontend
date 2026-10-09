import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';

const mod = moduleById('water-quantity');

export default function WaterQuantityPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="water-quantity" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)]">
        <MapPanel
          module="water-quantity"
          title="Water Quantity Status Map – South Africa"
          layers={[
            { id: 'availability', label: 'Total availability' },
            { id: 'catchment-stress', label: 'Water balance / stress' },
            { id: 'demand-density', label: 'Demand' },
            { id: 'transfers', label: 'Transfers' },
            { id: 'storage', label: 'Dam storage', module: 'dams' },
          ]}
          height={520}
        />
        <div className="grid content-start gap-3">
          <CategoryPanel module="water-quantity" metric="waterfall" title="National Water Balance incl. Transfers and System Losses (Mm³/yr)" variant="waterfall" height={300} />
          <div className="grid gap-3 md:grid-cols-2">
            <SeriesPanel module="water-quantity" metric="surface" title="Surface Water Quantity (Selected Area)" height={200} />
            <SeriesPanel module="water-quantity" metric="groundwater" title="Groundwater Quantity (Selected Area)" height={200} />
          </div>
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="water-quantity" metric="storage" title="Storage Levels of Major Dams (Selected Area)" height={230} />
        <CategoryPanel module="water-quantity" metric="sector" title="Sectoral Water Demand" variant="stacked" height={230} />
        <CategoryPanel module="water-quantity" metric="allocation" title="Allocation Utilisation" variant="mixed" height={230} />
        <CategoryPanel module="water-quantity" metric="transfers" title="Inter-Basin Transfers" variant="hbar" height={230} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
        <TablePanel module="water-quantity" metric="summary" title="Area Information (Selected Scope)" />
        <TablePanel module="water-quantity" metric="catchments" title="Stressed Catchments (Top 10 by Water Stress)" />
        <AlertsList module="dams" limit={7} />
      </Row>
    </div>
  );
}
