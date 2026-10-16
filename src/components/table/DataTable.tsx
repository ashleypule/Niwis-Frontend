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

function TrendCell({
  v,
  good,
  unit,
  decimals = 1,
}: {
  v: number;
  good: 'up' | 'down' | 'neutral';
  unit?: string;
  decimals?: number;
}) {
  const tone = v === 0 || good === 'neutral' ? 'neutral' : v > 0 === (good === 'up') ? 'good' : 'bad';
  const Arrow = v === 0 ? ArrowRight : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        'num inline-flex items-center gap-0.5 whitespace-nowrap font-semibold',
        tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-muted',
      )}
    >
      <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
      {v > 0 ? '+' : ''}
      {formatNumber(v, decimals)}
      {unit === '%' ? '%' : unit ? ` ${unit}` : ''}
      <span className="sr-only">{tone === 'good' ? '(improving)' : tone === 'bad' ? '(worsening)' : ''}</span>
    </span>
  );
}

/**
 * A row's own unit / decimals win over its column's (mixed-unit tables: rainfall and runoff statistics, backend §12.2).
 * Trend columns (a rate: "/decade", "/yr") use the row's `trendDecimals`; the row's `decimals` is for its values.
 */
export function cellFormat(c: Column, row?: Record<string, Val>): Column {
  if (!row) return c;
  const trend = /trend|slope/i.test(c.key) || /\//.test(c.unit ?? '');
  const num = (v: Val) => (typeof v === 'number' ? v : undefined);
  const decimals = trend ? (num(row.trendDecimals) ?? c.decimals) : (num(row.decimals) ?? c.decimals);
  const unit = !trend && !c.unit && typeof row.unit === 'string' ? row.unit : c.unit;
  return decimals === c.decimals && unit === c.unit ? c : { ...c, decimals, unit };
}

export function renderCell(col: Column, v: Val, rowIndex: number, row?: Record<string, Val>): ReactNode {
  const c = cellFormat(col, row);
  if (c.type === 'rank') return <span className="text-muted">{rowIndex + 1}</span>;
  if (v == null || v === '') return <span className="text-muted">—</span>;
  switch (c.type) {
    case 'class':
      return <Pill scale={c.scale ?? 'status'} value={v} size="sm" />;
    case 'trend':
    case 'delta':
      return typeof v === 'number' ? (
        <TrendCell v={v} good={c.goodDirection ?? 'up'} unit={c.unit} decimals={c.decimals} />
      ) : (
        String(v)
      );
    case 'number': {
      if (typeof v !== 'number') return String(v);
      // a column's unit is in its header; a row's own unit (mixed tables) is printed with the value
      const rowUnit = c.unit !== col.unit;
      const txt = withUnit(formatNumber(v, c.decimals ?? 0), c.unit === '%' || rowUnit ? c.unit : undefined);
      if (c.scale) {
        const bin = classify(c.scale, v);
        return (
          <span
            className="num inline-block min-w-[3.2rem] rounded px-1.5 py-0.5 text-right font-semibold"
            style={bin ? { background: `${bin.color}33`, boxShadow: `inset 3px 0 0 ${bin.color}` } : undefined}
          >
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
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, Math.min(100, n))}%`, background: bin?.color ?? 'var(--c-primary)' }}
            />
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

export function DataTable({
  table,
  limit,
  viewAllHref,
  onRowClick,
  selectedKey,
  maxHeight = 420,
  caption,
  dense = true,
}: DataTableProps) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // columns past the card's right edge: a fade and a hint say so (scrolling is only needed when they don't fit)
  const [moreRight, setMoreRight] = useState(false);
  const measure = () => {
    const el = box.current;
    if (el) setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  };
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [table]);
  const id = useId();
  useEffect(
    () => registerExport({ id, title: table.title ?? caption ?? table.id, rows: tableRows(table) }),
    [id, table, caption],
  );

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
      <div className="relative">
        <div
          ref={box}
          className="overflow-auto rounded-lg border border-line"
          style={{ maxHeight }}
          onScroll={(e) => {
            if (virtual) setScrollTop(e.currentTarget.scrollTop);
            measure();
          }}
          tabIndex={0}
          role="region"
          aria-label={caption ?? table.title ?? 'Data table'}
        >
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
                      className={clsx(
                        'border-b border-line px-2 py-2 align-bottom text-[12px] font-semibold leading-tight text-ink-2',
                        // long headers wrap so every column fits the card; short ones stay on one line
                        c.label.length > 12 ? 'min-w-18 whitespace-normal' : 'whitespace-nowrap',
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-end gap-1 text-left hover:text-ink"
                          onClick={() =>
                            setSort((s) =>
                              s?.key === c.key
                                ? s.dir === 1
                                  ? { key: c.key, dir: -1 }
                                  : null
                                : { key: c.key, dir: 1 },
                            )
                          }
                        >
                          {/* one text run, so a long label and its unit wrap together */}
                          <span>
                            {c.label}
                            {c.unit && c.type === 'number' && c.unit !== '%' && (
                              <span className="font-normal text-muted"> ({c.unit})</span>
                            )}
                          </span>
                          {active ? (
                            sort!.dir === 1 ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )}
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
                    className={clsx(
                      'border-b border-line last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-surface-2',
                      selected && 'bg-primary-soft',
                    )}
                    style={virtual ? { height: ROW_H } : undefined}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(r) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={onRowClick ? selected : undefined}
                  >
                    {table.columns.map((c) => (
                      <td
                        key={c.key}
                        className={clsx(
                          'px-2',
                          dense ? 'py-1.5' : 'py-2.5',
                          c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                          c.type === 'text' &&
                            (String(r[c.key] ?? '').length <= 14
                              ? 'whitespace-nowrap'
                              : 'min-w-[6rem] max-w-[260px] whitespace-normal leading-snug'),
                        )}
                      >
                        {renderCell(c, r[c.key], start + i, r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {virtual && end < rows.length && (
                <tr style={{ height: (rows.length - end) * ROW_H }} aria-hidden="true" />
              )}
            </tbody>
          </table>
        </div>
        {moreRight && (
          <div
            className="pointer-events-none absolute inset-y-px right-px w-8 rounded-r-lg bg-linear-to-l from-surface to-transparent"
            aria-hidden="true"
          />
        )}
      </div>
      {moreRight && (
        <p className="mt-1 text-right text-[11px] text-muted" data-testid="table-more-columns">
          Scroll sideways for more columns →
        </p>
      )}
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
