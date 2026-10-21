import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Download, Eye, FileSpreadsheet, FileText } from 'lucide-react';
import { MODULES, type ModuleId } from '@/config/modules';
import { useReference } from '@/api/queries/core';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { KpiSetSchema, TableSetSchema } from '@/types/api';
import { useUi, toParams } from '@/store/filters';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Row } from '@/components/layout/Grid';
import { download, downloadHistory, safeName, toCsv, type Row as CsvRow } from '@/lib/exporter';
import { formatDate } from '@/lib/format';
import { STANDARD_REPORTS } from './pageRegistry';

const BUILDER_PAGES = MODULES.filter((m) => m.group && !['alerts', 'reports'].includes(m.id)).flatMap((m) => [
  { path: m.path, label: m.label },
  ...(m.hasForecast ? [{ path: `${m.path}/forecast`, label: `${m.label} – Forecast` }] : []),
]);

/** Tables exported per module for the CSV/Excel export (the KPI summary is always included). */
const MODULE_TABLES: Partial<Record<ModuleId, string[]>> = {
  drought: ['affected', 'municipalities', 'early-warning', 'forecast-indicators'],
  dams: ['top10', 'lowest', 'key-dams-forecast'],
  climate: ['provinces', 'statistics'],
  rainfall: ['provinces', 'statistics'],
  runoff: ['statistics', 'top-stations'],
  groundwater: ['aquifers', 'lowest'],
  'groundwater-reserve': ['aquifers'],
  'water-quality': ['hotspots', 'ranking'],
  'green-drop': ['ranking'],
  'blue-drop': ['ranking'],
  iwrm: ['wmas', 'catchments'],
  services: ['plants', 'nrw'],
  tariffs: ['ranking'],
  settlements: ['top'],
};

export default function ReportsPage() {
  const navigate = useNavigate();
  const filters = useUi((s) => s.filters);
  const setFilter = useUi((s) => s.setFilter);
  const provinces = useReference('provinces');
  const [selected, setSelected] = useState<string[]>(['/drought', '/dams']);
  const [title, setTitle] = useState('Custom NIWIS Report');
  const [exportModule, setExportModule] = useState<ModuleId>('dams');
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState(downloadHistory);

  const exportModuleData = async (format: 'csv' | 'xls') => {
    setExporting(true);
    try {
      const params = { ...toParams(filters) };
      const rows: CsvRow[] = [];
      const kpis = await apiGet(endpoints.summary(exportModule), params, KpiSetSchema);
      kpis.kpis.forEach((k) =>
        rows.push({
          section: 'Key indicators',
          item: k.label,
          value: k.text ?? k.value,
          unit: k.unit ?? '',
          note: k.sublabel ?? '',
        }),
      );
      for (const t of MODULE_TABLES[exportModule] ?? []) {
        const tb = await apiGet(endpoints.table(exportModule), { ...params, metric: t }, TableSetSchema);
        tb.rows.forEach((r) =>
          rows.push({
            section: t,
            item: String(r[tb.columns.find((c) => c.type === 'text')?.key ?? tb.columns[0].key] ?? ''),
            value: JSON.stringify(Object.fromEntries(tb.columns.map((c) => [c.label, r[c.key] ?? null]))),
            unit: '',
            note: '',
          }),
        );
      }
      const name = `niwis-${safeName(exportModule)}-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'csv') download(`${name}.csv`, toCsv(rows));
      else {
        // Excel opens tab-separated values with an .xls extension; avoids a heavy xlsx dependency
        const cols = Object.keys(rows[0] ?? { section: '' });
        const tsv = [
          cols.join('\t'),
          ...rows.map((r) => cols.map((c) => String(r[c] ?? '').replace(/\t|\n/g, ' ')).join('\t')),
        ].join('\n');
        download(`${name}.xls`, tsv, 'application/vnd.ms-excel');
      }
      setHistory(downloadHistory());
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <Row className="xl:grid-cols-[1.6fr_1fr]">
        <Card title="Standard Reports" provenance={null}>
          <ul className="grid gap-2 md:grid-cols-2">
            {STANDARD_REPORTS.map((r) => (
              <li key={r.id} className="flex flex-col rounded-xl border border-line p-3">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ink">{r.title}</p>
                    <p className="text-xs text-muted">{r.description}</p>
                    <p className="mt-1 text-[11px] text-ink-2">Cadence: {r.cadence}</p>
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Link
                    to={`/reports/print?report=${r.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-ink hover:bg-primary-hover"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview / print
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid content-start gap-3">
          <Card title="Report Builder" provenance={null}>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted">
                Report title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
              </label>
              <Select
                hideLabel={false}
                label="Area"
                value={filters.province}
                onChange={(v) => setFilter('province', v)}
                placeholder="South Africa (national)"
                options={(provinces.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                hideLabel={false}
                label="Period"
                value={filters.period}
                onChange={(v) => setFilter('period', (v ?? '12M') as typeof filters.period)}
                options={['1M', '3M', '6M', '12M', '24M', '5Y', '10Y'].map((p) => ({ value: p, label: p }))}
              />
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-muted">Modules ({selected.length} selected)</legend>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-line p-2">
                  {BUILDER_PAGES.map((p) => (
                    <label key={p.path} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <input
                        type="checkbox"
                        className="accent-[var(--c-primary)]"
                        checked={selected.includes(p.path)}
                        onChange={(e) =>
                          setSelected((s) => (e.target.checked ? [...s, p.path] : s.filter((x) => x !== p.path)))
                        }
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button
                className="w-full"
                disabled={!selected.length}
                onClick={() =>
                  navigate(
                    `/reports/print?pages=${encodeURIComponent(selected.join(','))}&title=${encodeURIComponent(title)}`,
                  )
                }
              >
                <Eye className="h-4 w-4" /> Preview report
              </Button>
            </div>
          </Card>
          <Card title="Data Export (Current Filters)" provenance={null}>
            <div className="space-y-2">
              <Select
                hideLabel={false}
                label="Module"
                value={exportModule}
                onChange={(v) => setExportModule((v ?? 'dams') as ModuleId)}
                options={Object.keys(MODULE_TABLES).map((id) => ({
                  value: id,
                  label: MODULES.find((m) => m.id === id)!.label,
                }))}
              />
              <div className="flex gap-2">
                <Button
                  variant="action"
                  className="flex-1"
                  disabled={exporting}
                  onClick={() => exportModuleData('csv')}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={exporting}
                  onClick={() => exportModuleData('xls')}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </Button>
              </div>
            </div>
          </Card>
          <Card title="Downloads History (this browser)" provenance={null}>
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No downloads yet.</p>
            ) : (
              <ul className="max-h-60 divide-y divide-line overflow-y-auto text-[13px]">
                {history.map((h, k) => (
                  <li key={k} className="flex justify-between gap-2 py-1.5">
                    <span className="truncate">{h.file}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDate(h.at, 'datetime')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Row>
    </div>
  );
}
