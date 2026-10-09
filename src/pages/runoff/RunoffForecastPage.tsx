import { moduleById, type ModuleId } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { SeriesPanel } from '@/components/charts/panels';
import { MiniMap } from '@/components/map/MiniMap';
import { TablePanel } from '@/components/table/TablePanel';
import { Row } from '@/components/layout/Grid';
import { useSelectedEntity } from '@/components/entity/useSelectedEntity';
import { PROVINCE_TABS } from '@/pages/_shared/tabs';

/** Forecast view shared by Runoff and Surface Water (same streamflow forecast engine). */
export function StreamflowForecast({ module }: { module: ModuleId }) {
  const mod = moduleById(module);
  const st = useSelectedEntity(module);
  return (
    <div>
      <PageTabs mod={mod} />
      <KpiStrip module={module} />
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <SeriesPanel
          module={module}
          metric="runoff"
          forecast
          title="Runoff Forecast (Next 12 Months)"
          tabs={PROVINCE_TABS}
          height={280}
        />
        <SeriesPanel
          module={module}
          metric="flow"
          forecast
          title="Streamflow Forecast (Selected Station)"
          context={st.name}
          extra={{ entityId: st.id }}
          height={280}
        />
        <SeriesPanel
          module={module}
          metric="flood-probability"
          forecast
          title="Flood Probability (Stations above Q10)"
          height={280}
        />
      </Row>
      <Row className="md:grid-cols-2 xl:grid-cols-3">
        <MiniMap
          module="drought"
          layer="outlook-3"
          title="Rainfall Outlook Driving Runoff (SPI-3, +3 months)"
          height={280}
        />
        <TablePanel
          module={module}
          metric="top-stations"
          title="Stations to Watch (Lowest Flow Percentile)"
          extra={{ order: 'lowest' }}
          selectEntity
        />
        <TablePanel
          module={module}
          metric="statistics"
          title="Current Runoff Statistics (Forecast Baseline)"
          extra={{ entityId: st.id }}
        />
      </Row>
    </div>
  );
}

export default function RunoffForecastPage() {
  return <StreamflowForecast module="runoff" />;
}
