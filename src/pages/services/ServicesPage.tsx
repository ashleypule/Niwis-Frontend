import { moduleById } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

const mod = moduleById('services');

export const SERVICE_LAYERS = [
  { id: 'coverage', label: 'Piped water access' },
  { id: 'rdp', label: 'Basic (RDP) access' },
  { id: 'sanitation', label: 'Sanitation access' },
  { id: 'reliability', label: 'Service reliability' },
  { id: 'nrw', label: 'NRW' },
  { id: 'asset-condition', label: 'Asset condition' },
];

export default function ServicesPage() {
  const m = useSelectedEntity('services');
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module="services" count={9} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module="services"
          title="Water Services Coverage Map – South Africa"
          layers={SERVICE_LAYERS}
          pointLayers={[
            { id: 'wtp', label: 'Water treatment plants', module: 'services', layer: 'wtp', shape: 'square' },
            {
              id: 'wwtw',
              label: 'Wastewater treatment works',
              module: 'green-drop',
              layer: 'compliance',
              shape: 'triangle',
            },
          ]}
          height={520}
        />
        <div className="grid content-start gap-3">
          <CategoryPanel
            module="services"
            metric="coverage"
            title="Service Level Coverage (National)"
            variant="bar"
            height={210}
          />
          <SeriesPanel module="services" metric="nrw" title="Non-Revenue Water (NRW) Trend" height={200} />
        </div>
        <div className="grid content-start gap-3">
          <SeriesPanel
            module="services"
            metric="plant-performance"
            title="Water Treatment Plant Performance"
            extra={{ kind: 'wtp' }}
            height={210}
          />
          <SeriesPanel
            module="services"
            metric="plant-performance"
            title="Wastewater Treatment Works Performance"
            extra={{ kind: 'wwtw' }}
            height={200}
          />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel
          module="services"
          metric="asset-condition"
          title="Infrastructure Asset Condition"
          variant="donut"
          height={180}
        />
        <SeriesPanel
          module="services"
          metric="interruptions"
          title="Service Interruptions (Planned vs Unplanned)"
          height={220}
        />
        <CategoryPanel
          module="services"
          metric="maintenance"
          title="Maintenance Status (Work Orders)"
          variant="donut"
          height={180}
        />
        <CategoryPanel
          module="services"
          metric="service-levels"
          title="Water Service Levels by Province"
          variant="stacked100"
          height={220}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel
          module="services"
          metric="pipelines"
          title="Pipeline Network by Diameter"
          variant="hbar"
          height={220}
        />
        <CategoryPanel
          module="services"
          metric="urban-rural"
          title="Urban vs Rural Coverage"
          variant="bar"
          height={220}
        />
        <CategoryPanel
          module="services"
          metric="projects"
          title="Planned vs Completed Projects"
          variant="bar"
          height={220}
        />
        <TablePanel module="services" metric="plants" title="Top 10 Treatment Works by Capacity" />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <EntityInfoCard module="services" id={m.id} title="Selected Municipality Information" />
        <TablePanel
          module="services"
          metric="nrw"
          title="Top 5 Municipalities (Highest NRW)"
          extra={{ order: 'highest' }}
          selectEntity
        />
        <TablePanel
          module="services"
          metric="nrw"
          title="Top 5 Municipalities (Lowest NRW)"
          extra={{ order: 'lowest' }}
          selectEntity
        />
      </Row>
    </div>
  );
}
