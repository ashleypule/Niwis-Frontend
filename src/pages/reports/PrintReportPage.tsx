import { Suspense, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { APP, isMock } from '@/config/app';
import { moduleForPath } from '@/config/modules';
import { formatDate } from '@/lib/format';
import { useUi } from '@/store/filters';
import { DwsLogo } from '@/components/shell/Brand';
import { PageSkeleton } from '@/components/feedback/PageSkeleton';
import { recordDownload } from '@/lib/exporter';
import { PAGE_COMPONENTS, STANDARD_REPORTS } from './pageRegistry';

/**
 * Print-optimised report: A4 cover (NIWIS branding, generated date, filters, sample-data notice) followed by the
 * selected pages rendered with the current filters. Use the browser's "Save as PDF".
 */
export default function PrintReportPage() {
  const [sp] = useSearchParams();
  const f = useUi((s) => s.filters);
  const report = STANDARD_REPORTS.find((r) => r.id === sp.get('report'));
  const pages = report ? report.pages : (sp.get('pages')?.split(',') ?? [sp.get('page') ?? '/']).filter((p) => p in PAGE_COMPONENTS);
  const title = report?.title ?? sp.get('title') ?? (pages.length === 1 ? moduleForPath(pages[0]).label + (pages[0].endsWith('/forecast') ? ' – Predictions & Forecasting' : '') : 'Custom NIWIS Report');
  useEffect(() => {
    document.title = `${title} · NIWIS report`;
    recordDownload(`${title} (print view)`);
  }, [title]);
  const scope = [f.province && `Province: ${f.province}`, f.wma && `WMA: ${f.wma}`, f.catchment && `Catchment: ${f.catchment}`, f.municipality && `Municipality: ${f.municipality}`].filter(Boolean).join(' · ') || 'South Africa (national)';
  return (
    <div className="bg-canvas text-ink">
      <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <Link to={pages[0] ?? '/reports'} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <span className="text-sm text-muted">Print preview – use “Save as PDF” in the print dialog (A4)</span>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-ink">
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>
      <section className="hero flex min-h-[60vh] flex-col justify-between px-8 py-10 text-white print:min-h-[260mm]" aria-label="Report cover">
        <div className="relative z-10">
          <DwsLogo />
          <p className="mt-10 text-sm uppercase tracking-[0.2em] text-white/70">National Integrated Water Information System</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-extrabold leading-tight">{title}</h1>
          {report && <p className="mt-3 max-w-2xl text-white/85">{report.description}</p>}
        </div>
        <dl className="relative z-10 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-white/70">Generated</dt>
          <dd>{formatDate(new Date(), 'datetime')} (SAST)</dd>
          <dt className="text-white/70">Data as of</dt>
          <dd>{formatDate(APP.asOf)}</dd>
          <dt className="text-white/70">Area</dt>
          <dd>{scope}</dd>
          <dt className="text-white/70">Period</dt>
          <dd>{f.from || f.to ? `${f.from ?? '…'} – ${f.to ?? 'latest'}` : f.period}</dd>
          <dt className="text-white/70">Issued by</dt>
          <dd>Department of Water and Sanitation, Republic of South Africa</dd>
        </dl>
        {isMock && <p className="relative z-10 mt-6 rounded-lg border border-amber-300/60 bg-amber-400/15 px-3 py-2 text-sm font-semibold text-amber-100">SAMPLE DATA — generated for design and testing. Not for operational decisions.</p>}
      </section>
      {pages.map((p) => {
        const Page = PAGE_COMPONENTS[p];
        const mod = moduleForPath(p);
        return (
          <section key={p} className="print-break px-4 py-6">
            <h2 className="mb-3 border-b-2 border-primary pb-1 text-2xl font-bold text-ink">
              {mod.label}
              {p.endsWith('/forecast') ? ' – Predictions & Forecasting' : ''}
            </h2>
            <Suspense fallback={<PageSkeleton />}>
              <Page />
            </Suspense>
          </section>
        );
      })}
    </div>
  );
}
