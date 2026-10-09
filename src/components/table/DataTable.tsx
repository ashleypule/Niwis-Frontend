import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUp, ArrowUpRight, ChevronsUpDown } from 'lucide-react';
import type { Column, TableSet } from '@/types/api';
import { formatDate, formatNumber, withUnit } from '@/lib/format';
import { classify } from '@/config/palettes';
import { Pill } from '@/components/ui/Pill';
import { registerExport, tableRows } from '@/lib/exporter';

type Val = string | number | null | undefined;

function TrendCell({ v, good, unit, decimals = 1 }: { v: number; good: 'up' | 'down' | 'neutral'; unit?: string; decimals?: number }) {
  const tone = v === 0 || good === 'neutral' ? 'neutral' : (v > 0) === (good === 'up') ? 'good' : 'bad';
  const Arrow = v === 0 ? ArrowRight : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('num inline-flex items-center gap-0.5 font-semibold', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-muted')}>
      <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
      {v > 0 ? '+' : ''}
      {formatNumber(v, decimals)}
      {unit === '%' ? '%' : unit ? ` ${unit}` : ''}
      <span className="sr-only">{tone === 'good' ? '(improving)' : tone === 'bad' ? '(worsening)' : ''}</span>
    </span>
  );
}

export function renderCell(c: Column, v: Val, rowIndex: number): ReactNode {
  if (c.type === 'rank') return <span className="text-muted">{rowIndex + 1}</span>;
  if (v == null || v === '') return <span className="text-muted">—</span>;
  switch (c.type) {
    case 'class':
      return <Pill scale={c.scale ?? 'status'} value={v} size="sm" />;
    case 'trend':
    case 'delta':
      return typeof v === 'number' ? <TrendCell v={v} good={c.goodDirection ?? 'up'} unit={c.unit} decimals={c.decimals} /> : String(v);
    case 'number': {
      if (typeof v !== 'number') return String(v);
      const txt = withUnit(formatNumber(v, c.decimals ?? 0), c.unit === '%' ? '%' : undefined);
      if (c.scale) {
        const bin = classify(c.scale, v);
        return (
          <span className="num inline-block min-w-[3.2rem] rounded px-1.5 py-0.5 text-right font-semibold" style={bin ? { background: `${bin.color}33`, boxShadow: `inset 3px 0 0 ${bin.color}` } : undefined}>
            {txt}
          </span>
        );
      }
      return <span className="num">{txt}</span>;
    }
    case 'bar': {
      const n = typeof v === 'number' ? v : Number(v);
      const bin = c.scale ? classify(c.scale, n) : null;
      return (
        <span className="flex items-center gap-2">
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, n))}%`, background: bin?.color ?? 'var(--c-primary)' }} />
          </span>
          <span className="num w-10 text-right text-xs font-semibold">{formatNumber(n, 0)}%</span>
        </span>
      );
    }
    case 'date':
      return <span className="whitespace-nowrap">{formatDate(String(v))}</span>;
    default:
      return String(v);
  }
}

const ROW_H = 34;

export interface DataTableProps {
  table: TableSet;
  /** maximum rows to show (rest via "View all") */
  limit?: number;
  viewAllHref?: string;
  onRowClick?: (row: Record<string, Val>) => void;
  selectedKey?: string;
  maxHeight?: number;
  caption?: string;
  dense?: boolean;
}

export function DataTable({ table, limit, viewAllHref, onRowClick, selectedKey, maxHeight = 420, caption, dense = true }: DataTableProps) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => registerExport({ id, title: table.title ?? caption ?? table.id, rows: tableRows(table) }), [id, table, caption]);

  const rows = useMemo(() => {
    let r = [...table.rows];
    if (sort) {
      r.sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    if (limit) r = r.slice(0, limit);
    return r;
  }, [table.rows, sort, limit]);

  const virtual = rows.length > 150;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - 10) : 0;
  const end = virtual ? Math.min(rows.length, start + Math.ceil(maxHeight / ROW_H) + 20) : rows.length;
  const visible = rows.slice(start, end);
  const rowKey = table.rowKey;

  return (
    <div>
      <div ref={box} className="overflow-auto rounded-lg border border-line" style={{ maxHeight }} onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined} tabIndex={0} role="region" aria-label={caption ?? table.title ?? 'Data table'}>
        <table className="w-full border-collapse text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {table.columns.map((c) => {
                const active = sort?.key === c.key;
                const sortable = c.type !== 'rank';
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={clsx('whitespace-nowrap border-b border-line px-2.5 py-2 text-[12px] font-semibold text-ink-2', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                      >
                        {c.label}
                        {c.unit && c.type === 'number' && c.unit !== '%' && <span className="font-normal text-muted">({c.unit})</span>}
                        {active ? sort!.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {virtual && start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden="true" />}
            {visible.map((r, i) => {
              const key = rowKey ? String(r[rowKey]) : String(start + i);
              const selected = selectedKey != null && key === selectedKey;
              return (
                <tr
                  key={key + i}
                  className={clsx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2', selected && 'bg-primary-soft')}
                  style={virtual ? { height: ROW_H } : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={onRowClick ? selected : undefined}
                >
                  {table.columns.map((c) => (
                    <td key={c.key} className={clsx('px-2.5', dense ? 'py-1.5' : 'py-2.5', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left', c.type === 'text' && (String(r[c.key] ?? '').length <= 14 ? 'whitespace-nowrap' : 'min-w-[6rem] max-w-[260px] whitespace-normal leading-snug'))}>
                      {renderCell(c, r[c.key], start + i)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {virtual && end < rows.length && <tr style={{ height: (rows.length - end) * ROW_H }} aria-hidden="true" />}
          </tbody>
        </table>
      </div>
      {viewAllHref && (
        <div className="mt-1.5 text-right">
          <Link to={viewAllHref} className="text-xs font-semibold text-primary hover:underline">
            View all →
          </Link>
        </div>
      )}
    </div>
  );
}
