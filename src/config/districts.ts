/**
 * District / metro municipalities (52, MDB codes) and the local-municipality → district roll-up. The backend's data are
 * per district, so a local municipality selected in the filters is sent as its parent district on live pages.
 * Built by scripts/build-lm-to-district.mjs (centroid point-in-polygon, border cases checked by hand).
 */
import data from '@/mocks/reference/lm-to-district.json';

export interface District {
  id: string;
  name: string;
  province: string;
  kind?: string;
}

export const DISTRICTS: District[] = data.districts;
const LM_TO_DISTRICT: Record<string, string> = data.lmToDistrict;
const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

/** Parent district of a local municipality id (LM001…); undefined for unknown ids. */
export const districtOf = (lm: string | undefined): string | undefined => (lm ? LM_TO_DISTRICT[lm] : undefined);
export const districtById = (id: string | undefined): District | undefined => (id ? BY_ID.get(id) : undefined);
/** Local municipalities in a district. */
export const lmsInDistrict = (id: string): string[] =>
  Object.entries(LM_TO_DISTRICT)
    .filter(([, d]) => d === id)
    .map(([lm]) => lm);

/** "Ehlanzeni District" / "City of Cape Town" (metros already read as a place). */
export function districtLabel(d: District | undefined): string {
  if (!d) return '';
  return d.kind === 'metro' || /^City of|Metro/.test(d.name) ? d.name : `${d.name} District`;
}
