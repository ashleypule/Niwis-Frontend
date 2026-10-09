import { useTable } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import { RingGauge } from '@/components/viz/RingGauge';

/** Data quality dimension rings (spec §23.1). */
export function QualityRings({ title = 'Data Quality Overview' }: { title?: string }) {
  const q = useTable('governance', 'quality');
  const get = (k: string) => Number(q.data?.rows.find((r) => r.dimension === k)?.value ?? 0);
  return (
    <Card title={title}>
      {!q.data ? (
        <Skeleton height={110} />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {['Completeness', 'Accuracy', 'Timeliness', 'Consistency', 'Validity'].map((k) => (
            <RingGauge key={k} label={k} value={get(k)} size={68} />
          ))}
        </div>
      )}
    </Card>
  );
}
