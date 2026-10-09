import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RouteError() {
  const err = useRouteError();
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : (err as Error)?.message ?? 'Unknown error';
  const chunk = /dynamically imported module|Loading chunk/i.test(msg);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-lg font-semibold">{chunk ? 'NIWIS was updated' : 'Something went wrong'}</h1>
        <p className="mt-2 text-sm text-muted">{chunk ? 'A newer version is available. Reload to continue.' : msg}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-ink">
            Reload
          </button>
          <Link to="/" className="rounded-lg border border-line px-3 py-2 text-sm">
            National Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
