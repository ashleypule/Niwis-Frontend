/**
 * Location filters → backend params. The database is keyed by the 52 district / metro municipalities, so live requests
 * send the district MDB code as `municipality`: a selected local municipality is rolled up to its parent district
 * (the backend rejects local-municipality codes with 400), and `district` becomes `municipality`.
 */
import { districtOf } from '@/config/districts';
import type { QueryParams } from './client';

export function liveParams(params: QueryParams): QueryParams {
  const { district, ...rest } = params;
  if (rest.municipality) rest.municipality = districtOf(String(rest.municipality)) ?? rest.municipality;
  else if (district) rest.municipality = district;
  return rest;
}
