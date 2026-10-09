import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('water-quality');

export default function WaterQualityForecastPage() {
  const st = useSelectedEntity('water-quality');
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="water-quality" count={8} />
      <Row className="desk:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="water-quality"
          title="Current Water Quality Status (WQI – Latest Observations)"
          layers={[
            { id: 'wqi', label: 'WQI (current)' },
            { id: 'forecast-wqi', label: 'WQI (12-month forecast)' },
            { id: 'nitrate', label: 'Nitrate' },
            { id: 'phosphate', label: 'Phosphate' },
            { id: 'turbidity', label: 'Turbidity' },
            { id: 'do', label: 'Dissolved oxygen' },
            { id: 'ecoli', label: 'E. coli' },
          ]}
          height={460}
        />
        <SeriesPanel
          module="water-quality"
          metric="wqi"
          forecast
          title="WQI Forecast (National Average)"
          tabs={[3, 6, 12, 24].map((h) => ({ value: String(h), label: `${h} months`, params: { horizon: h } }))}
          height={300}
        />
        <SeriesPanel
          module="water-quality"
          metric="params"
          forecast
          title="Key Water Quality Parameters Forecast"
          height={300}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <TablePanel
          module="water-quality"
          metric="forecast-indicators"
          title="Key Water Quality Indicators (National Average)"
          className="xl:col-span-1"
        />
        <CategoryPanel
          module="water-quality"
          metric="risk-outlook"
          title="Water Quality Risk Outlook (Next 12 Months)"
          variant="stacked100"
          height={260}
        />
        <SeriesPanel
          module="water-quality"
          metric="ecoli-catchment"
          forecast
          title="E. coli Forecast (Selected Station)"
          context={st.name}
          extra={{ entityId: st.id }}
          height={260}
        />
      </Row>
      <Row>
        <SeriesPanel
          module="water-quality"
          metric="wqi"
          forecast
          title="Water Quality Forecast by Province (WQI)"
          tabs={PROVINCE_TABS}
          height={260}
        />
      </Row>
    </div>
  );
}
