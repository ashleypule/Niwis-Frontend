import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MiniMap } from '@/components/map/MiniMap';
import { SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('rainfall');

export default function RainfallForecastPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="rainfall" count={8} />
      <Row className="md:grid-cols-3">
        <MiniMap module="rainfall" layer="forecast-1" title="Rainfall Outlook – Month 1" height={300} />
        <MiniMap module="rainfall" layer="forecast-2" title="Rainfall Outlook – Month 2" height={300} />
        <MiniMap module="rainfall" layer="forecast-3" title="Rainfall Outlook – Month 3" height={300} />
      </Row>
      <Row className="md:grid-cols-2">
        <SeriesPanel
          module="rainfall"
          metric="rainfall"
          forecast
          title="Monthly Rainfall Forecast (Next 6 Months)"
          tabs={PROVINCE_TABS}
          height={280}
        />
        <SeriesPanel module="rainfall" metric="spi" forecast title="SPI-6 Forecast" tabs={PROVINCE_TABS} height={280} />
      </Row>
      <Row className="md:grid-cols-2">
        <TablePanel module="drought" metric="early-warning" title="Rainfall-related Early Warning (Next 3 Months)" />
        <TablePanel module="rainfall" metric="provinces" title="Current Rainfall by Province (Baseline for Outlook)" />
      </Row>
    </div>
  );
}
