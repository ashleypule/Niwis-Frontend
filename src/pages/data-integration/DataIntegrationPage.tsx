import { inkFor } from '@/config/palettes';
import { useState } from 'react';
import { Link } from 'react-router';
import { FileText } from 'lucide-react';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Card, Tabs } from '@/components/ui/Card';
import { Row } from '@/components/layout/Grid';
import { FlowDiagram } from '@/components/viz/FlowDiagram';
import { QualityRings } from '@/pages/governance/QualityRings';
import { LAYERS8, PIPELINE } from './architecture';
import { MetaCoverageTable, MetaPipelineTable, MetaSourceStatus } from './MetaPanels';
import { APP, showProvenance } from '@/config/app';

/** Hybrid / api mode: panels the backend's /meta endpoints can fill truthfully. */
const META = showProvenance && APP.liveMeta;

export function LayeredArchitecture() {
  return (
    <ol className="space-y-1.5" aria-label="Eight-layer architecture">
      {LAYERS8.map((l) => (
        <li key={l.n} className="flex items-stretch overflow-hidden rounded-lg border border-line">
          <span
            className="flex w-10 shrink-0 items-center justify-center text-sm font-bold"
            style={{ background: l.color, color: inkFor(l.color) }}
          >
            {l.n}
          </span>
          <div className="flex-1 bg-surface-2 px-3 py-2">
            <p className="text-[13px] font-semibold text-ink">{l.name}</p>
            <p className="text-xs text-ink-2">{l.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DataIntegrationPage() {
  const [view, setView] = useState<'pipeline' | 'layers'>('pipeline');
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Link
          to="/data-integration/report"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2"
        >
          <FileText className="h-4 w-4" /> Data Integration Report (printable)
        </Link>
      </div>
      <KpiStrip module="data-integration" count={6} />
      <Row className="desk:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Card
          title="Data Integration Architecture"
          provenance={null}
          actions={
            <Tabs
              label="Architecture view"
              value={view}
              onChange={setView}
              options={[
                { value: 'pipeline', label: 'Pipeline view' },
                { value: 'layers', label: '8-layer view' },
              ]}
            />
          }
        >
          {view === 'pipeline' ? <FlowDiagram columns={PIPELINE} compact /> : <LayeredArchitecture />}
        </Card>
        <div className="grid content-start gap-3">
          {META ? (
            <MetaSourceStatus />
          ) : (
            <CategoryPanel
              module="data-integration"
              metric="source-status"
              title="Data Source Status"
              variant="donut"
              height={170}
            />
          )}
          <CategoryPanel
            module="data-integration"
            metric="by-type"
            title="Data by Source Type"
            variant="hbar"
            height={200}
          />
        </div>
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr]">
        <MapPanel
          module="data-integration"
          title="Integrated Data Map (Source Coverage)"
          layers={[{ id: 'coverage', label: 'Data feeds' }]}
          tabs={false}
          height={380}
        />
        <SeriesPanel
          module="data-integration"
          metric="ingestion"
          title="Data Ingestion Trends (Last 12 Months)"
          height={300}
        />
        <div className="grid content-start gap-3">
          <QualityRings />
          {!META && (
            <TablePanel module="data-integration" metric="pipelines" title="Data Integration Pipeline Status" />
          )}
        </div>
      </Row>
      {META && (
        <Row className="xl:grid-cols-2">
          <MetaPipelineTable title="Data Integration Pipeline Status (National Database)" />
          <MetaCoverageTable />
        </Row>
      )}
      <Row>
        <TablePanel module="data-integration" metric="providers" title="Data Providers and Interfaces" />
      </Row>
    </div>
  );
}
