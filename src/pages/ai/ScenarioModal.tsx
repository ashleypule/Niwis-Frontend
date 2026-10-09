import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useForecast, useReference } from '@/api/queries/core';
import { useChartTheme } from '@/components/charts/theme';
import { seriesOption } from '@/components/charts/options';
import { EChart } from '@/components/charts/EChart';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/feedback/PanelBoundary';
import type { Entity } from '@/types/api';

/**
 * "Run Scenario" dialog: choose module, entity (dam or province), scenario and horizon; renders the scenario
 * forecast from the forecast API (mock forecasts in mock mode).
 */
export function ScenarioModal({ onClose, dams }: { onClose: () => void; dams: Entity[] }) {
  const [target, setTarget] = useState('reservoir');
  const [entity, setEntity] = useState<string | undefined>(undefined);
  const [province, setProvince] = useState<string | undefined>(undefined);
  const [scenario, setScenario] = useState('all');
  const [horizon, setHorizon] = useState('24');
  const [run, setRun] = useState<Record<string, string | undefined> | null>(null);
  const provinces = useReference('provinces');
  const t = useChartTheme();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.querySelector('select')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const q = useForecast('ai', 'scenario', run ?? {}, !!run);
  const option = useMemo(() => (q.data ? seriesOption(q.data, t) : undefined), [q.data, t]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label="Run scenario">
      <div ref={ref} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold">Run Scenario</h2>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-surface-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select hideLabel={false} label="Module" value={target} onChange={(v) => setTarget(v ?? 'reservoir')} options={[{ value: 'reservoir', label: 'Reservoir storage' }, { value: 'drought', label: 'Drought (SPI-3)' }, { value: 'groundwater', label: 'Groundwater level' }]} />
          {target === 'reservoir' ? (
            <Select hideLabel={false} label="Dam" value={entity} onChange={setEntity} placeholder="All dams (national)" options={dams.map((d) => ({ value: d.id, label: d.name }))} />
          ) : (
            <Select hideLabel={false} label="Area" value={province} onChange={setProvince} placeholder="South Africa" options={(provinces.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          )}
          <Select hideLabel={false} label="Scenario" value={scenario} onChange={(v) => setScenario(v ?? 'all')} options={[{ value: 'all', label: 'Compare all' }, { value: 'baseline', label: 'Baseline' }, { value: 'rcp26', label: 'RCP 2.6' }, { value: 'rcp85', label: 'RCP 8.5' }]} />
          <Select hideLabel={false} label="Horizon" value={horizon} onChange={(v) => setHorizon(v ?? '24')} options={['6', '12', '24'].map((h) => ({ value: h, label: `${h} months` }))} />
          <div className="flex items-end">
            <Button className="w-full" onClick={() => setRun({ target, scenario, horizon, entityId: target === 'reservoir' ? entity : undefined, province: target === 'reservoir' ? undefined : province ?? '' })}>
              Run
            </Button>
          </div>
        </div>
        <div className="min-h-[340px] flex-1 px-4 pb-4">
          {!run ? (
            <p className="py-16 text-center text-sm text-muted">Choose the options above and select Run. Results use the sample forecast engine.</p>
          ) : q.isLoading || !option ? (
            <Skeleton height={320} />
          ) : (
            <EChart option={option} height={340} ariaLabel="Scenario forecast chart" />
          )}
        </div>
      </div>
    </div>
  );
}
