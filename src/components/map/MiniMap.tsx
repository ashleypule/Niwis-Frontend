import { useRef } from 'react';
import type { ModuleId } from '@/config/modules';
import { useInView } from '@/lib/useInView';
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
  // same query as the map inside (shared cache), also only once the card nears the viewport after the page loaded
  const box = useRef<HTMLElement>(null);
  const near = useInView(box, '300px', { afterLoad: true });
  const q = useMapLayer(module, layer, params, near);
  return (
    <Card title={title} context={q.data?.title} provenance={panelProvenance(q, module)} sectionRef={box}>
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
