import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CascadeFlow } from '@/components/viz/CascadeFlow';
import { TablePanel } from '@/components/table/TablePanel';
import { CategoryPanel, MatrixPanel, SeriesPanel } from '@/components/charts/panels';
import { Row } from '@/components/layout/Grid';
import { DroughtOutlook } from './DroughtOutlook';
import { DROUGHT_LAYERS, DROUGHT_POINTS } from './layers';
import { isLive } from '@/config/app';

const SPI_INFO = isLive('drought')
  ? 'SPI from the national database (area-weighted district means; the calibration period is not documented yet). Background bands show drought classes D0–D4 (spec §3.4).'
  : 'Gamma-fitted SPI (McKee 1993), 1981–2010 calibration. Background bands show drought classes D0–D4 (spec §3.4).';

const mod = moduleById('drought');

export default function DroughtPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="drought" count={10} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] desk:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
        <MapPanel
          module="drought"
          title="Drought Status Map – South Africa"
          layers={DROUGHT_LAYERS}
          pointLayers={DROUGHT_POINTS}
          tabs={false}
          height={540}
        />
        <CascadeFlow
          module="drought"
          metric="cascade"
          title="Drought Cascade (Current Status)"
          orientation="vertical"
        />
        <TablePanel
          module="drought"
          metric="affected"
          title="Most Affected Provinces / Catchments"
          tabs={[
            { value: 'province', label: 'Provinces', params: { level: 'province' } },
            { value: 'catchment', label: 'Catchments', params: { level: 'catchment' } },
          ]}
          maxHeight={460}
        />
      </div>

      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="drought"
          metric="spi"
          title="SPI – Standardised Precipitation Index"
          info={SPI_INFO}
          tabs={[3, 1, 6, 12, 24].map((k) => ({ value: String(k), label: `${k}-Month`, params: { scale: k } }))}
          height={230}
        />
        <SeriesPanel module="drought" metric="rain-spei" title="Rainfall & SPEI Trends" height={260} />
        <SeriesPanel module="drought" metric="dam-flows" title="Dam Storage, Inflow and Outflow" height={260} />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module="drought"
          metric="gw-sgi"
          title="Groundwater Levels & SGI"
          info="Depth axis is inverted: deeper water levels plot lower."
          height={240}
        />
        <MatrixPanel
          module="drought"
          metric="veg-heatmap"
          title="Vegetation Condition (VCI) by Province"
          height={250}
        />
        <SeriesPanel module="drought" metric="soil-moisture" title="Soil Moisture (Surface & Root-zone)" height={240} />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="drought"
          metric="drought-area"
          title="National Drought Trend (Area %)"
          tabs={[
            { value: '6', label: 'SPI-6', params: { scale: 6 } },
            { value: '3', label: 'SPI-3', params: { scale: 3 } },
            { value: '12', label: 'SPI-12', params: { scale: 12 } },
          ]}
          height={230}
        />
        <SeriesPanel module="drought" metric="storage-vs-spi" title="Reservoir Storage vs Drought Index" height={250} />
        <CategoryPanel
          module="drought"
          metric="severity"
          title="Drought Severity Distribution"
          variant="donut"
          height={250}
        />
        <CategoryPanel
          module="drought"
          metric="province-area"
          title="Drought-affected Area by Province"
          variant="hbar"
          height={250}
        />
      </Row>

      <Row className="xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <DroughtOutlook />
        <TablePanel module="drought" metric="early-warning" title="Drought Early Warning (Next 3 Months)" />
        <TablePanel
          module="drought"
          metric="municipalities"
          title="Top 10 Most Affected Municipalities"
          selectEntity={false}
        />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="drought"
          metric="vegetation"
          title="Vegetation Condition (NDVI / VCI / VHI)"
          height={230}
        />
        <SeriesPanel
          module="drought"
          metric="population-at-risk"
          title="Population in Drought-affected Municipalities"
          height={230}
        />
        <CategoryPanel
          module="drought"
          metric="restrictions"
          title="Water Restrictions by Province"
          variant="stacked100"
          height={230}
        />
        <TablePanel module="drought" metric="sources" title="Data Source Status" />
      </Row>
    </div>
  );
}
