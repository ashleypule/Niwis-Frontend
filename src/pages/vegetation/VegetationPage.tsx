import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { MiniMap } from '@/components/map/MiniMap';

const mod = moduleById('vegetation');

export const VEG_LAYERS = [
  { id: 'ndvi', label: 'NDVI' },
  { id: 'evi', label: 'EVI' },
  { id: 'savi', label: 'SAVI' },
  { id: 'msavi2', label: 'MSAVI2' },
  { id: 'vci', label: 'VCI' },
  { id: 'vhi', label: 'VHI' },
  { id: 'tci', label: 'TCI' },
  { id: 'vpi', label: 'VPI' },
  { id: 'asi', label: 'ASI' },
  { id: 'svi', label: 'SVI' },
  { id: 'ndwi', label: 'NDWI' },
  { id: 'ndii', label: 'NDII' },
  { id: 'lst', label: 'LST' },
  { id: 'sm', label: 'Soil moisture' },
  { id: 'ndvi-anomaly', label: 'NDVI anomaly' },
];

// `expect`: a live response must contain one of the requested indices (BACKEND_ISSUES #1)
const idxTabs = (sets: [string, string][]) =>
  sets.map(([v, l]) => ({ value: v, label: l, params: { set: v }, expect: v.split(',') }));

export default function VegetationPage() {
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="vegetation" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="vegetation"
          title="Vegetation Condition Map – South Africa"
          layers={VEG_LAYERS}
          height={520}
        />
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="vegetation"
            metric="indices"
            title="Vegetation Indices Time Series"
            tabs={idxTabs([
              ['ndvi,evi,savi,msavi2', 'Greenness'],
              ['vci,vhi,tci', 'Condition'],
              ['ndwi,ndii', 'Water content'],
            ])}
            height={210}
          />
          <SeriesPanel module="vegetation" metric="anomaly" title="Vegetation Anomaly (vs 1981–2010)" height={190} />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="vegetation"
            metric="index-trend"
            title="Indices Trend with Normal Range"
            tabs={['ndvi', 'vci', 'vhi', 'evi', 'savi'].map((v) => ({
              value: v,
              label: v.toUpperCase(),
              params: { index: v },
            }))}
            height={210}
          />
          <CategoryPanel
            module="vegetation"
            metric="classification"
            title="Vegetation Condition Classification"
            variant="donut"
            height={180}
          />
        </div>
      </div>

      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <MiniMap module="vegetation" layer="vci" title="VCI – Vegetation Condition Index" />
        <MiniMap module="vegetation" layer="vhi" title="VHI – Vegetation Health Index" />
        <MiniMap module="vegetation" layer="ndvi-trend" title="Vegetation Trends (Sen's Slope)" />
        <CategoryPanel
          module="vegetation"
          metric="drivers"
          title="Key Drivers of Vegetation Condition"
          variant="hbar"
          height={230}
        />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel
          module="vegetation"
          metric="land-cover"
          title="Vegetation by Land Cover Type"
          tabs={[
            { value: 'ndvi', label: 'Mean NDVI', params: { kind: 'ndvi' } },
            { value: 'share', label: 'Area', params: { kind: 'share' } },
          ]}
          variant="hbar"
          height={230}
        />
        <TablePanel module="vegetation" metric="provinces" title="Top Provinces by Vegetation Health" />
        <CategoryPanel
          module="vegetation"
          metric="by-province"
          title="Vegetation Condition by Province"
          variant="stacked100"
          height={230}
        />
        <CategoryPanel
          module="vegetation"
          metric="seasonal"
          title="Seasonal Vegetation Condition"
          variant="bar"
          height={230}
        />
      </Row>

      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel
          module="vegetation"
          metric="drivers"
          title="Vegetation Drivers and Supporting Variables"
          tabs={[
            { value: 'rain', label: 'Rainfall', params: { var: 'rain' } },
            { value: 'temp', label: 'Temperature', params: { var: 'temp' } },
            { value: 'pet', label: 'PET / ET₀', params: { var: 'pet' } },
            { value: 'sm', label: 'Soil moisture', params: { var: 'sm' } },
          ]}
          height={220}
        />
        <TablePanel
          module="vegetation"
          metric="hotspots"
          title="Vegetation Condition Hotspots (Top 10)"
          className="xl:col-span-2"
        />
        <AlertsList module="drought" limit={5} title="Alerts & Early Warnings" />
      </Row>
    </div>
  );
}
