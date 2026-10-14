/**
 * Location filters → backend params. The database is keyed by the 52 district / metro municipalities, so live requests
 * send the district MDB code as `municipality` (the backend rejects local-municipality codes with 400).
 */
import type { QueryParams } from './client';

export function liveParams(params: QueryParams): QueryParams {
  const { district, ...rest } = params;
  if (!rest.municipality && district) rest.municipality = district;
  return rest;
}
