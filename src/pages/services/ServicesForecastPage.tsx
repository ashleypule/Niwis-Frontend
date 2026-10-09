import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { MiniMap } from '@/components/map/MiniMap';
import { Row } from '@/components/layout/Grid';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('services');

export default function ServicesForecastPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="services" count={9} />
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel module="services" metric="nrw" forecast title="Non-Revenue Water Forecast (24 Months)" tabs={PROVINCE_TABS} height={280} />
        <SeriesPanel module="services" metric="coverage" forecast title="Piped Water Access Forecast" tabs={PROVINCE_TABS} height={280} />
        <SeriesPanel module="services" metric="demand" forecast title="Municipal Water Demand Forecast" tabs={PROVINCE_TABS} height={280} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <MiniMap module="services" layer="reliability" title="Current Supply Reliability (Forecast Baseline)" height={300} />
        <TablePanel module="services" metric="nrw" title="Municipalities Most at Risk (Highest NRW)" extra={{ order: 'highest' }} />
        <SeriesPanel module="services" metric="interruptions" title="Service Interruptions (Recent Trend)" height={260} />
      </Row>
    </div>
  );
}
