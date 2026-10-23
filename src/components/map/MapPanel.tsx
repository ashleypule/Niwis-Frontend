import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Layers, X } from 'lucide-react';
import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useMapLayer } from '@/api/queries/core';
import type { MapLayer } from '@/types/api';
import { getScale } from '@/config/palettes';
import { Card, Tabs } from '@/components/ui/Card';
import { ErrorState, UnavailableState, useElapsed } from '@/components/feedback/PanelBoundary';
import { isUnavailable, provenanceOf } from '@/api/client';
import { isLive } from '@/config/app';
import { combineProvenance, panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { useUi } from '@/store/filters';
import { useGeo } from './geo';
import { useInView } from '@/lib/useInView';

const MapCanvas = lazy(() => import('./MapCanvas'));

export interface ThematicLayer {
  id: string;
  label: string;
  /** module that serves the layer (defaults to the panel module) */
  module?: ModuleId;
  /** layer id on the API (defaults to id) */
  layer?: string;
  params?: QueryParams;
}
export interface PointLayerDef {
  id: string;
  label: string;
  module: ModuleId;
  layer: string;
  defaultOn?: boolean;
  shape?: 'circle' | 'triangle' | 'square';
}
export type BaseId =
  'provinces' | 'wmas' | 'catchments' | 'districts' | 'municipalities' | 'rivers' | 'towns' | 'basemap';
const BASE_LABEL: Record<BaseId, string> = {
  provinces: 'Provincial boundaries',
  districts: 'District boundaries',
  wmas: 'Water Management Areas',
  catchments: 'Catchment boundaries',
  municipalities: 'Municipal boundaries',
  rivers: 'Rivers',
  towns: 'Major towns',
  basemap: 'Light basemap (CARTO)',
};

export interface MapPanelProps {
  module: ModuleId;
  title: string;
  layers: ThematicLayer[];
  pointLayers?: PointLayerDef[];
  baseLayers?: BaseId[];
  defaultBase?: BaseId[];
  height?: number;
  /** show layer tabs across the top (true) or only in the layer list */
  tabs?: boolean;
  className?: string;
  /** selected entity id (highlighted) */
  selected?: string;
  /** click a feature/point → select (defaults to setting the page entity filter for points) */
  onSelect?: (id: string, kind: 'feature' | 'point', layer: MapLayer) => void;
  footer?: ReactNode;
  context?: ReactNode;
  /** compact mini-map (no controls) */
  mini?: boolean;
  /** fixed layer (mini maps) */
  fixedLayer?: ThematicLayer;
}

export function Legend({ layer, collapsible = false }: { layer?: MapLayer; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  if (!layer) return null;
  const sc = getScale(layer.scale);
  return (
    <div className="rounded-lg border border-line bg-surface/95 p-2 text-[11px] shadow-card">
      <button
        type="button"
        className="mb-1 flex w-full items-center justify-between gap-2 text-left font-semibold text-ink"
        onClick={() => collapsible && setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!collapsible}
      >
        <span className="leading-tight">{layer.title}</span>
        {collapsible && <span className="text-muted">{open ? '−' : '+'}</span>}
      </button>
      {open && (
        <ul className="max-h-[190px] space-y-0.5 overflow-y-auto">
          {[...sc.bins].reverse().map((b) => (
            <li key={b.label} className="flex items-center gap-1.5 text-ink-2">
              <span
                className="h-3 w-4 shrink-0 rounded-sm border border-black/10"
                style={{ background: b.color }}
                aria-hidden="true"
              />
              {b.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-muted">
            <span
              className="h-3 w-4 shrink-0 rounded-sm border border-black/10"
              style={{ background: sc.noData }}
              aria-hidden="true"
            />
            No data
          </li>
        </ul>
      )}
    </div>
  );
}

export function MapPanel({
  module,
  title,
  layers,
  pointLayers = [],
  baseLayers = ['provinces', 'wmas', 'catchments', 'districts', 'municipalities', 'rivers', 'towns', 'basemap'],
  defaultBase = ['provinces'],
  height = 460,
  tabs = true,
  className,
  selected,
  onSelect,
  footer,
  context,
  mini = false,
  fixedLayer,
}: MapPanelProps) {
  const [active, setActive] = useState((fixedLayer ?? layers[0])?.id ?? '');
  const [base, setBase] = useState<Set<BaseId>>(new Set(defaultBase));
  const [points, setPoints] = useState<Set<string>>(new Set(pointLayers.filter((p) => p.defaultOn).map((p) => p.id)));
  const [sheet, setSheet] = useState(false);
  const [panel, setPanel] = useState(false);
  const theme = useUi((s) => s.theme);
  const setFilter = useUi((s) => s.setFilter);
  const entity = useUi((s) => s.filters.entity);
  const def = fixedLayer ?? layers.find((l) => l.id === active) ?? layers[0];
  // the layer, its boundaries (up to 240 KB each) and Leaflet load when the map nears the viewport, after the page has
  // loaded: a map near the top of a phone screen must not compete with the first paint
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, '300px', { afterLoad: true });
  const q = useMapLayer(def?.module ?? module, def?.layer ?? def?.id ?? '', def?.params, inView);
  const layer = q.data;
  const neighbours = useGeo('neighbours', inView);
  const level = layer?.kind === 'choropleth' ? layer.level : undefined;
  // backend layers name their boundary set: "districts" = 52 MDB-coded districts (public/geo/districts.json)
  const levelGeo = useGeo(
    layer?.geometry === 'districts'
      ? 'districts'
      : level === 'province'
        ? 'provinces'
        : level === 'wma'
          ? 'wmas'
          : level === 'catchment'
            ? 'catchments'
            : 'municipalities',
    !!level && inView,
  );
  const provinces = useGeo('provinces', inView && (base.has('provinces') || mini));
  const wmas = useGeo('wmas', inView && base.has('wmas'));
  const catchments = useGeo('catchments', inView && base.has('catchments'));
  const munis = useGeo('municipalities', inView && base.has('municipalities'));
  const districtLines = useGeo('districts', inView && base.has('districts'));
  const rivers = useGeo('rivers', inView && base.has('rivers'));
  const towns = useGeo('towns', inView && base.has('towns'));
  const sa = useGeo('south-africa', inView);
  const sel = selected ?? entity;
  const dark = theme === 'dark';
  // availability of every layer on a live module (501 → greyed in the layer list, with the backend's reason)
  const [layerStatus, setLayerStatus] = useState<Record<string, string | null>>({});
  const onStatus = useCallback(
    (id: string, reason: string | null) => setLayerStatus((s) => (s[id] === reason ? s : { ...s, [id]: reason })),
    [],
  );
  const [pointProv, setPointProv] = useState<Record<string, PanelProvenance | undefined>>({});
  const onPointProv = useCallback(
    (id: string, p: PanelProvenance | undefined) =>
      setPointProv((s) => (s[id]?.kind === p?.kind && s[id]?.detail === p?.detail ? s : { ...s, [id]: p })),
    [],
  );
  const prov = combineProvenance(
    panelProvenance(q, def?.module ?? module),
    ...pointLayers.filter((p) => points.has(p.id)).map((p) => pointProv[p.id] ?? { kind: 'none' as const }),
  );
  const probes = mini || fixedLayer ? [] : layerProbes(module, layers, pointLayers);
  const tabOptions = useMemo(() => layers.map((l) => ({ value: l.id, label: l.label })), [layers]);

  const handleSelect = (id: string, kind: 'feature' | 'point', l: MapLayer) => {
    if (onSelect) onSelect(id, kind, l);
    else if (kind === 'point') setFilter('entity', id);
  };

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const layerControl = (
    <div className="space-y-3 text-[13px]">
      {!fixedLayer && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Map layers</legend>
          {layers.map((l) => {
            const reason = layerStatus[`t:${l.id}`];
            return (
              <label
                key={l.id}
                className={clsx('flex cursor-pointer items-center gap-2 py-0.5', reason && 'text-muted')}
                title={reason ? `Not available: ${reason}` : undefined}
                data-unavailable={reason ? 'true' : undefined}
              >
                <input
                  type="radio"
                  name={`layer-${title}`}
                  checked={active === l.id}
                  onChange={() => setActive(l.id)}
                  className="accent-[var(--c-primary)]"
                />
                <span className="leading-tight">
                  {l.label}
                  {reason && <span className="block text-[10px] font-medium">Not available</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      {pointLayers.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Point layers</legend>
          {pointLayers.map((p) => {
            const reason = layerStatus[`p:${p.id}`];
            return (
              <label
                key={p.id}
                className={clsx('flex cursor-pointer items-center gap-2 py-0.5', reason && 'text-muted')}
                title={reason ? `Not available: ${reason}` : undefined}
                data-unavailable={reason ? 'true' : undefined}
              >
                <input
                  type="checkbox"
                  checked={points.has(p.id)}
                  onChange={() => setPoints((s) => toggle(s, p.id))}
                  className="accent-[var(--c-primary)]"
                />
                <span className="leading-tight">
                  {p.label}
                  {reason && <span className="block text-[10px] font-medium">Not available</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Base layers</legend>
        {baseLayers.map((b) => (
          <label key={b} className="flex cursor-pointer items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={base.has(b)}
              onChange={() => setBase((s) => toggle(s, b))}
              className="accent-[var(--c-primary)]"
            />
            {BASE_LABEL[b]}
          </label>
        ))}
      </fieldset>
    </div>
  );

  const map = (
    <div
      className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-line"
      style={{ height: mini ? height : undefined, minHeight: mini ? height : 320 }}
      data-testid="map"
      ref={box}
    >
      {/* Leaflet (and its layers) load only when the map nears the viewport */}
      {inView ? (
        <Suspense fallback={null}>
          <MapCanvas
            title={title}
            mini={mini}
            height={height}
            base={base}
            dark={dark}
            layer={layer}
            levelGeo={levelGeo.data}
            neighbours={neighbours.data}
            sa={sa.data}
            munis={munis.data}
            districtLines={districtLines.data}
            catchments={catchments.data}
            wmas={wmas.data}
            provinces={provinces.data}
            rivers={rivers.data}
            towns={towns.data}
            selected={sel}
            onSelect={handleSelect}
            pointLayers={pointLayers}
            points={points}
            onPointProv={onPointProv}
          />
        </Suspense>
      ) : null}
      {q.isError && (
        <div className="absolute inset-x-4 top-4 z-[600]">
          {isUnavailable(q.error) ? (
            <UnavailableState detail={q.error.detail} compact={mini} />
          ) : (
            <ErrorState message="Map layer could not be loaded." error={q.error} onRetry={() => q.refetch()} />
          )}
        </div>
      )}
      {q.isFetching && <LayerLoading />}
      {!mini && (
        <div className="pointer-events-auto absolute bottom-8 left-2 z-[500] hidden max-w-[210px] md:block">
          <Legend layer={layer} collapsible />
        </div>
      )}
      {!mini && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="absolute left-2 top-2 z-[500] flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-medium shadow-card md:hidden"
        >
          <Layers className="h-4 w-4" /> Layers
        </button>
      )}
      {!mini && (
        <div className="absolute left-2 top-2 z-[510] hidden md:block wide:hidden">
          <button
            type="button"
            onClick={() => setPanel((o) => !o)}
            aria-expanded={panel}
            className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-medium shadow-card hover:bg-surface-2"
          >
            <Layers className="h-4 w-4" /> Layers
          </button>
          {panel && (
            <div className="mt-1 max-h-[340px] w-[230px] overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-pop">
              {layerControl}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const probeViews = probes.map((p, i) => (
    <LayerProbe key={p.id} {...p} delay={p.layerId === def?.id ? 0 : 4000 + i * 1500} onStatus={onStatus} />
  ));

  if (mini) return map;

  return (
    <Card title={title} context={context} className={className} provenance={prov}>
      {probeViews}
      {tabs && layers.length > 1 && (
        <div className="mb-2">
          <Tabs label="Map layer" value={active} onChange={setActive} options={tabOptions} />
        </div>
      )}
      <div className="flex gap-3" style={{ height }}>
        <div className="hidden w-[210px] shrink-0 overflow-y-auto pr-1 wide:block">{layerControl}</div>
        <div className="flex min-w-0 flex-1 flex-col max-md:h-[60vh]">{map}</div>
      </div>
      <div className="mt-2 md:hidden">
        <Legend layer={layer} />
      </div>
      {footer}
      {sheet && (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label="Map layers">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Map layers</h3>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close layers" className="rounded p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            {layerControl}
          </div>
        </div>
      )}
    </Card>
  );
}

function LayerLoading() {
  const slow = useElapsed(3000);
  return (
    <div
      role="status"
      className="absolute left-2 top-2 z-[600] rounded-md bg-surface/90 px-2 py-1 text-[11px] text-muted shadow-card"
    >
      {slow ? 'Loading data from the national database…' : 'Loading layer…'}
    </div>
  );
}

interface Probe {
  id: string;
  layerId: string;
  module: ModuleId;
  layer: string;
  params?: QueryParams;
}

/** Layers of live modules whose availability the layer list should show. */
function layerProbes(module: ModuleId, layers: ThematicLayer[], points: PointLayerDef[]): Probe[] {
  return [
    ...layers.map((l) => ({
      id: `t:${l.id}`,
      layerId: l.id,
      module: l.module ?? module,
      layer: l.layer ?? l.id,
      params: l.params,
    })),
    ...points.map((p) => ({ id: `p:${p.id}`, layerId: p.id, module: p.module, layer: p.layer })),
  ].filter((p) => isLive(p.module));
}

/**
 * Fetches one layer in the background (staggered, to stay well under the backend's rate limit) and reports whether it
 * is available. Same query key as the map itself, so the probe also warms the cache for when the user picks it.
 */
function LayerProbe({
  id,
  module,
  layer,
  params,
  delay,
  onStatus,
}: Probe & { delay: number; onStatus: (id: string, reason: string | null) => void }) {
  const ready = useElapsed(delay);
  const q = useMapLayer(module, layer, params, ready);
  const p = provenanceOf(q.data);
  const reason =
    q.isError && isUnavailable(q.error)
      ? q.error.detail
      : p?.kind === 'sample' && p.detail
        ? p.detail
        : q.data
          ? null
          : undefined;
  useEffect(() => {
    if (reason !== undefined) onStatus(id, reason);
  }, [id, reason, onStatus]);
  return null;
}
