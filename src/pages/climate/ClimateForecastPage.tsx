import { useState } from 'react';
import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Tabs } from '@/components/ui/Card';
import { Row } from '@/components/layout/Grid';
import { ForecastKpis } from '@/components/kpi/ForecastKpis';
import { YearMap } from '@/components/map/YearMap';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

const mod = moduleById('climate');

export default function ClimateForecastPage() {
  const [scenario, setScenario] = useState('rcp85');
  const p = { scenario };
  return (
    <div>
      <PageTabs mod={mod} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink-2">Emission scenario</span>
        <Tabs
          label="Scenario"
          size="md"
          value={scenario}
          onChange={setScenario}
          options={[
            { value: 'rcp45', label: 'RCP 4.5 (moderate)' },
            { value: 'rcp85', label: 'RCP 8.5 (high)' },
          ]}
        />
      </div>
      <ForecastKpis module="climate" metric="forecast-summary" extra={p} />
      <Row className="md:grid-cols-2">
        <SeriesPanel
          module="climate"
          metric="temp-anomaly"
          forecast
          title="Temperature Anomaly Forecast (Next 12 Months)"
          tabs={PROVINCE_TABS}
          height={280}
        />
        <SeriesPanel
          module="climate"
          metric="hot-days"
          forecast
          title="Hot Days Forecast (Tmax > 35 °C, Next 12 Months)"
          tabs={PROVINCE_TABS}
          height={280}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <YearMap module="climate" layer="proj-temp" title="Projected Temperature Change (°C)" params={p} />
        <YearMap module="climate" layer="proj-rain" title="Projected Annual Rainfall Change (%)" params={p} />
        <SeriesPanel
          module="climate"
          metric="indicator-trends"
          title="Key Climate Indicators – Trends & Forecasts"
          extra={p}
          height={300}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <CategoryPanel
          module="climate"
          metric="projection-bars"
          title="Extreme Heat Days (days per year)"
          extra={{ ...p, kind: 'heat' }}
          variant="bar"
          labels
          height={220}
        />
        <CategoryPanel
          module="climate"
          metric="projection-bars"
          title="Drought Frequency (events / decade)"
          extra={{ ...p, kind: 'drought' }}
          variant="bar"
          labels
          height={220}
        />
        <CategoryPanel
          module="climate"
          metric="projection-bars"
          title="Extreme Rainfall Events (% change)"
          extra={{ ...p, kind: 'extreme' }}
          variant="bar"
          labels
          height={220}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <YearMap module="climate" layer="proj-spi" title="Projected SPI Change (Drought Risk)" params={p} />
        <YearMap
          module="climate"
          layer="proj-availability"
          title="Projected Water Availability Change (%)"
          params={p}
        />
        <TablePanel module="climate" metric="forecast-summary" title="Climate Indicator Forecast Summary" extra={p} />
        <TablePanel module="climate" metric="risk-outlook" title="Climate Risk Outlook (2050)" extra={p} />
      </Row>
      <Row>
        <SeriesPanel
          module="climate"
          metric="projections"
          title="Temperature and Rainfall Projections to 2100"
          tabs={[
            { value: 't', label: 'Temperature', params: { var: 'temperature' } },
            { value: 'r', label: 'Rainfall', params: { var: 'rainfall' } },
          ]}
          height={300}
        />
      </Row>
    </div>
  );
}
