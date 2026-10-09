/**
 * Unified alerts: every alert is DERIVED from module data crossing a threshold (spec §8.2 storage levels, SPI
 * classes, SGI, SANS 241 exceedances, …). Modules register alert providers here.
 */
import { APP } from '@/config/app';
import { Rng, memo } from '@/lib/prng';
import type { Alert, AlertList } from '@/types/api';
import type { Ctx } from './build';

export type AlertProvider = () => Omit<Alert, 'date' | 'status'>[];
const PROVIDERS: AlertProvider[] = [];

export function registerAlertProvider(p: AlertProvider) {
  PROVIDERS.push(p);
}

const SEV_ORDER = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 } as const;

export const allAlerts = memo(
  (): Alert[] => {
    const out: Alert[] = [];
    for (const p of PROVIDERS) {
      for (const a of p()) {
        const r = new Rng(`alert-${a.id}`);
        const hoursAgo = r.range(1, 24 * 21) * (a.severity === 'critical' ? 0.4 : 1);
        const date = new Date(APP.asOf.getTime() - hoursAgo * 3600_000);
        const status: Alert['status'] =
          hoursAgo > 24 * 10
            ? r.weighted(['acknowledged', 'assigned', 'resolved', 'open'] as const, [0.35, 0.25, 0.2, 0.2])
            : r.bool(0.2)
              ? 'acknowledged'
              : 'open';
        out.push({ ...a, date: date.toISOString(), status });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  },
  () => 'all',
);

export function alertsHandler(ctx: Ctx): AlertList {
  const module = ctx.q('module');
  const severity = ctx.q('severity');
  const province = ctx.q('province');
  const scoped = ctx.q('scoped') === '1';
  const limit = Number(ctx.q('limit') ?? 500);
  let items = allAlerts();
  if (module) items = items.filter((a) => a.module === module);
  if (severity) items = items.filter((a) => a.severity === severity);
  if (province) items = items.filter((a) => a.province === province);
  else if (scoped && ctx.scope.level !== 'national') items = items.filter((a) => ctx.scope.includes(a as never));
  // important alerts first in short lists
  if (limit < 50)
    items = [...items]
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.date.localeCompare(a.date))
      .slice(0, limit)
      .sort((a, b) => b.date.localeCompare(a.date));
  return { total: items.length, unread: items.filter((a) => a.status === 'open').length, items: items.slice(0, limit) };
}
