/**
 * Forecasting Studio API (backend `app/forecasting`, docs/backend/CONTRACT_CHANGES.md §15):
 *   GET  /api/v1/forecast/models · GET /api/v1/forecast/targets · POST /api/v1/forecast/runs · GET /forecast/runs/{id}
 */
import { z } from 'zod';

const N = z.number().nullable().optional();

export const ForecastModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  group: z.string(),
  groupLabel: z.string(),
  description: z.string(),
  minHistoryMonths: z.number(),
  minHistoryDays: z.number().nullable().optional(),
  supportsInputs: z.boolean(),
  requiresInputs: z.boolean(),
  resolutions: z.array(z.string()),
  experimental: z.boolean(),
  nativeInterval: z.boolean().optional(),
});
export type ForecastModel = z.infer<typeof ForecastModelSchema>;

export const ForecastModelsSchema = z.object({
  choices: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })),
  groups: z.array(z.object({ id: z.string(), label: z.string() })),
  models: z.array(ForecastModelSchema),
  limits: z.object({
    monthlyHorizon: z.tuple([z.number(), z.number()]),
    dailyHorizon: z.tuple([z.number(), z.number()]),
    minHistoryMonths: z.number(),
    minHistoryMonthsDeep: z.number(),
    minHistoryDays: z.number(),
    maxInputs: z.number(),
    runsPerHour: z.number(),
    timeoutSeconds: z.number(),
    retentionHours: z.number(),
  }),
  disclaimer: z.string(),
});
export type ForecastModels = z.infer<typeof ForecastModelsSchema>;

export const ForecastTargetSchema = z.object({
  table: z.string(),
  column: z.string(),
  label: z.string(),
  name: z.string(),
  unit: z.string().nullable().optional(),
  monthlyUnit: z.string().nullable().optional(),
  resolution: z.string(),
  resolutions: z.array(z.string()),
  aggregate: z.string(),
  classified: z.boolean(),
  firstDate: z.string().nullable().optional(),
  lastDate: z.string().nullable().optional(),
  historyMonths: z.number().nullable().optional(),
  enoughHistory: z.boolean(),
  note: z.string().optional(),
});
export type ForecastTarget = z.infer<typeof ForecastTargetSchema>;

export const ForecastTargetsSchema = z.object({
  module: z.string().nullable().optional(),
  tables: z.array(
    z.object({
      table: z.string(),
      id: z.string(),
      label: z.string(),
      spec: z.string().nullable().optional(),
      modules: z.array(z.string()),
      columns: z.array(ForecastTargetSchema),
    }),
  ),
  count: z.number(),
  note: z.string().optional(),
});
export type ForecastTargets = z.infer<typeof ForecastTargetsSchema>;

export const RunAcceptedSchema = z.object({
  runId: z.string(),
  status: z.string(),
  cached: z.boolean(),
  statusUrl: z.string(),
});
export type RunAccepted = z.infer<typeof RunAcceptedSchema>;

const Point = z.array(z.union([z.string(), z.number(), z.null()]));

export const ComparisonRowSchema = z.object({
  model: z.string(),
  label: z.string(),
  group: z.string(),
  baseline: z.boolean(),
  experimental: z.boolean(),
  winner: z.boolean(),
  mae: N,
  rmse: N,
  mase: N,
  skill: N,
  smape: N,
  mape: N,
  coverage: N,
  seconds: z.number().optional(),
  error: z.string().optional(),
});
export type ComparisonRow = z.infer<typeof ComparisonRowSchema>;

export const RunResultSchema = z.object({
  label: z.string(),
  disclaimer: z.string(),
  target: z.object({
    table: z.string(),
    column: z.string(),
    label: z.string(),
    unit: z.string().nullable().optional(),
    resolution: z.string(),
    aggregate: z.string(),
    classified: z.boolean(),
    note: z.string().optional(),
  }),
  scope: z.object({ level: z.string(), id: z.string(), name: z.string() }),
  inputs: z.array(
    z.object({ table: z.string(), column: z.string(), label: z.string(), unit: z.string().nullable().optional() }),
  ),
  sources: z.array(z.string()),
  dataAsOf: z.string().nullable().optional(),
  model: z.object({
    id: z.string(),
    label: z.string(),
    group: z.string(),
    experimental: z.boolean(),
    params: z.record(z.unknown()),
    why: z.string(),
    interval: z.string(),
  }),
  history: z.array(Point),
  forecastStart: z.string(),
  asOf: z.string(),
  backtest: z.array(z.object({ origin: z.string(), data: z.array(Point) })),
  backtestOrigins: z.array(z.string()),
  /** [date, median, p10, p90] */
  forecast: z.array(Point),
  metrics: z.object({ mae: N, rmse: N, mase: N, skill: N, smape: N, mape: N, coverage: N }),
  metricNotes: z.record(z.string()).optional(),
  comparison: z.array(ComparisonRowSchema),
  warnings: z.array(z.string()),
  classes: z
    .array(z.object({ date: z.string(), class: z.string(), probabilities: z.record(z.number()), pDrought: z.number() }))
    .optional(),
  runtimeSeconds: z.number().optional(),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const RunStatusSchema = z.object({
  runId: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  progress: z.number(),
  message: z.string(),
  queuePosition: z.number().optional(),
  request: z.record(z.unknown()),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  result: RunResultSchema.optional(),
  error: z.object({ code: z.string(), detail: z.string() }).optional(),
});
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** The Studio's request. Built only by `runBody`, so the same choices always give the same JSON (cache, fixtures). */
export interface RunRequest {
  table: string;
  column: string;
  scope: { level: 'national' | 'province' | 'district' | 'wma'; id?: string };
  model: string;
  horizon: number;
  inputs: { table: string; column: string }[];
  resolution: 'monthly' | 'daily';
}

export function runBody(r: RunRequest): RunRequest {
  return {
    table: r.table,
    column: r.column,
    scope: r.scope.level === 'national' ? { level: 'national' } : { level: r.scope.level, id: r.scope.id },
    model: r.model,
    horizon: r.horizon,
    inputs: r.inputs.map((i) => ({ table: i.table, column: i.column })),
    resolution: r.resolution,
  };
}
