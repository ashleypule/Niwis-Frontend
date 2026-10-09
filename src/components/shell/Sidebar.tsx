import { NavLink } from 'react-router';
import clsx from 'clsx';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { MODULES, NAV_GROUPS } from '@/config/modules';
import { useUi } from '@/store/filters';
import { DwsLogo } from './Brand';

function NavBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Modules" className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
      {NAV_GROUPS.map((g) => {
        const items = MODULES.filter((m) => m.group === g);
        return (
          <div key={g ?? 'home'} className="mb-1">
            {g && !collapsed && (
              <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7f95b3]">
                {g}
              </div>
            )}
            {g && collapsed && <div className="mx-3 my-2 border-t border-white/10" aria-hidden="true" />}
            <ul className="space-y-0.5">
              {items.map((m) => {
                const Icon = m.icon;
                return (
                  <li key={m.id}>
                    <NavLink
                      to={m.path}
                      end={m.path === '/'}
                      onClick={onNavigate}
                      title={collapsed ? m.label : undefined}
                      aria-label={collapsed ? m.label : undefined}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] leading-tight transition-colors',
                          collapsed && 'justify-center px-0',
                          isActive
                            ? 'bg-nav-active font-semibold text-white shadow-[inset_3px_0_0_#7fc4ff]'
                            : 'text-nav-text hover:bg-white/8 hover:text-white',
                        )
                      }
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="line-clamp-2">{m.label}</span>}
                      {collapsed && (
                        <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md bg-navy-2 px-2 py-1 text-xs text-white shadow-pop group-hover:block group-focus-visible:block">
                          {m.label}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobile = useUi((s) => s.setMobileNav);

  return (
    <>
      {/* desktop */}
      <aside
        className={clsx(
          'no-print sticky top-0 hidden h-screen shrink-0 flex-col bg-navy text-white transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[72px]' : 'w-[264px]',
        )}
        aria-label="Main navigation"
      >
        <div
          className={clsx(
            'flex flex-col gap-3 border-b border-white/10 px-4 pb-4 pt-4',
            collapsed && 'items-center px-2',
          )}
        >
          <DwsLogo compact={collapsed} />
          {!collapsed && (
            <div>
              <div className="text-[28px] font-extrabold leading-none tracking-tight">NIWIS</div>
              <div className="mt-1 text-[11px] font-medium uppercase leading-snug tracking-wide text-nav-text">
                National Integrated Water Information System
              </div>
            </div>
          )}
        </div>
        <NavBody collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-nav-text hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="mx-auto h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </aside>

      {/* mobile / tablet drawer */}
      <div
        className={clsx('fixed inset-0 z-40 lg:hidden', mobileOpen ? '' : 'pointer-events-none')}
        aria-hidden={!mobileOpen}
      >
        <div
          className={clsx('absolute inset-0 bg-black/50 transition-opacity', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMobile(false)}
        />
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-navy text-white shadow-pop transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-label="Main navigation"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start justify-between border-b border-white/10 p-4">
            <div>
              <DwsLogo />
              <div className="mt-3 text-2xl font-extrabold">NIWIS</div>
            </div>
            <button
              type="button"
              onClick={() => setMobile(false)}
              className="rounded p-1 text-nav-text hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <NavBody collapsed={false} onNavigate={() => setMobile(false)} />
        </aside>
      </div>
    </>
  );
}
