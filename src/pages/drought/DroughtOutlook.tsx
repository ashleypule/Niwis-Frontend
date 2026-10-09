import { MapPanel } from '@/components/map/MapPanel';
import { Card } from '@/components/ui/Card';
import { MatrixLegend } from '@/components/charts/MatrixLegend';
import { useTable } from '@/api/queries/core';
import { APP } from '@/config/app';
import { MONTH_NAMES } from '@/lib/format';

const outlookMonth = (h: number) => {
  const d = new Date(Date.UTC(APP.asOf.getUTCFullYear(), APP.asOf.getUTCMonth() + h - 1, 15));
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Three mini maps of the SPI-3 outlook for the next three months, plus key takeaways. */
export function DroughtOutlook() {
  const ew = useTable('drought', 'early-warning');
  const affected = useTable('drought', 'affected', { level: 'province' });
  const overall = ew.data?.rows.find((r) => r.indicator === 'Overall risk');
  const worst = affected.data?.rows.slice(0, 2).map((r) => String(r.name)) ?? [];
  const spiRow = ew.data?.rows.find((r) => String(r.indicator).startsWith('Drought index'));
  return (
    <Card title="Drought Outlook (Next 3 Months)" info="Damped-persistence SPI-3 outlook with a seasonal signal. See the Predictions & Forecasting tab for uncertainty bands.">
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((h) => (
          <figure key={h} className="min-w-0">
            <figcaption className="mb-1 truncate text-center text-xs font-semibold text-ink-2">{outlookMonth(h)}</figcaption>
            <MapPanel module="drought" title={`SPI-3 outlook +${h}`} layers={[]} fixedLayer={{ id: `outlook-${h}`, label: `+${h}` }} mini height={150} />
          </figure>
        ))}
      </div>
      <MatrixLegend scale="spi" />
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-2">
        <li>
          Outlook SPI-3 in 3 months: <b>{String(spiRow?.forecast ?? '…')}</b> (now {String(spiRow?.current ?? '…')}).
        </li>
        <li>
          Overall drought risk next quarter: <b>{String(overall?.forecast ?? '…')}</b>.
        </li>
        {worst.length > 0 && (
          <li>
            Most exposed now: <b>{worst.join(' and ')}</b>.
          </li>
        )}
      </ul>
    </Card>
  );
}
