import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { MiniMap } from '@/components/map/MiniMap';
import { SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('vegetation');

export default function VegetationForecastPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="vegetation" count={8} />
      <Row className="desk:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="vegetation"
          title="Vegetation Condition Map (Current vs Forecast)"
          layers={[
            { id: 'ndvi', label: 'NDVI (current)' },
            { id: 'ndvi-anomaly', label: 'NDVI anomaly' },
            { id: 'vhi', label: 'Vegetation health' },
            { id: 'forecast-ndvi', label: 'Forecast (12 months)' },
          ]}
          height={460}
        />
        <SeriesPanel
          module="vegetation"
          metric="ndvi"
          forecast
          title="NDVI Forecast (Next 12 Months)"
          tabs={PROVINCE_TABS}
          height={300}
        />
        <SeriesPanel
          module="vegetation"
          metric="recovery-probability"
          forecast
          title="Vegetation Recovery Probability (Next 12 Months)"
          height={300}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <MiniMap
          module="vegetation"
          layer="forecast-anomaly"
          title="Vegetation Anomaly Forecast (Next 12 Months)"
          height={300}
        />
        <TablePanel
          module="vegetation"
          metric="forecast-indicators"
          title="Key Vegetation Forecast Indicators (Next 12 Months)"
        />
        <SeriesPanel
          module="vegetation"
          metric="index-trend"
          title="Vegetation Trend (Current vs Normal Range)"
          tabs={['ndvi', 'evi', 'vci'].map((v) => ({ value: v, label: v.toUpperCase(), params: { index: v } }))}
          height={260}
        />
      </Row>
    </div>
  );
}
