/** Month-index helpers. A month index is year*12 + month (0–11), which keeps monthly series arithmetic trivial. */
import { APP } from '@/config/app';

export const monthIndex = (year: number, month0: number): number => year * 12 + month0;
export const miYear = (mi: number): number => Math.floor(mi / 12);
export const miMonth = (mi: number): number => ((mi % 12) + 12) % 12;
export const miToDate = (mi: number, day = 15): Date => new Date(Date.UTC(miYear(mi), miMonth(mi), day));
export const miToIso = (mi: number): string => `${miYear(mi)}-${String(miMonth(mi) + 1).padStart(2, '0')}-01`;
export const dateToMi = (d: Date): number => monthIndex(d.getUTCFullYear(), d.getUTCMonth());
export const isoToMi = (iso: string): number => {
  const [y, m] = iso.split('-').map(Number);
  return monthIndex(y, (m || 1) - 1);
};

/** Last complete month at the as-of date (the current month is still in progress). */
export function asOfMonth(asOf = APP.asOf): number {
  return dateToMi(asOf) - 1;
}

/** Current (partial) month index. */
export function currentMonth(asOf = APP.asOf): number {
  return dateToMi(asOf);
}

export const DAY_MS = 86_400_000;

export function dayIndex(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS);
}

export function dayToIso(di: number): string {
  return new Date(di * DAY_MS).toISOString().slice(0, 10);
}

export function isoDay(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
}

export function daysInMonth(mi: number): number {
  return new Date(Date.UTC(miYear(mi), miMonth(mi) + 1, 0)).getUTCDate();
}

/** Season of a month (southern hemisphere meteorological seasons). */
export function season(month0: number): 'DJF' | 'MAM' | 'JJA' | 'SON' {
  if (month0 === 11 || month0 <= 1) return 'DJF';
  if (month0 <= 4) return 'MAM';
  if (month0 <= 7) return 'JJA';
  return 'SON';
}

/** Hydrological year in SA starts 1 October. */
export function hydroYear(mi: number): number {
  return miMonth(mi) >= 9 ? miYear(mi) + 1 : miYear(mi);
}
