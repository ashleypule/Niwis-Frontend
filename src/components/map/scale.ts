/**
 * The colour scale a map layer is drawn and explained with: the palette scale the backend names, the backend's own
 * data-derived classes (`legend`, e.g. the NDVI trend) when it sends them, or, when the palette's unit is not the
 * layer's (an mm scale for a layer in Mm³/year), six quantile classes of the layer's values in the palette's colours
 * — so the class breaks always fit the data's scale and the legend names the layer's unit.
 */
import { getScale, type ScaleBin, type ScaleDef } from '@/config/palettes';
import { canonUnit, clampDecimals, unitInLabel } from '@/config/naming';
import { formatNumber } from '@/lib/format';
import type { MapLayer } from '@/types/api';

const cache = new WeakMap<MapLayer, ScaleDef>();

export function scaleOf(layer: MapLayer): ScaleDef {
  const hit = cache.get(layer);
  if (hit) return hit;
  const base = getScale(layer.scale);
  const out = derive(layer, base);
  cache.set(layer, out);
  return out;
}

function derive(layer: MapLayer, base: ScaleDef): ScaleDef {
  if (layer.legend?.length) {
    return {
      ...base,
      id: `${base.id}:${layer.id}`,
      kind: 'threshold',
      bins: layer.legend.map((l) => ({
        label: l.label,
        color: l.color,
        min: l.from ?? undefined,
        max: l.to ?? undefined,
      })),
    };
  }
  const unit = canonUnit(layer.unit);
  const scaleUnit = canonUnit(base.unit);
  // spec classes (storage bands, WQI bands, drought classes …) are never replaced by quantiles
  const classes = base.bins.some((b) => b.id);
  if (base.kind !== 'threshold' || classes || !unit || unit === scaleUnit || unit.replace(' FSC', '') === scaleUnit)
    return base;
  const values = Object.values(layer.values ?? {}).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (values.length < 6) return base;
  const sorted = [...values].sort((a, b) => a - b);
  const n = Math.min(6, base.bins.length);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const edges = Array.from({ length: n - 1 }, (_, i) => q((i + 1) / n));
  const dec = clampDecimals(unit, sorted[sorted.length - 1] - sorted[0] < 10 ? 1 : 0) ?? 0;
  const f = (v: number) => formatNumber(v, dec);
  const colours = base.bins.map((b) => b.color);
  const pick = (i: number) => colours[Math.round((i / (n - 1)) * (colours.length - 1))];
  const bins: ScaleBin[] = [];
  for (let i = 0; i < n; i++) {
    const min = i === 0 ? undefined : edges[i - 1];
    const max = i === n - 1 ? undefined : edges[i];
    const label = min == null ? `< ${f(max!)}` : max == null ? `≥ ${f(min)}` : `${f(min)}–${f(max)}`;
    const ink = base.bins.find((b) => b.color === pick(i))?.ink;
    bins.push({ label, color: pick(i), min, max, ink });
  }
  return { ...base, id: `${base.id}:${layer.id}`, unit, bins };
}

/** The legend's title: the layer's title with its unit, inserted before a trailing " – <date>" when it lacks one. */
export function legendTitle(layer: MapLayer): string {
  const unit = canonUnit(layer.unit);
  const title = layer.title;
  if (!unit || unitInLabel(title.replace(/\s*[–-]\s*[A-Z][a-z]{2} \d{4}$|\s*[–-]\s*\d{4}$/, '')) != null) return title;
  const m = /\s*[–-]\s*(?:[A-Z][a-z]{2} )?\d{4}$/.exec(title);
  return m ? `${title.slice(0, m.index)} (${unit})${title.slice(m.index)}` : `${title} (${unit})`;
}
