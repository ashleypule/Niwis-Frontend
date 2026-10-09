import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { useAlerts, useReference } from '@/api/queries/core';
import { MODULES } from '@/config/modules';
import { KpiStrip } from '@/components/kpi/KpiStrip';
import { MapPanel } from '@/components/map/MapPanel';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Pill, SeverityIcon } from '@/components/ui/Pill';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import { formatDate } from '@/lib/format';
import { registerExport } from '@/lib/exporter';
import type { Alert } from '@/types/api';

type Local = Record<string, { status: Alert['status']; assignee?: string }>;
const KEY = 'niwis-alert-actions';
const TEAMS = [
  'National Water Resources Planning',
  'Regional office (province)',
  'Dam Safety Office',
  'Water Quality Management',
  'Municipal Support (CoGTA / WSA)',
  'Disaster Management Centre',
];

function loadLocal(): Local {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Local;
  } catch {
    return {};
  }
}

export default function AlertsPage() {
  const [sp] = useSearchParams();
  const [module, setModule] = useState<string | undefined>(sp.get('module') ?? undefined);
  const [severity, setSeverity] = useState<string | undefined>();
  const [province, setProvince] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [since, setSince] = useState<string | undefined>();
  const [local, setLocal] = useState<Local>(loadLocal);
  const [assigning, setAssigning] = useState<string | null>(null);
  const provinces = useReference('provinces');
  const q = useAlerts({ module, severity, province });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(local));
    } catch {
      /* ignore */
    }
  }, [local]);

  const items = useMemo(() => {
    const merged = (q.data?.items ?? []).map((a) => ({
      ...a,
      status: local[a.id]?.status ?? a.status,
      assignee: local[a.id]?.assignee,
    }));
    return merged.filter((a) => (!status || a.status === status) && (!since || a.date.slice(0, 10) >= since));
  }, [q.data, local, status, since]);

  useEffect(
    () =>
      registerExport({
        id: 'alerts-table',
        title: 'Alerts',
        rows: items.map((a) => ({
          date: a.date,
          module: a.module,
          severity: a.severity,
          title: a.title,
          location: a.location,
          status: a.status,
          assignee: a.assignee ?? '',
        })),
      }),
    [items],
  );

  const act = (id: string, s: Alert['status'], assignee?: string) =>
    setLocal((l) => ({ ...l, [id]: { status: s, assignee: assignee ?? l[id]?.assignee } }));

  return (
    <div>
      <KpiStrip module="alerts" count={6} />
      <div className="mt-3 grid gap-3 xl2:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card title="Alerts & Early Warnings (All Modules)" context={`${items.length} alerts shown`}>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Select
              hideLabel={false}
              label="Module"
              value={module}
              onChange={setModule}
              placeholder="All modules"
              options={MODULES.filter((m) => m.group).map((m) => ({ value: m.id, label: m.short }))}
              size="sm"
            />
            <Select
              hideLabel={false}
              label="Severity"
              value={severity}
              onChange={setSeverity}
              placeholder="All"
              options={['critical', 'high', 'moderate', 'low', 'info'].map((s) => ({
                value: s,
                label: s[0].toUpperCase() + s.slice(1),
              }))}
              size="sm"
            />
            <Select
              hideLabel={false}
              label="Province"
              value={province}
              onChange={setProvince}
              placeholder="All"
              options={(provinces.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
              size="sm"
            />
            <Select
              hideLabel={false}
              label="Status"
              value={status}
              onChange={setStatus}
              placeholder="All"
              options={['open', 'acknowledged', 'assigned', 'resolved'].map((s) => ({
                value: s,
                label: s[0].toUpperCase() + s.slice(1),
              }))}
              size="sm"
            />
            <label className="flex items-center text-xs font-medium text-muted">
              <span className="mr-2">Since</span>
              <input
                type="date"
                value={since ?? ''}
                onChange={(e) => setSince(e.target.value || undefined)}
                className="h-8 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
              />
            </label>
          </div>
          {!q.data ? (
            <Skeleton height={400} />
          ) : (
            <div className="max-h-[640px] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-ink-2">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Alert</th>
                    <th className="px-2 py-2">Module</th>
                    <th className="px-2 py-2">Severity</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => {
                    const mod = MODULES.find((m) => m.id === a.module);
                    return (
                      <tr key={a.id} className="border-t border-line align-top">
                        <td className="whitespace-nowrap px-2 py-2 text-muted">{formatDate(a.date, 'datetime')}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <SeverityIcon severity={a.severity} className="mt-0.5" />
                            <div>
                              <p className="font-medium text-ink">{a.title}</p>
                              <p className="text-xs text-muted">{a.message}</p>
                              <p className="text-xs text-muted">
                                {a.location}
                                {a.assignee ? ` · Assigned: ${a.assignee}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {mod && (
                            <Link
                              className="text-primary hover:underline"
                              to={a.entityId ? `${mod.path}?entity=${encodeURIComponent(a.entityId)}` : mod.path}
                            >
                              {mod.short}
                            </Link>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Pill scale="severity" value={a.severity} size="sm" />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 capitalize text-ink-2">{a.status}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          {a.status === 'open' && (
                            <Button size="sm" variant="outline" onClick={() => act(a.id, 'acknowledged')}>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
                            </Button>
                          )}{' '}
                          {a.status !== 'resolved' && (
                            <span className="relative inline-block">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setAssigning(assigning === a.id ? null : a.id)}
                                aria-expanded={assigning === a.id}
                              >
                                <UserPlus className="h-3.5 w-3.5" /> Assign
                              </Button>
                              {assigning === a.id && (
                                <ul
                                  role="menu"
                                  className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-line bg-surface p-1 text-left shadow-pop"
                                >
                                  {TEAMS.map((t) => (
                                    <li key={t}>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                                        onClick={() => (act(a.id, 'assigned', t), setAssigning(null))}
                                      >
                                        {t}
                                      </button>
                                    </li>
                                  ))}
                                  <li>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-good hover:bg-surface-2"
                                      onClick={() => (act(a.id, 'resolved'), setAssigning(null))}
                                    >
                                      Mark resolved
                                    </button>
                                  </li>
                                </ul>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted">
                        No alerts match the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Acknowledge / assign actions are stored in this browser only until the alert workflow API is connected.
          </p>
        </Card>
        <MapPanel
          module="alerts"
          title="Alert Locations"
          layers={[{ id: 'locations', label: 'Alerts' }]}
          tabs={false}
          height={560}
        />
      </div>
    </div>
  );
}
