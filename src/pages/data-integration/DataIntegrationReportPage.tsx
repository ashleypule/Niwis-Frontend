import { Link } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { APP, isMock } from '@/config/app';
import { formatDate } from '@/lib/format';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { MapPanel } from '@/components/map/MapPanel';
import { Card } from '@/components/ui/Card';
import { FlowDiagram } from '@/components/viz/FlowDiagram';
import { QualityRings } from '@/pages/governance/QualityRings';
import { useTable } from '@/api/queries/core';
import { DwsLogo } from '@/components/shell/Brand';
import { PIPELINE } from './architecture';

function Findings() {
  const q = useTable('data-integration', 'pipelines');
  const degraded = q.data?.rows.filter((r) => r.st !== 'Online').map((r) => String(r.p)) ?? [];
  const sections: [string, string[]][] = [
    ['9. Key findings', ['All primary custodians (SAWS, SANSA, DWS, Stats SA, SANBI, municipalities) are connected.', 'Real-time hydro-meteorological feeds meet the 15-minute target.', `Pipelines needing attention: ${degraded.length ? degraded.join(', ') : 'none'}.`]],
    ['10. Challenges', ['Municipal returns (WSNIS) remain intermittent and incomplete.', 'Telemetry outages during load shedding.', 'Inconsistent units and formats in legacy laboratory systems.']],
    ['11. Recommendations', ['Automate validation rules at ingestion for all municipal feeds.', 'Expand borehole telemetry (target: 2 000 strategic boreholes).', 'Enforce NWQMS XML and WaterML 2.0 for new data-sharing agreements.']],
    ['12. Next steps', ['Onboard remaining municipal data providers (target 100%).', 'Integrate CMIP6 scenarios and AI forecast outputs (Phase 3).', 'Launch the public open-data API.']],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {sections.map(([t, items]) => (
        <Card key={t} title={t}>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-ink-2">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Printable "Data Integration Report" (A4 landscape-friendly). */
export default function DataIntegrationReportPage() {
  return (
    <div className="mx-auto max-w-[1500px] bg-canvas p-3 text-ink print:p-0">
      <div className="no-print mb-3 flex items-center justify-between">
        <Link to="/data-integration" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Data Integration
        </Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-ink">
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
      </div>
      <header className="hero mb-3 rounded-xl px-5 py-4 text-white">
        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <DwsLogo />
          <div className="flex-1">
            <p className="text-2xl font-extrabold">NIWIS – Data Integration Report</p>
            <p className="text-sm text-white/80">Unified water data from multiple sources for monitoring, analysis and forecasting</p>
          </div>
          <div className="text-right text-xs text-white/80">
            Generated {formatDate(new Date(), 'datetime')}
            <br />
            Data as of {formatDate(APP.asOf)}
            {isMock && <p className="mt-1 font-semibold text-amber-200">SAMPLE DATA — not for operational decisions</p>}
          </div>
        </div>
      </header>
      <KpiStrip module="data-integration" count={6} />
      <div className="mt-3">
        <Card title="1–2. Data Sources and Integration Architecture">
          <FlowDiagram columns={PIPELINE} compact />
        </Card>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <CategoryPanel module="data-integration" metric="source-status" title="3. Data Source Status" variant="donut" height={170} />
        <CategoryPanel module="data-integration" metric="by-type" title="4. Data by Source Type" variant="hbar" height={190} />
        <QualityRings title="5. Data Quality Overview" />
      </div>
      <div className="print-break mt-3 grid gap-3 md:grid-cols-3">
        <MapPanel module="data-integration" title="6. Integrated Data Map (Source Coverage)" layers={[{ id: 'coverage', label: 'Feeds' }]} tabs={false} height={320} />
        <SeriesPanel module="data-integration" metric="ingestion" title="7. Data Ingestion Trends" height={300} />
        <TablePanel module="data-integration" metric="pipelines" title="8. Pipeline Status" />
      </div>
      <div className="mt-3">
        <Findings />
      </div>
    </div>
  );
}
