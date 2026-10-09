import { Skeleton } from './PanelBoundary';

export function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading page">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} height={104} />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[2fr_3fr]">
        <Skeleton height={460} />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton height={224} />
          <Skeleton height={224} />
          <Skeleton height={224} />
          <Skeleton height={224} />
        </div>
      </div>
    </div>
  );
}
