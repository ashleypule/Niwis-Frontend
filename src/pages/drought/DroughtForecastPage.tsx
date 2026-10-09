import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { ForecastKpis } from '@/components/kpi/ForecastKpis';
import { YearMap } from '@/components/map/YearMap';
import { MiniMap } from '@/components/map/MiniMap';
import { CategoryPanel, MatrixPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('drought');

export default function DroughtForecastPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <ForecastKpis module="drought" metric="forecast-indicators" icons={['spi', 'areaInDrought', 'storagePct', 'settlementsAtRisk', 'droughtClass']} />
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <MiniMap module="drought" layer="drought-class" title="Current Drought Status (SPI-6, Latest)" height={320} />
        <YearMap module="drought" layer="outlook-3" title="Forecast Drought Status (SPI-3 Outlook)" options={['outlook-1', 'outlook-2', 'outlook-3', 'forecast-6']} paramKey="layer" initial="outlook-3" height={320} />
        <SeriesPanel module="drought" metric="area" forecast title="Drought Area Forecast (% of Area in D1–D4)" tabs={PROVINCE_TABS} height={300} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel module="drought" metric="spi" forecast title="Drought Severity Forecast (SPI-3)" tabs={[3, 6, 12, 24].map((h) => ({ value: String(h), label: `${h} months`, params: { horizon: h } }))} height={260} />
        <SeriesPanel module="drought" metric="settlements" forecast title="Number of Drought-Affected Settlements (Forecast)" height={260} />
        <SeriesPanel module="drought" metric="population" forecast title="Population Affected by Drought (Forecast)" height={260} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <TablePanel module="drought" metric="forecast-indicators" title="Key Drought Forecast Indicators" />
        <MatrixPanel module="drought" metric="province-risk" title="Probability of Severe Drought (D2+) – Province × Horizon" height={280} />
        <SeriesPanel module="drought" metric="recovery-province" title="Drought Recovery Probability (Next 12 Months)" height={260} />
      </Row>
      <Row className="md:grid-cols-2">
        <CategoryPanel module="drought" metric="class-probability" title="Drought Class Probability by Lead Time" variant="stacked" height={240} />
        <TablePanel module="drought" metric="recovery" title="Drought Recovery Outlook" />
      </Row>
    </div>
  );
}
