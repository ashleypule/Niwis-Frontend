/**
 * The Leaflet part of MapPanel: the map, its basemap, boundaries, thematic and point layers and controls. Loaded with
 * a dynamic import when the panel nears the viewport, so Leaflet is not part of any page's first download.
 */
import { useEffect } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Home, Minus, Plus } from 'lucide-react';
import { useMapLayer } from '@/api/queries/core';
import type { MapLayer } from '@/types/api';
import { classify, colorFor } from '@/config/palettes';
import { formatNumber, withUnit } from '@/lib/format';
import { panelProvenance, type PanelProvenance } from '@/components/provenance/provenance';
import { labelPoint, SA_BOUNDS, type GeoFC } from './geo';
import type { BaseId, PointLayerDef } from './MapPanel';

export interface MapCanvasProps {
  title: string;
  mini: boolean;
  height: number;
  base: Set<BaseId>;
  dark: boolean;
  layer?: MapLayer;
  levelGeo?: GeoFC;
  neighbours?: GeoFC;
  sa?: GeoFC;
  munis?: GeoFC;
  districtLines?: GeoFC;
  catchments?: GeoFC;
  wmas?: GeoFC;
  provinces?: GeoFC;
  rivers?: GeoFC;
  towns?: GeoFC;
  selected?: string;
  onSelect: (id: string, kind: 'feature' | 'point', layer: MapLayer) => void;
  pointLayers: PointLayerDef[];
  points: Set<string>;
  onPointProv: (id: string, p: PanelProvenance | undefined) => void;
}

export default function MapCanvas({
  title,
  mini,
  height,
  base,
  dark,
  layer,
  levelGeo,
  neighbours,
  sa,
  munis,
  districtLines,
  catchments,
  wmas,
  provinces,
  rivers,
  towns,
  selected: sel,
  onSelect: handleSelect,
  pointLayers,
  points,
  onPointProv,
}: MapCanvasProps) {
  return (
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
      aria-label={`${title} map`}
    >
      <Panes />
      <InvalidateOnResize />
      <Basemap on={base.has('basemap')} />
      <NeighbourLayer data={neighbours} dark={dark} />
      {/* SA land underlay so cells/polygons without data read as land, not ocean */}
      {sa && <OutlineLayerFill data={sa} dark={dark} />}
      {layer &&
        (layer.kind !== 'points' ? (
          <ThematicLayerView
            layer={layer}
            geo={levelGeo}
            selected={sel}
            onSelect={(id, k) => handleSelect(id, k, layer)}
          />
        ) : (
          <PointsView layer={layer} selected={sel} onSelect={(id) => handleSelect(id, 'point', layer)} />
        ))}
      {base.has('municipalities') && <OutlineLayer data={munis} color={dark ? '#8aa0bd' : '#ffffff'} weight={0.5} />}
      {base.has('districts') && <OutlineLayer data={districtLines} color={dark ? '#a9bbd3' : '#5b6b80'} weight={0.8} />}
      {base.has('catchments') && <OutlineLayer data={catchments} color="#3b6ea5" weight={0.7} dash="3 3" />}
      {base.has('wmas') && <OutlineLayer data={wmas} color="#0f4c81" weight={1.4} dash="6 3" />}
      {(base.has('provinces') || mini) && (
        <OutlineLayer
          data={provinces}
          color={dark ? '#c4d2e3' : '#334155'}
          weight={mini ? 0.6 : 1.1}
          labels={!mini && base.has('provinces')}
        />
      )}
      {sa && <OutlineLayer data={sa} color={dark ? '#c4d2e3' : '#1f2d3d'} weight={1.4} />}
      {base.has('rivers') && <RiversLayer data={rivers} />}
      {base.has('towns') && <TownsLayer data={towns} />}
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
  );
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
