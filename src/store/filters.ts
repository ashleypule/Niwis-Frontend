/**
 * Global UI state (zustand): filters, theme, sidebar, notifications.
 * Filters are mirrored to URL search params by useUrlSync() so every view can be shared as a link.
 */
import { create } from 'zustand';
import type { PeriodPreset } from '@/config/modules';
import type { FilterParams } from '@/types/api';

export type Theme = 'light' | 'dark';

export interface Filters {
  province?: string;
  wma?: string;
  catchment?: string;
  municipality?: string;
  /** page-specific selected entity (dam, station, borehole …) */
  entity?: string;
  from?: string;
  to?: string;
  period: PeriodPreset;
  compare: boolean;
}

export const FILTER_KEYS = ['province', 'wma', 'catchment', 'municipality', 'entity', 'from', 'to', 'period', 'compare'] as const;

interface UiState {
  filters: Filters;
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
  notificationsOpen: boolean;
  quickBarOpen: boolean;
  readAlerts: string[];
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  setTheme: (t: Theme) => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setQuickBarOpen: (open: boolean) => void;
  markRead: (ids: string[]) => void;
}

const DEFAULT_FILTERS: Filters = { period: '12M', compare: false };

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('niwis-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage unavailable */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export const useUi = create<UiState>((set) => ({
  filters: DEFAULT_FILTERS,
  theme: initialTheme(),
  sidebarCollapsed: readBool('niwis-sidebar-collapsed', false),
  mobileNavOpen: false,
  searchOpen: false,
  notificationsOpen: false,
  quickBarOpen: readBool('niwis-quickbar', true),
  readAlerts: readList('niwis-read-alerts'),
  setFilter: (k, v) =>
    set((s) => {
      const f: Filters = { ...s.filters, [k]: v };
      // cascading scope: changing a parent clears its children
      if (k === 'province') {
        f.wma = undefined;
        f.catchment = undefined;
        f.municipality = undefined;
      }
      if (k === 'wma') {
        f.catchment = undefined;
        f.municipality = undefined;
      }
      if (k === 'catchment') f.municipality = undefined;
      if (k === 'period') {
        f.from = undefined;
        f.to = undefined;
      }
      return { filters: f };
    }),
  setFilters: (p) => set((s) => ({ filters: { ...s.filters, ...p } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setTheme: (theme) => {
    save('niwis-theme', theme);
    set({ theme });
  },
  toggleSidebar: () =>
    set((s) => {
      save('niwis-sidebar-collapsed', s.sidebarCollapsed ? '0' : '1');
      return { sidebarCollapsed: !s.sidebarCollapsed };
    }),
  setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  setQuickBarOpen: (quickBarOpen) => {
    save('niwis-quickbar', quickBarOpen ? '1' : '0');
    set({ quickBarOpen });
  },
  markRead: (ids) =>
    set((s) => {
      const readAlerts = Array.from(new Set([...s.readAlerts, ...ids])).slice(-500);
      save('niwis-read-alerts', JSON.stringify(readAlerts));
      return { readAlerts };
    }),
}));

/** Filters → API query params (every endpoint accepts these). */
export function toParams(f: Filters): FilterParams {
  return {
    province: f.province,
    wma: f.wma,
    catchment: f.catchment,
    municipality: f.municipality,
    from: f.from,
    to: f.to,
    period: f.period,
    compare: f.compare ? '1' : undefined,
  };
}

export const useFilters = () => useUi((s) => s.filters);
