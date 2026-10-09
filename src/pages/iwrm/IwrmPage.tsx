import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';

const mod = moduleById('iwrm');

export const IWRM_LAYERS = [
  { id: 'stress', label: 'Water stress (municipal)' },
  { id: 'wma-stress', label: 'Water stress (WMA)' },
  { id: 'catchment-stress', label: 'Water stress (catchment)' },
  { id: 'availability', label: 'Utilisable yield' },
  { id: 'transfers', label: 'Inter-basin transfers' },
];

export default function IwrmPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="iwrm" count={7} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.25fr)_minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <MapPanel
          module="iwrm"
          title="Integrated Water Resources Map – South Africa"
          layers={IWRM_LAYERS}
          height={520}
        />
        <div className="grid content-start gap-3">
          <CategoryPanel
            module="iwrm"
            metric="waterfall"
            title="Water Balance (Mm³/yr)"
            info="Spec §17.2 anchors: MAR ≈ 49 000, recharge ≈ 19 000, municipal 4 200, agricultural 11 000, industrial 1 800, ecological reserve 2 800 Mm³/yr. Only part of the natural resource is utilisable."
            variant="waterfall"
            height={300}
          />
          <SeriesPanel module="iwrm" metric="availability" title="Water Availability Trends" height={220} />
        </div>
        <div className="grid content-start gap-3">
          <CategoryPanel module="iwrm" metric="sector" title="Water Demand by Sector" variant="donut" height={180} />
          <TablePanel module="iwrm" metric="wmas" title="Balance by Water Management Area" />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel
          module="iwrm"
          metric="reserve-compliance"
          title="Ecological Reserve and Compliance"
          variant="mixed"
          height={230}
        />
        <CategoryPanel
          module="iwrm"
          metric="transfers"
          title="Inter-Basin Transfers (Major Schemes)"
          variant="hbar"
          height={230}
        />
        <CategoryPanel module="iwrm" metric="recycled" title="Recycled and Return Flows" variant="bar" height={230} />
        <SeriesPanel module="iwrm" metric="nrw" title="Non-Revenue Water (Municipal Sector)" height={230} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr]">
        <TablePanel module="iwrm" metric="summary" title="Area Summary (Selected Scope)" />
        <TablePanel module="iwrm" metric="catchments" title="Key Indicators by Catchment (Top 10 by Water Stress)" />
        <AlertsList limit={7} />
      </Row>
    </div>
  );
}
