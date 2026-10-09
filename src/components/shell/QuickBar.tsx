import { NavLink } from 'react-router';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { MODULES } from '@/config/modules';
import { useUi } from '@/store/filters';

/** Bottom quick-access bar (desktop only, collapsible) — from the National Overview mockup. */
export function QuickBar() {
  const open = useUi((s) => s.quickBarOpen);
  const setOpen = useUi((s) => s.setQuickBarOpen);
  const items = MODULES.filter(
    (m) =>
      m.group === 'Monitoring' ||
      m.group === 'Water Quality & Compliance' ||
      ['iwrm', 'water-quantity', 'services', 'settlements', 'ai', 'governance'].includes(m.id),
  );
  return (
    <div className="no-print sticky bottom-0 z-30 hidden shrink-0 border-t border-white/10 bg-navy text-nav-text xl:block">
      <div className="flex items-center gap-1 px-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 py-1.5 pr-3 text-xs font-semibold text-white"
          aria-expanded={open}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Quick access
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
        {open && (
          <nav aria-label="Quick access" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {items.map((m) => {
              const Icon = m.icon;
              return (
                <NavLink
                  key={m.id}
                  to={m.path}
                  className={({ isActive }) =>
                    clsx(
                      'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px]',
                      isActive ? 'bg-nav-active text-white' : 'hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {m.short}
                </NavLink>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
