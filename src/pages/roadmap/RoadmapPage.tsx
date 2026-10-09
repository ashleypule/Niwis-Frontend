import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { PhaseTimeline } from './PhaseTimeline';

export default function RoadmapPage() {
  return (
    <div>
      <KpiStrip module="roadmap" count={6} />
      <Row>
        <PhaseTimeline />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <CategoryPanel module="roadmap" metric="workstreams" title="Progress by Workstream" variant="hbar" height={260} />
        <MapPanel module="roadmap" title="Geographic Implementation Status" layers={[{ id: 'status', label: 'Implementation' }]} tabs={false} height={300} />
        <CategoryPanel module="roadmap" metric="milestones" title="Milestones Status" variant="donut" height={180} />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <CategoryPanel module="roadmap" metric="budget-actual" title="Budget – Planned vs Actual (R million)" variant="bar" height={240} />
        <TablePanel module="roadmap" metric="upcoming" title="Upcoming Milestones" />
        <TablePanel module="roadmap" metric="resources" title="Resource Requirements (spec §24.4)" />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
        <TablePanel module="roadmap" metric="risks" title="Key Risks and Mitigation" />
        <TablePanel module="roadmap" metric="outcomes" title="Expected Outcomes" />
      </Row>
    </div>
  );
}
