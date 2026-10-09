import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MiniMap } from '@/components/map/MiniMap';
import { MatrixPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('settlements');

export default function SettlementsForecastPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="settlements" count={7} />
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <MiniMap module="settlements" layer="risk" title="Current Settlement Risk" height={300} />
        <MiniMap
          module="drought"
          layer="forecast-6"
          title="Drought Outlook Driving Settlement Risk (+6 months)"
          height={300}
        />
        <TablePanel module="settlements" metric="forecast-indicators" title="Key Settlement Forecast Indicators" />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="settlements"
          metric="settlements"
          forecast
          title="Drought-Affected Settlements Forecast"
          tabs={PROVINCE_TABS}
          height={270}
        />
        <SeriesPanel
          module="settlements"
          metric="population"
          forecast
          title="Population Affected Forecast"
          tabs={PROVINCE_TABS}
          height={270}
        />
        <MatrixPanel
          module="settlements"
          metric="province-horizon"
          title="Share of Settlements Affected – Province × Horizon"
          height={270}
        />
      </Row>
    </div>
  );
}
