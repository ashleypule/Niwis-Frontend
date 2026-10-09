import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, Expand, ImageDown, MoreVertical, Table2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/PanelBoundary';
import { download, registerExport, safeName, toCsv, type Row } from '@/lib/exporter';
import { EChart, type EChartHandle } from './EChart';
import type { EChartsOption } from './echarts';
import { useChartTheme } from './theme';

export interface ChartCardProps {
  title: string;
  context?: ReactNode;
  info?: string;
  /** tab row / entity selector shown under the title */
  controls?: ReactNode;
  height?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  empty?: boolean;
  /** rows for CSV export / data-table view */
  rows?: Row[];
  /** chart option; omit and pass children for custom bodies */
  option?: EChartsOption;
  children?: ReactNode;
  className?: string;
  band?: boolean;
  footer?: ReactNode;
  onChartClick?: (p: unknown) => void;
}

function DataTableView({ rows }: { rows: Row[] }) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className="max-h-[320px] overflow-auto rounded-lg border border-line">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {cols.map((c) => (
              <th key={c} scope="col" className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-ink-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1 text-ink">
                  {r[c] == null
                    ? '—'
                    : typeof r[c] === 'number'
                      ? Number(r[c]).toLocaleString('en-ZA', { maximumFractionDigits: 3 }).replace(/,/g, ' ')
                      : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  context,
  info,
  controls,
  height = 220,
  isLoading,
  isError,
  onRetry,
  empty,
  rows,
  option,
  children,
  className,
  band,
  footer,
  onChartClick,
}: ChartCardProps) {
  const [menu, setMenu] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [full, setFull] = useState(false);
  const chart = useRef<EChartHandle>(null);
  const id = useId();
  const t = useChartTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rows?.length) return;
    return registerExport({ id, title, rows });
  }, [id, title, rows]);

  useEffect(() => {
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const actions = useMemo(
    () => (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
          aria-label={`${title} options`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-line bg-surface p-1 text-sm shadow-pop"
          >
            {option && (
              <button
                role="menuitem"
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2"
                onClick={() => {
                  const url = chart.current?.toPng(t.surface);
                  if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${safeName(title)}.png`;
                    a.click();
                  }
                  setMenu(false);
                }}
              >
                <ImageDown className="h-4 w-4" /> Download PNG
              </button>
            )}
            {!!rows?.length && (
              <button
                role="menuitem"
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2"
                onClick={() => (download(`${safeName(title)}.csv`, toCsv(rows)), setMenu(false))}
              >
                <Download className="h-4 w-4" /> Download CSV
              </button>
            )}
            {!!rows?.length && (
              <button
                role="menuitem"
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2"
                onClick={() => (setShowTable((s) => !s), setMenu(false))}
              >
                <Table2 className="h-4 w-4" /> {showTable ? 'Hide data table' : 'View data table'}
              </button>
            )}
            {option && (
              <button
                role="menuitem"
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-2"
                onClick={() => (setFull(true), setMenu(false))}
              >
                <Expand className="h-4 w-4" /> Full screen
              </button>
            )}
          </div>
        )}
      </div>
    ),
    [menu, option, rows, showTable, t.surface, title],
  );

  let body: ReactNode;
  if (isError) body = <ErrorState onRetry={onRetry} height={height} />;
  else if (isLoading) body = <Skeleton height={height} />;
  else if (empty) body = <EmptyState height={height} />;
  else if (option)
    body = <EChart ref={chart} option={option} height={height} ariaLabel={`${title} chart`} onClick={onChartClick} />;
  else body = children;

  return (
    <Card title={title} context={context} info={info} actions={actions} className={className} band={band}>
      {controls && <div className="mb-1.5 flex flex-wrap items-center gap-2">{controls}</div>}
      {body}
      {option && children}
      {showTable && rows && (
        <div className="mt-2">
          <DataTableView rows={rows} />
        </div>
      )}
      {footer}
      {full && option && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} (full screen)`}
        >
          <div className="flex h-full max-h-[90vh] w-full max-w-[1400px] flex-col rounded-2xl bg-surface p-4 shadow-pop">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={() => setFull(false)}
                className="rounded p-1.5 hover:bg-surface-2"
                aria-label="Close full screen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <EChart option={option} height="100%" ariaLabel={`${title} chart (full screen)`} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
