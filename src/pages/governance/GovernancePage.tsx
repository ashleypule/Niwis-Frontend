import { BadgeCheck, Database, FileCheck2, Globe2, Lock, ScrollText, ShieldCheck, Workflow } from 'lucide-react';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Card } from '@/components/ui/Card';
import { Row } from '@/components/layout/Grid';
import { FlowDiagram, type FlowColumn } from '@/components/viz/FlowDiagram';
import { QualityRings } from './QualityRings';
import { MetaIssuesTable, MetaVariablesTable } from '@/pages/data-integration/MetaPanels';
import { APP, showProvenance } from '@/config/app';

const META = showProvenance && APP.liveMeta;

const FLOW: FlowColumn[] = [
  { title: 'Data sources', color: '#1565C0', items: [{ title: 'SAWS, SANSA, DWS, municipalities, labs, Stats SA' }] },
  { title: 'Ingestion', color: '#2E7D32', items: [{ title: 'APIs, MQTT, ETL, file uploads, DB connectors' }] },
  {
    title: 'Quality control',
    color: '#F2A900',
    items: [{ title: 'Validation, range checks, gap filling, outlier detection' }],
  },
  { title: 'Processing', color: '#7B1FA2', items: [{ title: 'Spatial/temporal fusion, standardisation, indicators' }] },
  {
    title: 'Data lake & storage',
    color: '#C62828',
    items: [{ title: 'Raw, processed, geospatial (PostGIS), metadata' }],
  },
  { title: 'Analytics & AI', color: '#0D47A1', items: [{ title: 'Forecasting, risk models, dashboards' }] },
  { title: 'Delivery', color: '#13233A', items: [{ title: 'Web portal, APIs, GIS services, reports, alerts' }] },
];

const LINEAGE: FlowColumn[] = [
  {
    title: 'Source',
    color: '#1565C0',
    items: [{ title: 'DWS telemetry (WISKI)', lines: ['Dam water level, 15-min'] }],
  },
  { title: 'Ingestion', color: '#2E7D32', items: [{ title: 'API / MQTT', lines: ['Raw zone, immutable'] }] },
  {
    title: 'Processing',
    color: '#F2A900',
    items: [{ title: 'QC, gap filling', lines: ['Level → volume via rating table'] }],
  },
  {
    title: 'Storage',
    color: '#7B1FA2',
    items: [{ title: 'PostGIS / data lake', lines: ['Versioned, ISO 19115 metadata'] }],
  },
  { title: 'Usage', color: '#C62828', items: [{ title: 'Dam module, AI forecasts, reports' }] },
];

const POLICIES = [
  { icon: ScrollText, label: 'NIWIS data standards' },
  { icon: Database, label: 'ISO 19115 metadata' },
  { icon: Workflow, label: 'WaterML 2.0' },
  { icon: FileCheck2, label: 'NWQMS schema' },
  { icon: Globe2, label: 'OGC GIS standards' },
  { icon: Lock, label: 'POPIA compliance' },
  { icon: BadgeCheck, label: 'Data licensing (MOUs)' },
  { icon: ShieldCheck, label: 'Audit trails (7 years)' },
];

export default function GovernancePage() {
  return (
    <div>
      <KpiStrip module="governance" count={8} />
      <Row className="desk:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <MapPanel
          module="governance"
          title="Data Provider Network – South Africa"
          layers={[{ id: 'providers', label: 'Providers' }]}
          tabs={false}
          height={420}
        />
        <div className="grid content-start gap-3">
          <Card title="Data Flow Overview (Real-time, Near Real-time & Batch)" provenance={null}>
            <FlowDiagram columns={FLOW} compact />
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            <QualityRings title="Data Quality Metrics" />
            <CategoryPanel
              module="governance"
              metric="standards"
              title="Compliance with Data Standards"
              variant="hbar"
              height={210}
            />
          </div>
        </div>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        <CategoryPanel
          module="governance"
          metric="inventory"
          title="Dataset Inventory by Theme"
          variant="bar"
          labels
          height={230}
        />
        <CategoryPanel
          module="governance"
          metric="frequency"
          title="Data Update Frequency"
          variant="donut"
          height={180}
        />
        <CategoryPanel
          module="governance"
          metric="metadata"
          title="Metadata Completeness"
          variant="donut"
          height={180}
        />
        <CategoryPanel module="governance" metric="access" title="Data Access Overview" variant="donut" height={180} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1.2fr]">
        {META ? (
          <MetaIssuesTable />
        ) : (
          <TablePanel module="governance" metric="issues" title="Recent Data Quality Issues" />
        )}
        <TablePanel module="governance" metric="usage" title="Data Access and Usage (Top 5)" />
        <div className="grid content-start gap-3">
          <Card title="Data Lineage (Example: Dam Storage)" provenance={null}>
            <FlowDiagram columns={LINEAGE} compact />
          </Card>
        </div>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Standards and Policies" provenance={null}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POLICIES.map((p) => {
              const Icon = p.icon;
              return (
                <li
                  key={p.label}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-line p-3 text-center"
                >
                  <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  <span className="text-xs font-medium text-ink-2">{p.label}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <TablePanel module="governance" metric="retention" title="Data Retention and Archiving Policy" />
      </Row>
      {META && (
        <Row>
          <MetaVariablesTable />
        </Row>
      )}
      <Row>
        <TablePanel module="governance" metric="providers" title="Data Ownership and Access Framework – Providers" />
      </Row>
    </div>
  );
}
