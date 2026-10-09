import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="mt-2 text-sm text-muted">The page you requested does not exist in NIWIS.</p>
      <Link to="/" className="mt-4 inline-block rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-ink">
        Go to National Overview
      </Link>
    </div>
  );
}
