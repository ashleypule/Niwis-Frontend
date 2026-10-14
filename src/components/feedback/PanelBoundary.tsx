import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, DatabaseZap } from 'lucide-react';
import { isUnavailable, type ApiError } from '@/api/client';

/** Per-panel error boundary: one failing chart never blanks the page. */
export class PanelBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[panel] render error', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return <ErrorState message="This panel could not be displayed." onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

export function ErrorState({
  message,
  onRetry,
  height,
  error,
}: {
  message?: string;
  onRetry?: () => void;
  height?: number;
  /** the query error: its message and X-Request-Id are shown */
  error?: unknown;
}) {
  const err = error as ApiError | undefined;
  return (
    <div
      role="alert"
      data-state="error"
      className="flex flex-col items-center justify-center gap-2 rounded-lg bg-bad-soft/50 p-4 text-center"
      style={{ minHeight: height }}
    >
      <AlertTriangle className="h-5 w-5 text-bad" aria-hidden="true" />
      <p className="text-sm text-ink-2">{message ?? err?.message ?? 'Data could not be loaded.'}</p>
      {err?.requestId && (
        <p className="text-[11px] text-muted">
          Request ID <code className="select-all font-mono">{err.requestId}</code>
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** The database does not hold this data yet (501 DATA_UNAVAILABLE in `empty` mode): a calm state, no numbers. */
export function UnavailableState({ detail, height, compact }: { detail?: string; height?: number; compact?: boolean }) {
  return (
    <div
      data-state="unavailable"
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface-2/50 p-4 text-center"
      style={{ minHeight: height }}
    >
      <DatabaseZap className="h-5 w-5 text-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink-2">Not yet available</p>
      {detail && (
        <p className={compact ? 'line-clamp-2 text-xs text-muted' : 'max-w-sm text-xs text-muted'}>{detail}</p>
      )}
    </div>
  );
}

export function EmptyState({
  message = 'No data for the selected filters.',
  height,
}: {
  message?: string;
  height?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted"
      style={{ minHeight: height }}
    >
      {message}
    </div>
  );
}

export function Skeleton({ height = 200, className }: { height?: number | string; className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} style={{ height }} aria-hidden="true" aria-busy="true" />;
}

/** True once `ms` have passed since mount. */
export function useElapsed(ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return done;
}

/** Skeleton that explains itself after 3 s (the first backend requests after a restart can take ~20 s). */
export function LoadingState({ height = 200, className }: { height?: number | string; className?: string }) {
  const slow = useElapsed(3000);
  return (
    <div className={`relative ${className ?? ''}`}>
      <Skeleton height={height} />
      {slow && (
        <p
          role="status"
          className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-xs font-medium text-muted"
        >
          Loading data from the national database…
        </p>
      )}
    </div>
  );
}

interface QueryLike {
  isError: boolean;
  error: unknown;
  isLoading: boolean;
  data?: unknown;
  refetch: () => unknown;
}

/**
 * The non-data states of a panel, in priority order: unavailable (501, empty mode) → error (with Retry and request id)
 * → loading. Returns null when the data can be rendered.
 */
export function queryStatus(q: QueryLike, height?: number, opts: { compact?: boolean } = {}): ReactNode | null {
  if (q.isError && isUnavailable(q.error))
    return <UnavailableState detail={(q.error as { detail?: string }).detail} height={height} compact={opts.compact} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} height={height} />;
  if (q.isLoading || q.data === undefined) return <LoadingState height={height ?? 200} />;
  return null;
}
