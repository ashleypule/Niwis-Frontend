import { useQuery } from '@tanstack/react-query';
import type { FeatureCollection, Geometry } from 'geojson';

export type GeoName =
  | 'provinces'
  | 'south-africa'
  | 'municipalities'
  | 'districts'
  | 'wmas'
  | 'catchments'
  | 'neighbours'
  | 'rivers'
  | 'towns';
export type GeoProps = { id?: string; name?: string; province?: string; pop?: number; scalerank?: number };
export type GeoFC = FeatureCollection<Geometry, GeoProps>;

/** Static boundary files from public/geo (reference geometry, not API data). */
export function useGeo(name: GeoName, enabled = true) {
  return useQuery({
    queryKey: ['geo', name],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}geo/${name}.json`);
      if (!r.ok) throw new Error(`geo ${name} ${r.status}`);
      return (await r.json()) as GeoFC;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  });
}

export const SA_BOUNDS: [[number, number], [number, number]] = [
  [-35.1, 16.3],
  [-21.9, 33.1],
];

/** Interior label point: centre of the largest ring's bounding box nudged inside (cheap and good enough). */
export function labelPoint(geom: Geometry): [number, number] | null {
  const polys: number[][][][] =
    geom.type === 'Polygon'
      ? [geom.coordinates as number[][][]]
      : geom.type === 'MultiPolygon'
        ? (geom.coordinates as number[][][][])
        : [];
  if (!polys.length) return null;
  let best = polys[0];
  let bestArea = 0;
  for (const p of polys) {
    const ring = p[0];
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = p;
    }
  }
  // centroid of the outer ring
  const ring = best[0];
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  if (!a) return [ring[0][1], ring[0][0]];
  return [cy / (3 * a), cx / (3 * a)];
}
