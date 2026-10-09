import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('dams');

export default function DamsForecastPage() {
  const dam = useSelectedEntity('dams');
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="dams" count={8} />
      <Row className="desk:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="dams"
          title="Dam and Reservoir Storage Status (Current vs Forecast)"
          layers={[
            { id: 'storage', label: 'Storage level (%)' },
            { id: 'forecast-12', label: 'Forecast in 12 months' },
            { id: 'anomaly', label: 'Change' },
          ]}
          height={440}
        />
        <SeriesPanel module="dams" metric="storage" forecast title="Reservoir Storage Forecast (Next 12 Months)" tabs={PROVINCE_TABS} height={300} />
        <SeriesPanel module="dams" metric="flows" forecast title="Inflow and Outflow Forecast (Next 12 Months)" tabs={PROVINCE_TABS} height={300} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <CategoryPanel module="dams" metric="risk-categories" title="Number of Dams by Risk Category (Forecast)" variant="stacked" height={260} />
        <SeriesPanel module="dams" metric="storage" forecast title="Individual Dam Forecast (Selected Dam)" context={dam.name} extra={{ entityId: dam.id }} height={260} />
        <SeriesPanel module="dams" metric="low-storage-prob" title="Probability of Low Storage (< 30% FSC)" height={260} />
      </Row>
      <Row className="md:grid-cols-2">
        <TablePanel module="dams" metric="key-dams-forecast" title="Key Dams and Reservoirs – Forecast Summary (Next 12 Months)" selectEntity />
        <TablePanel module="dams" metric="risk-outlook" title="Dam and Reservoir Risk Outlook (Next 24 Months)" />
      </Row>
    </div>
  );
}
