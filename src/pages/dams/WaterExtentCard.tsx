import { useEntity } from '@/api/queries/core';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import { formatNumber } from '@/lib/format';

/**
 * Satellite water-extent panel (SANSA NDWI). Surface area scales with storage^0.67 (reservoir hypsometry);
 * the outline is a stylised reservoir shape — no imagery is hotlinked.
 */
export function WaterExtentCard({ id }: { id?: string }) {
  const q = useEntity('dams', id);
  const pct = Number(q.data?.fields.find((f) => f.label === 'Storage level')?.value ?? 0);
  const ratio = Math.pow(Math.max(0.02, pct / 100), 0.67);
  const shape = (s: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = (52 + 14 * Math.sin(a * 3 + 0.6) + 9 * Math.cos(a * 5 + 1.2) + 6 * Math.sin(a * 7)) * s;
      pts.push(`${(110 + r * 1.35 * Math.cos(a)).toFixed(1)},${(85 + r * 0.85 * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  return (
    <Card title="Satellite Water Extent (NDWI)" context={q.data?.name}>
      {!q.data ? (
        <Skeleton height={190} />
      ) : (
        <div>
          <svg
            viewBox="0 0 220 170"
            className="h-[180px] w-full rounded-lg bg-[#c9d8b8] dark:bg-[#2b3a2a]"
            role="img"
            aria-label={`Water extent at ${formatNumber(ratio * 100, 0)}% of full-supply surface area`}
          >
            <polygon points={shape(1)} fill="none" stroke="#0B1F3A" strokeWidth="1.2" strokeDasharray="4 3" />
            <polygon points={shape(Math.sqrt(ratio))} fill="#1F5FAF" opacity="0.9" />
          </svg>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[#1F5FAF]" aria-hidden="true" /> Current extent (
              {formatNumber(ratio * 100, 0)}% of FSL area)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t border-dashed border-ink" aria-hidden="true" /> Full supply level
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
