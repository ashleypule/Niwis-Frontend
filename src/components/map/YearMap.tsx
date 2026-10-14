import { useState } from 'react';
import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { Card, Tabs } from '@/components/ui/Card';
import { MatrixLegend } from '@/components/charts/MatrixLegend';
import { useMapLayer } from '@/api/queries/core';
import { MapPanel } from './MapPanel';
import { panelProvenance } from '@/components/provenance/provenance';

/** Compact map with horizon / year tabs (projection and forecast maps). */
export function YearMap({
  module,
  layer,
  title,
  params,
  options = ['2030', '2040', '2050', '2070'],
  paramKey = 'year',
  initial,
  height = 300,
}: {
  module: ModuleId;
  layer: string;
  title: string;
  params?: QueryParams;
  options?: string[];
  paramKey?: string;
  initial?: string;
  height?: number;
}) {
  const [v, setV] = useState(initial ?? options[Math.min(2, options.length - 1)]);
  const all = { ...params, [paramKey]: v };
  const q = useMapLayer(module, layer, all);
  return (
    <Card title={title} context={q.data?.title} provenance={panelProvenance(q, module)}>
      <div className="mb-2">
        <Tabs
          label={`${title} horizon`}
          value={v}
          onChange={setV}
          options={options.map((o) => ({ value: o, label: o }))}
        />
      </div>
      <MapPanel
        module={module}
        title={title}
        layers={[]}
        fixedLayer={{ id: `${layer}-${v}`, label: v, layer, params: all }}
        mini
        height={height}
      />
      {q.data && <MatrixLegend scale={q.data.scale} />}
    </Card>
  );
}
