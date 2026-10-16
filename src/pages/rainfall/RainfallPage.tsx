import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { MiniMap } from '@/components/map/MiniMap';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { DatabaseVariables } from '@/components/charts/DatabaseVariables';
import { entityNoun, useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('rainfall');

export const RAIN_LAYERS = [
  { id: 'total', label: 'Total rainfall' },
  { id: 'anomaly', label: 'Rainfall anomaly' },
  { id: 'monthly', label: 'Monthly rainfall' },
  { id: 'map', label: 'Mean annual (MAP)' },
  { id: 'spi1', label: 'SPI-1' },
  { id: 'spi3', label: 'SPI-3' },
  { id: 'spi6', label: 'SPI-6' },
  { id: 'spi12', label: 'SPI-12' },
  { id: 'spei6', label: 'SPEI-6' },
  { id: 'r20', label: 'R20mm days' },
  { id: 'cdd', label: 'Consecutive dry days' },
  { id: 'municipal-total', label: 'By municipality' },
];

export default function RainfallPage() {
  const station = useSelectedEntity('rainfall');
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="rainfall" count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="rainfall"
          title="Rainfall Distribution Map – South Africa"
          layers={RAIN_LAYERS}
          height={520}
        />
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="rainfall"
            metric="monthly"
            title="Monthly Rainfall – Current vs Previous Years"
            height={220}
          />
          <SeriesPanel
            module="rainfall"
            metric="anomaly"
            title="Rainfall Anomaly (vs 1981–2010)"
            tabs={[1, 3, 6, 12].map((k) => ({ value: String(k), label: `${k}-Month`, params: { window: k } }))}
            height={180}
          />
        </div>
        <div className="grid content-start gap-3">
          <TablePanel module="rainfall" metric="provinces" title="Rainfall by Province (12 Months)" />
          <TablePanel
            module="rainfall"
            metric="extremes"
            title="Top 5 Wettest & Driest Locations"
            tabs={[
              { value: 'w', label: 'Wettest', params: { kind: 'wettest' } },
              { value: 'd', label: 'Driest', params: { kind: 'driest' } },
            ]}
          />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel module="rainfall" metric="spi-spei" title="SPI and SPEI Trends" height={240} />
        <SeriesPanel module="rainfall" metric="intensity" title="Rainfall Intensity and Extreme Events" height={240} />
        <CategoryPanel
          module="rainfall"
          metric="seasonal"
          title="Seasonal Rainfall Distribution (DJF / MAM / JJA / SON)"
          variant="bar"
          height={240}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <SeriesPanel module="rainfall" metric="dry-wet" title="Consecutive Dry and Wet Days" height={230} />
        <CategoryPanel
          module="rainfall"
          metric="events"
          title="Extreme Rainfall Events"
          tabs={[
            { value: 'count', label: 'Event count', params: { kind: 'count' } },
            { value: 'max', label: 'Maximum 1-day rainfall', params: { kind: 'max' } },
          ]}
          variant="bar"
          height={210}
        />
        <MiniMap module="rainfall" layer="cdd" title="Consecutive Dry Days (Current)" />
        <SeriesPanel
          module="rainfall"
          metric="station"
          title={`Rainfall Indices Time Series (Selected ${entityNoun('rainfall')})`}
          context={station.name}
          extra={{ entityId: station.id }}
          enabled={!!station.id}
          blockedBy={station.list}
          height={230}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1fr_1.3fr_1fr]">
        <TablePanel module="rainfall" metric="sources" title="Rainfall Data Sources and Coverage" />
        <TablePanel module="rainfall" metric="statistics" title="Rainfall Statistics (Selected Area)" />
        <AlertsList module="drought" limit={5} />
      </Row>
      <Row className="md:grid-cols-3">
        <MiniMap module="rainfall" layer="forecast-1" title="Rainfall Outlook – Month 1" />
        <MiniMap module="rainfall" layer="forecast-2" title="Rainfall Outlook – Month 2" />
        <MiniMap module="rainfall" layer="forecast-3" title="Rainfall Outlook – Month 3" />
      </Row>
      <DatabaseVariables module="rainfall" />
    </div>
  );
}
