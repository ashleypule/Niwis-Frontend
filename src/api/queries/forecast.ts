/**
 * Forecasting Studio hooks. Models and targets are cached like reference lists; a run is polled every second while
 * it is queued or running, then kept (a finished run never changes).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../client';
import { API_PREFIX } from '../endpoints';
import {
  ForecastModelsSchema,
  ForecastTargetsSchema,
  RunAcceptedSchema,
  RunStatusSchema,
  runBody,
  type RunRequest,
} from '@/types/forecast';

export const forecastEndpoints = {
  models: () => `${API_PREFIX}/forecast/models`,
  targets: () => `${API_PREFIX}/forecast/targets`,
  runs: () => `${API_PREFIX}/forecast/runs`,
  run: (id: string) => `${API_PREFIX}/forecast/runs/${encodeURIComponent(id)}`,
} as const;

export function useForecastModels(enabled = true) {
  return useQuery({
    queryKey: ['forecast', 'models'],
    queryFn: ({ signal }) => apiGet(forecastEndpoints.models(), {}, ForecastModelsSchema, signal),
    staleTime: 60 * 60_000,
    enabled,
  });
}

export function useForecastTargets(enabled = true) {
  return useQuery({
    queryKey: ['forecast', 'targets'],
    queryFn: ({ signal }) => apiGet(forecastEndpoints.targets(), {}, ForecastTargetsSchema, signal),
    staleTime: 60 * 60_000,
    enabled,
  });
}

export function useStartRun() {
  return useMutation({
    mutationFn: (r: RunRequest) => apiPost(forecastEndpoints.runs(), runBody(r), RunAcceptedSchema),
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['forecast', 'run', runId],
    queryFn: ({ signal }) => apiGet(forecastEndpoints.run(runId!), {}, RunStatusSchema, signal),
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'done' || s === 'failed' ? false : 1000;
    },
    staleTime: Infinity,
    retry: 1,
  });
}
