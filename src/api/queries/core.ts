/**
 * Generic TanStack Query hooks. Module files (drought.ts, dams.ts …) wrap these with typed metric ids.
 * All hooks include the global filter params, keep previous data while refetching (no layout jumps) and
 * share cache entries across pages (same params → same key → same numbers everywhere).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ZodType, ZodTypeDef } from 'zod';
import { apiGet, type QueryParams } from '../client';
import { API_PREFIX, endpoints } from '../endpoints';
import {
  AlertListSchema,
  CategoryListSchema,
  CategorySetSchema,
  EntityDetailSchema,
  EntityListSchema,
  HealthSchema,
  KpiSetSchema,
  MapLayerSchema,
  MatrixSetSchema,
  MetaCoverageSchema,
  MetaSourcesSchema,
  MetaVariablesSchema,
  RefListSchema,
  SearchResultSchema,
  SeriesSetSchema,
  TableSetSchema,
  type CategorySet,
  type MatrixSet,
  type SeriesSet,
  type TableSet,
} from '@/types/api';
import { toParams, useFilters } from '@/store/filters';
import type { ModuleId } from '@/config/modules';
import { APP, showProvenance } from '@/config/app';

const STALE = 5 * 60_000;

/** Global filter params, memoised. Pass `scoped: false` for datasets that ignore the location scope. */
export function useFilterParams(extra: QueryParams = {}, opts: { scoped?: boolean } = {}): QueryParams {
  const f = useFilters();
  const key = JSON.stringify(extra);
  return useMemo(() => {
    const p: QueryParams = { ...toParams(f) };
    if (opts.scoped === false) {
      delete p.province;
      delete p.wma;
      delete p.catchment;
      delete p.district;
      delete p.municipality;
    }
    return { ...p, ...(JSON.parse(key) as QueryParams) };
  }, [f, key, opts.scoped]);
}

export function useSummary(module: ModuleId, extra: QueryParams = {}, enabled = true) {
  const params = useFilterParams(extra);
  return useQuery({
    queryKey: ['summary', module, params],
    queryFn: ({ signal }) => apiGet(endpoints.summary(module), params, KpiSetSchema, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

function useDataset<T>(
  kind: 'timeseries' | 'forecast' | 'breakdown' | 'table' | 'matrix',
  schema: ZodType<T, ZodTypeDef, unknown>,
  module: ModuleId,
  metric: string,
  extra: QueryParams = {},
  enabled = true,
) {
  const params = useFilterParams({ metric, ...extra });
  return useQuery({
    queryKey: [kind, module, params],
    queryFn: ({ signal }) => apiGet(endpoints[kind](module), params, schema, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled,
  });
}

export const useSeries = (module: ModuleId, metric: string, extra?: QueryParams, enabled?: boolean) =>
  useDataset<SeriesSet>('timeseries', SeriesSetSchema, module, metric, extra, enabled);
export const useForecast = (module: ModuleId, metric: string, extra?: QueryParams, enabled?: boolean) =>
  useDataset<SeriesSet>('forecast', SeriesSetSchema, module, metric, extra, enabled);
export const useBreakdown = (module: ModuleId, metric: string, extra?: QueryParams, enabled?: boolean) =>
  useDataset<CategorySet>('breakdown', CategorySetSchema, module, metric, extra, enabled);
export const useTable = (module: ModuleId, metric: string, extra?: QueryParams, enabled?: boolean) =>
  useDataset<TableSet>('table', TableSetSchema, module, metric, extra, enabled);
export const useMatrix = (module: ModuleId, metric: string, extra?: QueryParams, enabled?: boolean) =>
  useDataset<MatrixSet>('matrix', MatrixSetSchema, module, metric, extra, enabled);

export function useMapLayer(module: ModuleId, layer: string, extra: QueryParams = {}, enabled = true) {
  const params = useFilterParams({ layer, ...extra }, { scoped: false });
  return useQuery({
    queryKey: ['map', module, params],
    queryFn: ({ signal }) => apiGet(endpoints.map(module), params, MapLayerSchema, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled: enabled && !!layer,
  });
}

export function useEntities(module: ModuleId, extra: QueryParams = {}, enabled = true) {
  const params = useFilterParams(extra);
  return useQuery({
    queryKey: ['entities', module, params],
    queryFn: ({ signal }) => apiGet(endpoints.entities(module), params, EntityListSchema, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled,
  });
}

export function useEntity(module: ModuleId, id: string | undefined) {
  return useQuery({
    queryKey: ['entity', module, id],
    queryFn: ({ signal }) => apiGet(endpoints.entity(module, id!), {}, EntityDetailSchema, signal),
    enabled: !!id,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

/** The module's database catalogue (live modules only: the mock has no database tables). */
export function useCategories(module: ModuleId, enabled = true) {
  return useQuery({
    queryKey: ['categories', module],
    queryFn: ({ signal }) => apiGet(endpoints.categories(module), {}, CategoryListSchema, signal),
    enabled,
    staleTime: STALE,
  });
}

/**
 * Every column of one chart group (`vars=all`, withheld columns as null series), with the global filters. The chart
 * toggles columns on the client, so switching a chip never refetches.
 */
export function useCategorySeries(module: ModuleId, tableId: string, groupId: string, enabled = true) {
  const params = useFilterParams({ vars: 'all' });
  return useQuery({
    queryKey: ['category', module, tableId, groupId, params],
    queryFn: ({ signal }) => apiGet(endpoints.category(module, tableId, groupId), params, SeriesSetSchema, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled,
  });
}

export function useAlerts(extra: QueryParams = {}, enabled = true) {
  const params = useFilterParams(extra, { scoped: false });
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: ({ signal }) => apiGet(endpoints.alerts(), params, AlertListSchema, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    enabled,
  });
}

export function useReference(type: string, extra: QueryParams = {}) {
  return useQuery({
    queryKey: ['reference', type, extra],
    queryFn: ({ signal }) => apiGet(endpoints.reference(type), extra, RefListSchema, signal),
    staleTime: Infinity,
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => apiGet(endpoints.search(), { q }, SearchResultSchema, signal),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
}

// ------------------------------------------------------------------ backend meta (hybrid / api mode)
const META_ON = showProvenance && APP.liveMeta;

/** /health: database reachability and which modules are live. Polled every 5 minutes. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet(`${API_PREFIX}/health`, {}, HealthSchema, signal),
    enabled: META_ON,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

const META_SCHEMAS = { sources: MetaSourcesSchema, coverage: MetaCoverageSchema, variables: MetaVariablesSchema };

export function useMetaSources() {
  return useQuery({
    queryKey: ['meta', 'sources'],
    queryFn: ({ signal }) => apiGet(`${API_PREFIX}/meta/sources`, {}, META_SCHEMAS.sources, signal),
    enabled: META_ON,
    staleTime: STALE,
  });
}
export function useMetaCoverage() {
  return useQuery({
    queryKey: ['meta', 'coverage'],
    queryFn: ({ signal }) => apiGet(`${API_PREFIX}/meta/coverage`, {}, META_SCHEMAS.coverage, signal),
    enabled: META_ON,
    staleTime: STALE,
  });
}
export function useMetaVariables() {
  return useQuery({
    queryKey: ['meta', 'variables'],
    queryFn: ({ signal }) => apiGet(`${API_PREFIX}/meta/variables`, {}, META_SCHEMAS.variables, signal),
    enabled: META_ON,
    staleTime: STALE,
  });
}
