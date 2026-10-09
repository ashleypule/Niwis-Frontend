import { Suspense, useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { FilterBar } from '@/components/shell/FilterBar';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { NotificationsDrawer } from '@/components/shell/NotificationsDrawer';
import { QuickBar } from '@/components/shell/QuickBar';
import { PageSkeleton } from '@/components/feedback/PageSkeleton';
import { useUi } from '@/store/filters';
import { moduleForPath } from '@/config/modules';
import { useUrlSync } from './useUrlSync';

export function Layout() {
  useUrlSync();
  const theme = useUi((s) => s.theme);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setMobileNav = useUi((s) => s.setMobileNav);
  const { pathname } = useLocation();
  const mod = moduleForPath(pathname);
  const isPrint = pathname.endsWith('/print') || pathname.endsWith('/report');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    setMobileNav(false);
    const forecast = pathname.endsWith('/forecast');
    document.title = `${mod.label}${forecast ? ' – Predictions & Forecasting' : ''} · NIWIS`;
  }, [pathname, mod.label, setMobileNav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  if (isPrint) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-ink focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <FilterBar />
        <main id="main" className="mx-auto w-full max-w-[1920px] flex-1 px-3 pb-6 pt-3 sm:px-4 lg:px-5" tabIndex={-1}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
        <QuickBar />
      </div>
      <CommandPalette />
      <NotificationsDrawer />
      <ScrollRestoration />
    </div>
  );
}
