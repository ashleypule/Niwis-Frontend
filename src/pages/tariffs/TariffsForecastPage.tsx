import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MiniMap } from '@/components/map/MiniMap';
import { MatrixPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('tariffs');

export default function TariffsForecastPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="tariffs" count={8} />
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <MiniMap module="tariffs" layer="tariff" title="Current Average Water Tariffs (R/kL)" height={300} />
        <SeriesPanel
          module="tariffs"
          metric="tariff"
          forecast
          title="Forecasted Average Water Tariff (R/kL)"
          tabs={PROVINCE_TABS}
          height={290}
        />
        <SeriesPanel
          module="tariffs"
          metric="affordability"
          forecast
          title="Household Water Affordability Forecast (% of Income)"
          tabs={PROVINCE_TABS}
          height={290}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="tariffs"
          metric="revenue"
          forecast
          title="Revenue Forecast from Water Tariffs"
          height={260}
        />
        <TablePanel
          module="tariffs"
          metric="forecast-indicators"
          title="Key Water Tariff and Pricing Indicators (National)"
        />
        <MatrixPanel
          module="tariffs"
          metric="province-increase"
          title="Tariff Increase Forecast by Province (Cumulative %)"
          height={260}
        />
      </Row>
    </div>
  );
}
