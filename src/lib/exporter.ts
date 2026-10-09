/**
 * Data export: every ChartCard / DataTable registers the dataset it is showing, so "Download Data" in the
 * filter bar can export everything visible on the page (one CSV, or a zip when there are several).
 */
import Papa from 'papaparse';
import type { CategorySet, MatrixSet, SeriesSet, TableSet } from '@/types/api';

export type Row = Record<string, string | number | null>;
export interface ExportItem {
  id: string;
  title: string;
  rows: Row[];
}

const registry = new Map<string, ExportItem>();

export function registerExport(item: ExportItem) {
  registry.set(item.id, item);
  return () => {
    registry.delete(item.id);
  };
}

export function registeredExports(): ExportItem[] {
  return [...registry.values()].filter((i) => i.rows.length);
}

export const safeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'data';

export function toCsv(rows: Row[]): string {
  return Papa.unparse(rows);
}

export function download(filename: string, data: Blob | string, type = 'text/csv;charset=utf-8') {
  const blob = typeof data === 'string' ? new Blob(['﻿', data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  recordDownload(filename);
}

export async function downloadAll(prefix: string): Promise<number> {
  const items = registeredExports();
  if (!items.length) return 0;
  const stamp = new Date().toISOString().slice(0, 10);
  if (items.length === 1) {
    download(`${prefix}-${safeName(items[0].title)}-${stamp}.csv`, toCsv(items[0].rows));
    return 1;
  }
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  for (const it of items) {
    let n = safeName(it.title);
    while (used.has(n)) n += '-x';
    used.add(n);
    zip.file(`${n}.csv`, '﻿' + toCsv(it.rows));
  }
  zip.file(
    'README.txt',
    `NIWIS data export\nGenerated: ${new Date().toISOString()}\nSAMPLE DATA - NOT FOR OPERATIONAL DECISIONS (when running against the mock API).\n`,
  );
  const blob = await zip.generateAsync({ type: 'blob' });
  download(`${prefix}-${stamp}.zip`, blob, 'application/zip');
  return items.length;
}

// ------------------------------------------------------------------ dataset → rows
export function seriesRows(s: SeriesSet): Row[] {
  const xs = new Map<string, Row>();
  for (const ser of s.series) {
    for (const p of ser.data) {
      const x = String(p[0]);
      const r = xs.get(x) ?? { [s.xType === 'time' ? 'date' : 'x']: x };
      const unit = s.axes[ser.axis ?? 0]?.unit;
      const name = unit ? `${ser.name} (${unit})` : ser.name;
      if (ser.kind === 'band') {
        r[`${name} low`] = p[1] as number | null;
        r[`${name} high`] = p[2] as number | null;
      } else r[name] = p[1] as number | null;
      xs.set(x, r);
    }
  }
  return [...xs.values()];
}

export function categoryRows(c: CategorySet): Row[] {
  return c.categories.map((cat, i) => {
    const r: Row = { category: cat };
    c.series.forEach((s) => (r[c.unit ? `${s.name} (${c.unit})` : s.name] = s.values[i]));
    return r;
  });
}

export function tableRows(t: TableSet): Row[] {
  return t.rows.map((row) => {
    const r: Row = {};
    t.columns.forEach((c) => (r[c.unit ? `${c.label} (${c.unit})` : c.label] = row[c.key] ?? null));
    return r;
  });
}

export function matrixRows(m: MatrixSet): Row[] {
  return m.rows.map((row, i) => {
    const r: Row = { row };
    m.cols.forEach((c, j) => (r[c] = m.values[i][j] as number | string | null));
    return r;
  });
}

// ------------------------------------------------------------------ downloads history (local, per browser)
export interface DownloadRecord {
  file: string;
  at: string;
}
export function recordDownload(file: string) {
  try {
    const list = downloadHistory();
    list.unshift({ file, at: new Date().toISOString() });
    localStorage.setItem('niwis-downloads', JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage unavailable */
  }
}
export function downloadHistory(): DownloadRecord[] {
  try {
    return JSON.parse(localStorage.getItem('niwis-downloads') ?? '[]') as DownloadRecord[];
  } catch {
    return [];
  }
}
