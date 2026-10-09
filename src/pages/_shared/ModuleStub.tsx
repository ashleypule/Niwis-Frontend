import { useLocation } from 'react-router';
import { moduleForPath } from '@/config/modules';
import { PageTabs } from '@/components/layout/PageTabs';
import { Card } from '@/components/ui/Card';

/** Temporary page body used while a module is being built (see PROGRESS.md). */
export function ModuleStub() {
  const { pathname } = useLocation();
  const mod = moduleForPath(pathname);
  return (
    <div>
      <PageTabs mod={mod} />
      <Card title={mod.label}>
        <p className="py-10 text-center text-sm text-muted">This module is scheduled in a later build phase (spec {mod.spec}).</p>
      </Card>
    </div>
  );
}
