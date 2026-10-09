import { Link } from 'react-router';
import { CheckCheck, X } from 'lucide-react';
import clsx from 'clsx';
import { useUi } from '@/store/filters';
import { useAlerts } from '@/api/queries/core';
import { MODULES } from '@/config/modules';
import { formatDate } from '@/lib/format';
import { SeverityIcon, Pill } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';

export function NotificationsDrawer() {
  const open = useUi((s) => s.notificationsOpen);
  const setOpen = useUi((s) => s.setNotificationsOpen);
  const read = useUi((s) => s.readAlerts);
  const markRead = useUi((s) => s.markRead);
  const { data } = useAlerts({ limit: 50 });
  const items = data?.items ?? [];
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label="Notifications">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <aside className="anim-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">Notifications</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => markRead(items.map((a) => a.id))}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-surface-2" aria-label="Close notifications">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <ul className="flex-1 divide-y divide-line overflow-y-auto">
          {items.map((a) => {
            const mod = MODULES.find((m) => m.id === a.module);
            const unread = !read.includes(a.id);
            return (
              <li key={a.id} className={clsx('flex gap-3 px-4 py-3', unread && 'bg-info-soft/60')}>
                <SeverityIcon severity={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{a.title}</p>
                    <Pill scale="severity" value={a.severity} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{a.message}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{formatDate(a.date, 'datetime')}</span>·<span>{a.location}</span>
                    {mod && (
                      <Link
                        to={a.entityId ? `${mod.path}?entity=${encodeURIComponent(a.entityId)}` : mod.path}
                        onClick={() => {
                          markRead([a.id]);
                          setOpen(false);
                        }}
                        className="ml-auto font-medium text-primary hover:underline"
                      >
                        {mod.short} →
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-3">
          <Link to="/alerts" onClick={() => setOpen(false)} className="block rounded-lg bg-primary py-2 text-center text-sm font-medium text-primary-ink hover:bg-primary-hover">
            Open Alerts &amp; Early Warnings
          </Link>
        </div>
      </aside>
    </div>
  );
}
