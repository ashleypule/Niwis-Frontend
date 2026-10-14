import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useMapLayer } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { MatrixLegend } from '@/components/charts/MatrixLegend';
import { MapPanel } from './MapPanel';
import { panelProvenance } from '@/components/provenance/provenance';

/** Small single-layer map card (small multiples). */
export function MiniMap({
  module,
  layer,
  title,
  params,
  height = 230,
}: {
  module: ModuleId;
  layer: string;
  title: string;
  params?: QueryParams;
  height?: number;
}) {
  const q = useMapLayer(module, layer, params);
  return (
    <Card title={title} context={q.data?.title} provenance={panelProvenance(q, module)}>
      <MapPanel
        module={module}
        title={title}
        layers={[]}
        fixedLayer={{ id: layer, label: title, params }}
        mini
        height={height}
      />
      {q.data && <MatrixLegend scale={q.data.scale} />}
    </Card>
  );
}
