import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Sun, UserCircle2 } from 'lucide-react';
import { MODULES, moduleForPath } from '@/config/modules';
import { APP, isLive, isMock, showProvenance } from '@/config/app';
import { useUi } from '@/store/filters';
import { useAlerts, useHealth, useMetaCoverage } from '@/api/queries/core';

export function SampleDataBadge() {
  if (!isMock) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300/60 bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100"
      title="All figures are generated sample data for design and testing. Do not use for operational decisions."
      role="note"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
      Sample data<span className="hidden md:inline">&nbsp;— not for operational decisions</span>
    </span>
  );
}

/** Modules with their own data (everything except the report builder). */
const DATA_MODULES = MODULES.filter((m) => m.id !== 'reports');

/** Hybrid / api mode: "N of 24 modules live" from /health, linking to the Data Integration page. */
export function LiveSummaryBadge() {
  const health = useHealth();
  if (!showProvenance || !APP.liveMeta) return null;
  const base =
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10';
  if (health.isError || (health.data && health.data.database?.reachable === false))
    return (
      <Link
        to="/data-integration"
        className={`${base} border-red-300/60 bg-red-500/20 text-red-50`}
        title="The national database could not be reached. Live panels show an error until it is back."
        data-testid="live-summary"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-300" aria-hidden="true" />
        National database unreachable
      </Link>
    );
  const live = (health.data?.modules ?? []).filter((m) => m.status === 'live' && isLive(m.module));
  return (
    <Link
      to="/data-integration"
      className={`${base} border-emerald-300/50 bg-emerald-400/15 text-emerald-50`}
      title={
        health.data
          ? `Live from the national database: ${live.map((m) => m.module).join(', ')}. Panels marked Sample show generated data.`
          : 'Checking the national database…'
      }
      data-testid="live-summary"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
      {health.data ? `${live.length} of ${DATA_MODULES.length} modules live` : 'Connecting…'}
    </Link>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-white hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserCircle2 className="h-8 w-8 text-white/90" aria-hidden="true" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-semibold">DWS User</span>
          <span className="block text-[11px] text-white/70">Analyst</span>
        </span>
        <ChevronDown className="h-4 w-4 text-white/70" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop"
        >
          <div className="border-b border-line px-3 py-2">
            <div className="text-sm font-semibold">DWS User</div>
            <div className="text-xs text-muted">Analyst · National Office</div>
          </div>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2"
            onClick={() => setOpen(false)}
            title="Single sign-on is configured by the backend team"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const mod = moduleForPath(pathname);
  const forecast = pathname.endsWith('/forecast');
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setNotifOpen = useUi((s) => s.setNotificationsOpen);
  const setMobile = useUi((s) => s.setMobileNav);
  const read = useUi((s) => s.readAlerts);
  const { data } = useAlerts({ limit: 50 });
  const unread = data ? data.items.filter((a) => !read.includes(a.id)).length : 0;
  // "1960 – present" is the mock record; a live module states the period its database tables actually cover
  const coverage = useMetaCoverage();
  const first = coverage.data?.modules.find((m) => m.module === mod.id)?.firstDate?.slice(0, 4);
  const keywords = mod.keywords.flatMap((k) =>
    /^\d{4} – present$/.test(k) && isLive(mod.id) ? (first ? [`${first} – present`] : []) : [k],
  );
  const title =
    mod.id === 'overview'
      ? 'National Integrated Water Information System'
      : `${mod.label}${forecast ? ' – Predictions & Forecasting' : ''}`;

  return (
    <header className="hero no-print shrink-0 text-white">
      <div className="relative z-10 mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4 lg:px-5">
        <button
          type="button"
          className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
          onClick={() => setMobile(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            <SampleDataBadge />
            <LiveSummaryBadge />
          </div>
          <p className="mt-0.5 hidden text-sm text-white/80 sm:block">{keywords.join(' · ')}</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/85 hover:bg-white/15 md:w-72"
            aria-label="Search locations, dams, stations and pages (Ctrl+K)"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden flex-1 truncate whitespace-nowrap text-left md:inline">
              Search location, dam, station…
            </span>
            <kbd className="hidden rounded border border-white/25 px-1.5 text-[11px] text-white/70 md:inline">
              Ctrl K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="relative rounded-lg p-2 hover:bg-white/10"
            aria-label={`Notifications, ${unread} unread`}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-[#e53935] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
