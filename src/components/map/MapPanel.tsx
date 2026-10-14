import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Home, Layers, Minus, Plus, X } from 'lucide-react';
import type { ModuleId } from '@/config/modules';
import type { QueryParams } from '@/api/client';
import { useMapLayer } from '@/api/queries/core';
import type { MapLayer } from '@/types/api';
import { classify, colorFor, getScale } from '@/config/palettes';
import { formatNumber, withUnit } from '@/lib/format';
import { Card, Tabs } from '@/components/ui/Card';
import { ErrorState, UnavailableState, useElapsed } from '@/components/feedback/PanelBoundary';
import { isUnavailable, provenanceOf } from '@/api/client';
import { isLive } from '@/config/app';
import { combineProvenance, panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { useUi } from '@/store/filters';
import { labelPoint, SA_BOUNDS, useGeo, type GeoFC } from './geo';

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
type BaseId = 'provinces' | 'wmas' | 'catchments' | 'districts' | 'municipalities' | 'rivers' | 'towns' | 'basemap';
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

// ------------------------------------------------------------------ imperative layers
function useLeafletLayer(make: (map: L.Map) => L.Layer | null, deps: unknown[]) {
  const map = useMap();
  useEffect(() => {
    const layer = make(map);
    if (layer) layer.addTo(map);
    return () => {
      if (layer) map.removeLayer(layer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

/** Fixed z-order regardless of the order layers are (re)added. */
const PANES: [string, number][] = [
  ['basefill', 380],
  ['thematic', 400],
  ['outlines', 420],
  ['rivers', 425],
  ['points', 440],
];
function Panes() {
  const map = useMap();
  // create synchronously during the first render so child layers can target the panes
  for (const [name, z] of PANES) {
    if (!map.getPane(name)) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(z);
      if (name !== 'thematic' && name !== 'points') pane.style.pointerEvents = 'none';
    }
  }
  return null;
}

function NeighbourLayer({ data, dark }: { data?: GeoFC; dark: boolean }) {
  useLeafletLayer(() => {
    if (!data) return null;
    const g = L.layerGroup();
    L.geoJSON(data, {
      pane: 'basefill',
      style: {
        color: dark ? '#3a4b63' : '#b9c2cc',
        weight: 0.8,
        fillColor: dark ? '#26354a' : '#d9dee4',
        fillOpacity: 1,
      },
      interactive: false,
    }).addTo(g);
    data.features.forEach((f) => {
      const p = labelPoint(f.geometry);
      if (!p) return;
      const name = (f.properties.name ?? '').replace('Republic of ', '').toUpperCase();
      L.tooltip({ permanent: true, direction: 'center', className: 'niwis-label country', interactive: false })
        .setLatLng(p)
        .setContent(name)
        .addTo(g);
    });
    L.tooltip({ permanent: true, direction: 'center', className: 'niwis-label ocean' })
      .setLatLng([-33.4, 16.9])
      .setContent('Atlantic<br/>Ocean')
      .addTo(g);
    L.tooltip({ permanent: true, direction: 'center', className: 'niwis-label ocean' })
      .setLatLng([-32.2, 31.6])
      .setContent('Indian Ocean')
      .addTo(g);
    return g;
  }, [data, dark]);
  return null;
}

function OutlineLayer({
  data,
  color,
  weight,
  dash,
  labels,
  pane,
}: {
  data?: GeoFC;
  color: string;
  weight: number;
  dash?: string;
  labels?: boolean;
  pane?: string;
}) {
  useLeafletLayer(() => {
    if (!data) return null;
    const g = L.layerGroup();
    L.geoJSON(data, {
      style: { color, weight, dashArray: dash, fill: false },
      interactive: false,
      pane: pane ?? 'outlines',
    }).addTo(g);
    if (labels)
      data.features.forEach((f) => {
        const p = labelPoint(f.geometry);
        if (p)
          L.tooltip({ permanent: true, direction: 'center', className: 'niwis-label' })
            .setLatLng(p)
            .setContent((f.properties.name ?? '').toUpperCase())
            .addTo(g);
      });
    return g;
  }, [data, color, weight, dash, labels]);
  return null;
}

function RiversLayer({ data }: { data?: GeoFC }) {
  useLeafletLayer(
    () =>
      data
        ? L.geoJSON(data, {
            style: (f) => ({
              color: '#3b82c4',
              weight: f?.properties.scalerank != null && f.properties.scalerank <= 6 ? 1.6 : 1,
              opacity: 0.8,
            }),
            interactive: false,
            pane: 'rivers',
          })
        : null,
    [data],
  );
  return null;
}

function TownsLayer({ data }: { data?: GeoFC }) {
  useLeafletLayer(() => {
    if (!data) return null;
    const g = L.layerGroup();
    data.features.forEach((f) => {
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      L.circleMarker([lat, lon], {
        radius: 2.5,
        color: '#13233a',
        weight: 1,
        fillColor: '#fff',
        fillOpacity: 1,
        pane: 'rivers',
        interactive: false,
      }).addTo(g);
      if ((f.properties.pop ?? 0) > 400000)
        L.tooltip({ permanent: true, direction: 'right', offset: [4, 0], className: 'niwis-label', interactive: false })
          .setLatLng([lat, lon])
          .setContent(f.properties.name ?? '')
          .addTo(g);
    });
    return g;
  }, [data]);
  return null;
}

function tipHtml(name: string, value: string, extra?: string) {
  return `<div style="font-weight:600">${name}</div><div>${value}</div>${extra ? `<div style="color:var(--c-muted);font-size:11px">${extra}</div>` : ''}`;
}

function valueText(layer: MapLayer, v: number | string | null | undefined): string {
  if (v == null) return 'No data';
  if (typeof v === 'string') return classify(layer.scale, v)?.label ?? v;
  const bin = classify(layer.scale, v);
  const dec = Math.abs(v) < 1 ? 2 : Math.abs(v) < 10 ? 1 : 0;
  return `${withUnit(formatNumber(v, dec), layer.unit)}${bin ? ` · ${bin.label.replace(/^[^A-Za-z]*\s/, '')}` : ''}`;
}

function ThematicLayerView({
  layer,
  geo,
  selected,
  onSelect,
}: {
  layer: MapLayer;
  geo?: GeoFC;
  selected?: string;
  onSelect?: (id: string, kind: 'feature' | 'point') => void;
}) {
  useLeafletLayer(() => {
    const g = L.layerGroup();
    const canvas = L.canvas({ padding: 0.3, pane: 'thematic' });
    if (layer.kind === 'choropleth' && geo && layer.values) {
      L.geoJSON(geo, {
        pane: 'thematic',
        style: (f) => {
          const id = f?.properties.id ?? '';
          const sel = selected === id;
          return {
            color: sel ? '#0b1f3a' : '#ffffff',
            weight: sel ? 2.5 : 0.6,
            fillColor: colorFor(layer.scale, layer.values![id] ?? null),
            fillOpacity: 0.92,
          };
        },
        onEachFeature: (f, l) => {
          const id = f.properties.id ?? '';
          l.bindTooltip(tipHtml(f.properties.name ?? id, valueText(layer, layer.values![id])), {
            sticky: true,
            className: 'niwis-tip',
          });
          l.on('mouseover', () => (l as L.Path).setStyle({ weight: 2, color: '#0b1f3a' }));
          l.on('mouseout', () =>
            (l as L.Path).setStyle({
              weight: selected === id ? 2.5 : 0.6,
              color: selected === id ? '#0b1f3a' : '#ffffff',
            }),
          );
          if (onSelect) l.on('click', () => onSelect(id, 'feature'));
        },
      }).addTo(g);
    }
    if (layer.kind === 'grid' && layer.cells) {
      const h = (layer.cellSize ?? 0.25) / 2;
      for (const [lon, lat, v] of layer.cells) {
        L.rectangle(
          [
            [lat - h, lon - h],
            [lat + h, lon + h],
          ],
          {
            renderer: canvas,
            stroke: false,
            fillColor: colorFor(layer.scale, v),
            fillOpacity: 0.95,
            interactive: true,
          },
        )
          .bindTooltip(tipHtml(`${Math.abs(lat).toFixed(2)}° S, ${lon.toFixed(2)}° E`, valueText(layer, v)), {
            sticky: true,
            className: 'niwis-tip',
          })
          .addTo(g);
      }
    }
    return g;
  }, [layer, geo, selected]);
  return null;
}

function PointsView({
  layer,
  selected,
  onSelect,
  shape = 'circle',
}: {
  layer: MapLayer;
  selected?: string;
  onSelect?: (id: string) => void;
  shape?: 'circle' | 'triangle' | 'square';
}) {
  useLeafletLayer(() => {
    if (!layer.points) return null;
    const g = L.layerGroup();
    const canvas = L.canvas({ padding: 0.3, pane: 'points' });
    const pts = [...layer.points].sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    for (const p of pts) {
      const sel = selected === p.id;
      const r = 4 + (p.size ?? 0.3) * 9;
      const color = colorFor(layer.scale, p.value);
      const opts = {
        renderer: canvas,
        radius: sel ? r + 3 : r,
        color: sel ? '#0b1f3a' : '#ffffff',
        weight: sel ? 3 : 1.2,
        fillColor: color,
        fillOpacity: 0.95,
      };
      let m: L.Path;
      if (shape === 'circle') m = L.circleMarker([p.lat, p.lon], opts);
      else {
        const d = (opts.radius / 111) * 1.1;
        const pts2: [number, number][] =
          shape === 'triangle'
            ? [
                [p.lat + d, p.lon],
                [p.lat - d * 0.7, p.lon - d],
                [p.lat - d * 0.7, p.lon + d],
              ]
            : [
                [p.lat + d * 0.8, p.lon - d * 0.8],
                [p.lat + d * 0.8, p.lon + d * 0.8],
                [p.lat - d * 0.8, p.lon + d * 0.8],
                [p.lat - d * 0.8, p.lon - d * 0.8],
              ];
        m = L.polygon(pts2, { ...opts, radius: undefined } as L.PolylineOptions);
      }
      m.bindTooltip(tipHtml(p.name, valueText(layer, p.value), p.sub), { className: 'niwis-tip', direction: 'top' });
      if (onSelect) m.on('click', () => onSelect(p.id));
      m.addTo(g);
    }
    return g;
  }, [layer, selected]);
  return null;
}

function Controls() {
  const map = useMap();
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink shadow-card hover:bg-surface-2';
  return (
    <div className="absolute right-2 top-2 z-[500] flex flex-col gap-1">
      <button type="button" className={btn} onClick={() => map.zoomIn()} aria-label="Zoom in">
        <Plus className="h-4 w-4" />
      </button>
      <button type="button" className={btn} onClick={() => map.zoomOut()} aria-label="Zoom out">
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => map.fitBounds(SA_BOUNDS)}
        aria-label="Reset view to South Africa"
      >
        <Home className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Zoom to my location"
        onClick={() =>
          navigator.geolocation?.getCurrentPosition(
            (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 9),
            () => undefined,
            { timeout: 8000 },
          )
        }
      >
        <Crosshair className="h-4 w-4" />
      </button>
    </div>
  );
}

function ScaleAndNorth() {
  const map = useMap();
  useEffect(() => {
    const s = L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 140 }).addTo(map);
    return () => {
      s.remove();
    };
  }, [map]);
  return (
    <div
      className="pointer-events-none absolute bottom-8 right-3 z-[500] flex flex-col items-center text-ink"
      aria-hidden="true"
    >
      <span className="text-[11px] font-bold">N</span>
      <svg width="16" height="22" viewBox="0 0 16 22">
        <path d="M8 0 L15 22 L8 17 L1 22 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function Basemap({ on }: { on: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!on) return;
    let failed = 0;
    const tl = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      attribution: '© OpenStreetMap contributors © CARTO',
      opacity: 0.6,
    });
    // graceful offline fallback: drop the tiles after repeated errors
    tl.on('tileerror', () => {
      failed += 1;
      if (failed > 6) map.removeLayer(tl);
    });
    tl.addTo(map);
    tl.bringToBack();
    return () => {
      map.removeLayer(tl);
    };
  }, [on, map]);
  return null;
}

