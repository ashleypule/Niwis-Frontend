import { NavLink, useLocation } from 'react-router';
import clsx from 'clsx';
import { Activity, LineChart } from 'lucide-react';
import type { ModuleDef } from '@/config/modules';

/** Status | Predictions & Forecasting tabs for modules with a forecast view. Keeps the query string. */
export function PageTabs({ mod }: { mod: ModuleDef }) {
  const { search } = useLocation();
  if (!mod.hasForecast) return null;
  const cls = ({ isActive }: { isActive: boolean }) =>
    clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors', isActive ? 'bg-primary text-primary-ink shadow-sm' : 'text-ink-2 hover:bg-surface-3');
  return (
    <nav aria-label={`${mod.label} views`} className="no-print mb-3 inline-flex rounded-xl border border-line bg-surface p-1 shadow-card">
      <NavLink to={{ pathname: mod.path, search }} end className={cls}>
        <Activity className="h-4 w-4" aria-hidden="true" /> Status
      </NavLink>
      <NavLink to={{ pathname: `${mod.path}/forecast`, search }} className={cls}>
        <LineChart className="h-4 w-4" aria-hidden="true" /> Predictions &amp; Forecasting
      </NavLink>
    </nav>
  );
}
