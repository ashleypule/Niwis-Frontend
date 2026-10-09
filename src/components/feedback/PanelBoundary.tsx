import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

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

export function ErrorState({ message, onRetry, height }: { message?: string; onRetry?: () => void; height?: number }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-lg bg-bad-soft/50 p-4 text-center" style={{ minHeight: height }}>
      <AlertTriangle className="h-5 w-5 text-bad" aria-hidden="true" />
      <p className="text-sm text-ink-2">{message ?? 'Data could not be loaded.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'No data for the selected filters.', height }: { message?: string; height?: number }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted" style={{ minHeight: height }}>
      {message}
    </div>
  );
}

export function Skeleton({ height = 200, className }: { height?: number | string; className?: string }) {
  return <div className={`skeleton ${className ?? ''}`} style={{ height }} aria-hidden="true" />;
}
