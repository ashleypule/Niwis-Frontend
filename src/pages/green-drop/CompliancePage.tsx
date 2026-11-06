import { moduleById, type ModuleId } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { entityNoun, useSelectedEntity } from '@/components/entity/useSelectedEntity';

/** Series keys each Blue Drop parameter group must return (the backend's `group` selector is not honoured yet). */
const MICRO = ['ecoli', 'e_coli', 'coliforms', 'total_coliforms', 'faecal'];
const NUTRIENTS = ['nitrate', 'tds', 'ec', 'sulphate', 'chloride', 'fluoride'];
const METALS = ['lead', 'arsenic', 'iron', 'manganese', 'cadmium', 'chromium', 'mercury'];

/** Shared layout for Green Drop (wastewater) and Blue Drop (drinking water) compliance pages. */
export function CompliancePage({ module }: { module: Extract<ModuleId, 'green-drop' | 'blue-drop'> }) {
  const mod = moduleById(module);
  const green = module === 'green-drop';
  const sel = useSelectedEntity(module);
  const p = { entityId: sel.id };
  // live: one monthly record per district (no WWTW or water-supply-system register in the database)
  const noun = entityNoun(module, green ? 'WWTW' : 'Water Supply System');
  const short = noun === 'District' ? 'District' : green ? 'WWTW' : 'System';
  const plural = noun === 'District' ? 'Districts' : green ? 'WWTWs' : 'Systems';
  const ctx = sel.name ? `[${short}: ${sel.name}]` : undefined;
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module={module} count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module={module}
          title={
            green
              ? `${short === 'District' ? 'Wastewater Effluent' : 'WWTW'} Compliance Status Map – South Africa`
              : 'Drinking Water Compliance Map – South Africa'
          }
          layers={
            green
              ? [
                  { id: 'compliance', label: 'Green Drop status' },
                  { id: 'utilisation', label: 'Treatment capacity / utilisation' },
                  { id: 'municipal', label: 'Municipalities' },
                ]
              : [
                  { id: 'compliance', label: 'Blue Drop status' },
                  { id: 'ecoli', label: 'Microbiological (E. coli)' },
                  { id: 'municipal', label: 'Municipalities' },
                ]
          }
          height={520}
        />
        <div className="grid content-start gap-3">
          <SeriesPanel
            module={module}
            metric="trend"
            title={green ? 'Green Drop Performance Trend (National)' : 'Blue Drop Performance Trend (National)'}
            height={210}
          />
          {green ? (
            <SeriesPanel
              module={module}
              metric="capacity"
              title={`Treatment Capacity and Utilisation (Selected ${short})`}
              context={ctx}
              extra={p}
              height={200}
            />
          ) : (
            <SeriesPanel
              module={module}
              metric="params"
              title="Key Drinking Water Quality Parameters"
              context={ctx}
              extra={{ ...p, group: 'key' }}
              height={200}
            />
          )}
        </div>
        <div className="grid content-start gap-3">
          {green ? (
            <SeriesPanel
              module={module}
              metric="effluent"
              title={`Key Effluent Quality Parameters (Selected ${short})`}
              context={ctx}
              extra={p}
              height={210}
            />
          ) : (
            <SeriesPanel
              module={module}
              metric="params"
              title={`Microbiological Parameters (Selected ${short})`}
              context={ctx}
              extra={p}
              tabs={[{ value: 'micro', label: 'Microbiological', params: { group: 'micro' }, expect: MICRO }]}
              height={210}
            />
          )}
          <CategoryPanel
            module={module}
            metric="breakdown"
            title="Compliance Status Breakdown (National)"
            variant="donut"
            height={170}
          />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        {green ? (
          <>
            <SeriesPanel
              module={module}
              metric="micro"
              title={`Microbiological Quality (Selected ${short})`}
              context={ctx}
              extra={p}
              height={220}
            />
            <SeriesPanel
              module={module}
              metric="receiving"
              title="Receiving Water Quality Impact (Downstream)"
              context={ctx}
              extra={p}
              height={220}
            />
          </>
        ) : (
          <>
            <SeriesPanel
              module={module}
              metric="params"
              title={`Nutrients and Salts (Selected ${short})`}
              context={ctx}
              extra={p}
              tabs={[{ value: 'nutrients', label: 'Nutrients', params: { group: 'nutrients' }, expect: NUTRIENTS }]}
              height={220}
            />
            <SeriesPanel
              module={module}
              metric="params"
              title={`Metals and Trace Elements (Selected ${short})`}
              context={ctx}
              extra={p}
              tabs={[{ value: 'metals', label: 'Metals', params: { group: 'metals' }, expect: METALS }]}
              height={220}
            />
          </>
        )}
        <CategoryPanel
          module={module}
          metric="by-province"
          title={`Mean ${green ? 'Green' : 'Blue'} Drop Score by Province`}
          variant="bar"
          labels
          height={220}
        />
        {green ? (
          <CategoryPanel
            module="green-drop"
            metric="breakdown"
            title={`${plural} by Band`}
            variant="bar"
            height={220}
          />
        ) : (
          <SeriesPanel
            module={module}
            metric="performance"
            title="Treatment Plant Performance"
            context={ctx}
            extra={p}
            height={220}
          />
        )}
      </Row>
      {!green && (
        <Row>
          <CategoryPanel
            module={module}
            metric="param-compliance"
            title={`SANS 241 Compliance by Determinand (All ${plural})`}
            variant="bar"
            labels
            height={220}
          />
        </Row>
      )}
      <Row className="md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_1fr]">
        <EntityInfoCard module={module} id={sel.id} title={`${noun} Information (Selected ${short})`} />
        <TablePanel
          module={module}
          metric="latest"
          title={green ? `Latest Effluent Results (Selected ${short})` : 'Latest Water Quality Results vs SANS 241'}
          extra={p}
        />
        <div className="grid content-start gap-3">
          <TablePanel
            module={module}
            metric="ranking"
            title={`Top 5 ${plural} (Highest Compliance)`}
            extra={{ order: 'top' }}
            selectEntity
          />
          <TablePanel
            module={module}
            metric="ranking"
            title={`Bottom 5 ${plural} (Lowest Compliance)`}
            extra={{ order: 'bottom' }}
            selectEntity
          />
        </div>
        <AlertsList module={module} limit={7} />
      </Row>
    </div>
  );
}