/** Keep the map sized to its container; refit to South Africa until the user pans or zooms. */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let touched = false;
    const mark = () => (touched = true);
    el.addEventListener('mousedown', mark);
    el.addEventListener('wheel', mark, { passive: true });
    el.addEventListener('touchstart', mark, { passive: true });
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!touched && el.clientWidth > 0) map.fitBounds(SA_BOUNDS, { animate: false });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.removeEventListener('mousedown', mark);
      el.removeEventListener('wheel', mark);
      el.removeEventListener('touchstart', mark);
    };
  }, [map]);
  return null;
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

function PointLayerLoader({
  def,
  selected,
  onSelect,
  onProvenance,
}: {
  def: PointLayerDef;
  selected?: string;
  onSelect?: (id: string, layer: MapLayer) => void;
  onProvenance?: (id: string, p: PanelProvenance | undefined) => void;
}) {
  const q = useMapLayer(def.module, def.layer);
  const prov = panelProvenance(q, def.module);
  useEffect(() => {
    onProvenance?.(def.id, prov);
    return () => onProvenance?.(def.id, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id, prov.kind, prov.detail, onProvenance]);
  if (!q.data) return null;
  return (
    <PointsView
      layer={q.data}
      selected={selected}
      onSelect={onSelect ? (id) => onSelect(id, q.data!) : undefined}
      shape={def.shape}
    />
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
  const q = useMapLayer(def?.module ?? module, def?.layer ?? def?.id ?? '', def?.params);
  const layer = q.data;
  const neighbours = useGeo('neighbours');
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
    !!level,
  );
  const provinces = useGeo('provinces', base.has('provinces') || mini);
  const wmas = useGeo('wmas', base.has('wmas'));
  const catchments = useGeo('catchments', base.has('catchments'));
  const munis = useGeo('municipalities', base.has('municipalities'));
  const districtLines = useGeo('districts', base.has('districts'));
  const rivers = useGeo('rivers', base.has('rivers'));
  const towns = useGeo('towns', base.has('towns'));
  const sa = useGeo('south-africa');
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
  const mapRef = useRef<L.Map | null>(null);
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
      style={{ height: mini ? height : undefined }}
      data-testid="map"
    >
      <MapContainer
        bounds={SA_BOUNDS}
        zoomControl={false}
        attributionControl={!mini}
        scrollWheelZoom={!mini}
        dragging={!mini}
        doubleClickZoom={!mini}
        minZoom={4}
        maxZoom={12}
        zoomSnap={0.25}
        preferCanvas
        style={{ height: '100%', width: '100%', minHeight: mini ? height : 320 }}
        ref={mapRef}
        aria-label={`${title} map`}
      >
        <Panes />
        <InvalidateOnResize />
        <Basemap on={base.has('basemap')} />
        <NeighbourLayer data={neighbours.data} dark={dark} />
        {/* SA land underlay so cells/polygons without data read as land, not ocean */}
        {sa.data && <OutlineLayerFill data={sa.data} dark={dark} />}
        {layer &&
          (layer.kind !== 'points' ? (
            <ThematicLayerView
              layer={layer}
              geo={levelGeo.data}
              selected={sel}
              onSelect={(id, k) => handleSelect(id, k, layer)}
            />
          ) : (
            <PointsView layer={layer} selected={sel} onSelect={(id) => handleSelect(id, 'point', layer)} />
          ))}
        {base.has('municipalities') && (
          <OutlineLayer data={munis.data} color={dark ? '#8aa0bd' : '#ffffff'} weight={0.5} />
        )}
        {base.has('districts') && (
          <OutlineLayer data={districtLines.data} color={dark ? '#a9bbd3' : '#5b6b80'} weight={0.8} />
        )}
        {base.has('catchments') && <OutlineLayer data={catchments.data} color="#3b6ea5" weight={0.7} dash="3 3" />}
        {base.has('wmas') && <OutlineLayer data={wmas.data} color="#0f4c81" weight={1.4} dash="6 3" />}
        {(base.has('provinces') || mini) && (
          <OutlineLayer
            data={provinces.data}
            color={dark ? '#c4d2e3' : '#334155'}
            weight={mini ? 0.6 : 1.1}
            labels={!mini && base.has('provinces')}
          />
        )}
        {sa.data && <OutlineLayer data={sa.data} color={dark ? '#c4d2e3' : '#1f2d3d'} weight={1.4} />}
        {base.has('rivers') && <RiversLayer data={rivers.data} />}
        {base.has('towns') && <TownsLayer data={towns.data} />}
        {pointLayers
          .filter((p) => points.has(p.id))
          .map((p) => (
            <PointLayerLoader
              key={p.id}
              def={p}
              selected={sel}
              onSelect={(id, l) => handleSelect(id, 'point', l)}
              onProvenance={onPointProv}
            />
          ))}
        {!mini && <Controls />}
        {!mini && <ScaleAndNorth />}
      </MapContainer>
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

function OutlineLayerFill({ data, dark }: { data: GeoFC; dark: boolean }) {
  useLeafletLayer(
    () =>
      L.geoJSON(data, {
        pane: 'basefill',
        style: { stroke: false, fillColor: dark ? '#1b2a42' : '#f4f1e8', fillOpacity: 1 },
        interactive: false,
      }),
    [data, dark],
  );
  return null;
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
