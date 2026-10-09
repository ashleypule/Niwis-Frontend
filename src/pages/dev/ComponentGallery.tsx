import { KpiCard } from '@/components/kpi/KpiCard';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, MatrixPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { AlertsList } from '@/components/alerts/AlertsList';
import { CascadeFlow } from '@/components/viz/CascadeFlow';
import { RingGauge } from '@/components/viz/RingGauge';
import { HBarList } from '@/components/viz/HBarList';
import { FlowDiagram } from '@/components/viz/FlowDiagram';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';
import { EChart } from '@/components/charts/EChart';
import { gaugeOption } from '@/components/charts/options';
import { useChartTheme } from '@/components/charts/theme';
import { MatrixLegend } from '@/components/charts/MatrixLegend';
import { SCALES } from '@/config/palettes';
import { Row } from '@/components/layout/Grid';
import { PhaseTimeline } from '@/pages/roadmap/PhaseTimeline';
import { PIPELINE } from '@/pages/data-integration/architecture';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** /dev/components — every building block rendered with live mock data. */
export default function ComponentGallery() {
  const t = useChartTheme();
  return (
    <div>
      <p className="text-sm text-muted">Developer gallery of NIWIS building blocks (mock data). Not linked from the navigation.</p>
      <Section title="KpiCard — semantic deltas (goodDirection)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard kpi={{ id: 'a', metric: 'storagePct', label: 'Dam storage rising', value: 71.2, delta: 2.4, deltaLabel: 'up is good → green', spark: [60, 62, 65, 68, 70, 71] }} />
          <KpiCard kpi={{ id: 'b', metric: 'ecoli', label: 'E. coli rising', value: 1240, delta: 310, deltaLabel: 'up is bad → red', spark: [400, 520, 800, 950, 1100, 1240] }} />
          <KpiCard kpi={{ id: 'c', metric: 'droughtClass', label: 'Drought class', value: null, text: 'D2', status: { scale: 'drought', id: 'D2', label: 'Severe Drought' } }} />
          <KpiCard kpi={{ id: 'd', metric: 'tmean', label: 'Neutral metric', value: 18.4, delta: 0.3, deltaLabel: 'neutral → grey' }} />
        </div>
      </Section>
      <Section title="KpiStrip">
        <KpiStrip module="dams" count={8} />
      </Section>
      <Section title="MapPanel (grid, choropleth, points)">
        <MapPanel
          module="drought"
          title="Map panel"
          layers={[
            { id: 'spi3', label: 'Grid (SPI-3)' },
            { id: 'municipal-class', label: 'Choropleth' },
            { id: 'dams', label: 'Points' },
          ]}
          height={420}
        />
      </Section>
      <Section title="Chart presets">
        <Row className="md:grid-cols-2 xl:grid-cols-3">
          <SeriesPanel module="dams" metric="storage-trend" title="Time series with min–max band" />
          <SeriesPanel module="dams" metric="storage" forecast title="Forecast with divider and p10–p90 band" />
          <SeriesPanel module="drought" metric="rain-spei" title="Dual axis" />
          <SeriesPanel module="drought" metric="drought-area" title="Stacked area" />
          <SeriesPanel module="drought" metric="rain-anomaly" title="Anomaly bars" />
          <MatrixPanel module="drought" metric="veg-heatmap" title="Heatmap" />
          <CategoryPanel module="iwrm" metric="waterfall" title="Waterfall" variant="waterfall" />
          <CategoryPanel module="dams" metric="distribution" title="Donut" variant="donut" height={180} />
          <Card title="Gauge">
            <EChart option={gaugeOption(0.48, t, { min: 0, max: 1.2, scale: 'exploitation', label: 'Exploitation index' })} height={220} ariaLabel="Gauge" />
          </Card>
          <SeriesPanel module="runoff" metric="fdc" title="Flow duration curve (log scale)" />
          <SeriesPanel module="drought" metric="storage-vs-spi" title="Scatter" />
          <CategoryPanel module="water-quality" metric="param-range" title="Range / box (log scale)" variant="range" log />
        </Row>
      </Section>
      <Section title="DataTable, EntityInfoCard, AlertsList">
        <Row className="md:grid-cols-3">
          <TablePanel module="dams" metric="top10" title="DataTable" selectEntity />
          <EntityInfoCard module="dams" id="dam-gariep" title="EntityInfoCard" />
          <AlertsList limit={6} />
        </Row>
      </Section>
      <Section title="CascadeFlow">
        <CascadeFlow module="drought" metric="cascade" title="Drought cascade" />
      </Section>
      <Section title="RingGauge, HBarList, Pills, Buttons">
        <Row className="md:grid-cols-3">
          <Card title="RingGauge">
            <div className="flex gap-4">
              <RingGauge value={96} label="Completeness" />
              <RingGauge value={78} label="Timeliness" />
              <RingGauge value={55} label="Validity" />
            </div>
          </Card>
          <Card title="HBarList">
            <HBarList items={[{ label: 'Vaal', value: 82 }, { label: 'Orange', value: 64 }, { label: 'Berg-Olifants', value: 38 }, { label: 'Breede-Gouritz', value: 21 }]} scale="storage" />
          </Card>
          <Card title="Pills & buttons">
            <div className="flex flex-wrap gap-1.5">
              {SCALES.drought.bins.map((b) => (
                <Pill key={b.id} scale="drought" value={b.id!} />
              ))}
              {['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'].map((x) => (
                <Pill key={x} scale="wqi" value={x} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="action">Action</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </Card>
        </Row>
      </Section>
      <Section title="Colour scales (config/palettes.ts)">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Object.values(SCALES).map((s) => (
            <Card key={s.id} title={s.title}>
              <MatrixLegend scale={s.id} />
            </Card>
          ))}
        </div>
      </Section>
      <Section title="PhaseTimeline & ArchitectureDiagram">
        <PhaseTimeline />
        <div className="mt-3">
          <Card title="Architecture diagram">
            <FlowDiagram columns={PIPELINE} compact />
          </Card>
        </div>
      </Section>
    </div>
  );
}
