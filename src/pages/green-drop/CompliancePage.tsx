import { moduleById, type ModuleId } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { CategoryPanel, SeriesPanel } from '@/components/charts/panels';
import { TablePanel } from '@/components/table/TablePanel';
import { EntityInfoCard } from '@/components/entity/EntityInfoCard';
import { AlertsList } from '@/components/alerts/AlertsList';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';

/** Shared layout for Green Drop (wastewater) and Blue Drop (drinking water) compliance pages. */
export function CompliancePage({ module }: { module: Extract<ModuleId, 'green-drop' | 'blue-drop'> }) {
  const mod = moduleById(module);
  const green = module === 'green-drop';
  const sel = useSelectedEntity(module);
  const p = { entityId: sel.id };
  const ctx = sel.name ? `[${green ? 'WWTW' : 'System'}: ${sel.name}]` : undefined;
  const noun = green ? 'WWTW' : 'Water Supply System';
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module={module} count={8} />
      <div className="mt-3 grid gap-3 desk:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <MapPanel
          module={module}
          title={green ? 'WWTW Compliance Status Map – South Africa' : 'Drinking Water Compliance Map – South Africa'}
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
          <SeriesPanel module={module} metric="trend" title={green ? 'Green Drop Performance Trend (National)' : 'Blue Drop Performance Trend (National)'} height={210} />
          {green ? (
            <SeriesPanel module={module} metric="capacity" title="Treatment Capacity and Utilisation (Selected WWTW)" context={ctx} extra={p} height={200} />
          ) : (
            <SeriesPanel module={module} metric="params" title="Key Drinking Water Quality Parameters" context={ctx} extra={{ ...p, group: 'key' }} height={200} />
          )}
        </div>
        <div className="grid content-start gap-3">
          {green ? (
            <SeriesPanel module={module} metric="effluent" title="Key Effluent Quality Parameters (Selected WWTW)" context={ctx} extra={p} height={210} />
          ) : (
            <SeriesPanel module={module} metric="params" title="Microbiological Parameters (Selected System)" context={ctx} extra={{ ...p, group: 'micro' }} height={210} />
          )}
          <CategoryPanel module={module} metric="breakdown" title="Compliance Status Breakdown (National)" variant="donut" height={170} />
        </div>
      </div>
      <Row className="md:grid-cols-2 xl:grid-cols-4">
        {green ? (
          <>
            <SeriesPanel module={module} metric="micro" title="Microbiological Quality (Selected WWTW)" context={ctx} extra={p} height={220} />
            <SeriesPanel module={module} metric="receiving" title="Receiving Water Quality Impact (Downstream)" context={ctx} extra={p} height={220} />
          </>
        ) : (
          <>
            <SeriesPanel module={module} metric="params" title="Nutrients and Salts (Selected System)" context={ctx} extra={{ ...p, group: 'nutrients' }} height={220} />
            <SeriesPanel module={module} metric="params" title="Metals and Trace Elements (Selected System)" context={ctx} extra={{ ...p, group: 'metals' }} height={220} />
          </>
        )}
        <CategoryPanel module={module} metric="by-province" title={`Mean ${green ? 'Green' : 'Blue'} Drop Score by Province`} variant="bar" labels height={220} />
        {green ? <CategoryPanel module="green-drop" metric="breakdown" title="WWTWs by Band" variant="bar" height={220} /> : <SeriesPanel module={module} metric="performance" title="Treatment Plant Performance" context={ctx} extra={p} height={220} />}
      </Row>
      {!green && (
        <Row>
          <CategoryPanel module={module} metric="param-compliance" title="SANS 241 Compliance by Determinand (All Systems)" variant="bar" labels height={220} />
        </Row>
      )}
      <Row className="md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_1fr]">
        <EntityInfoCard module={module} id={sel.id} title={`${noun} Information (Selected)`} />
        <TablePanel module={module} metric="latest" title={green ? 'Latest Effluent Results (Selected Plant)' : 'Latest Water Quality Results vs SANS 241'} extra={p} />
        <div className="grid content-start gap-3">
          <TablePanel module={module} metric="ranking" title={`Top 5 ${green ? 'WWTWs' : 'Systems'} (Highest Compliance)`} extra={{ order: 'top' }} selectEntity />
          <TablePanel module={module} metric="ranking" title={`Bottom 5 ${green ? 'WWTWs' : 'Systems'} (Lowest Compliance)`} extra={{ order: 'bottom' }} selectEntity />
        </div>
        <AlertsList module={module} limit={7} />
      </Row>
    </div>
  );
}

