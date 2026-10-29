/** The Forecasting Studio's shareable URL: state ↔ query string round trip, and the run request it encodes. */
import { describe, expect, it } from 'vitest';
import { paramsFromState, requestOf, stateFromParams, type StudioState } from '@/pages/ai/studio/studioUrl';
import { runBody } from '@/types/forecast';
import { fixtureKey, stableJson } from '@/mocks/fixtures';

const S62 = '6.2_rainfall_derived_drought_indices_master';
const full: StudioState = {
  table: S62,
  column: 'SPI_3_Short_Term_Agricultural_Drought',
  level: 'province',
  area: 'WC',
  model: 'sarimax',
  horizon: 6,
  resolution: 'monthly',
  inputs: ['6.1_core_rainfall_variables_master|Monthly_Total_Precipitation_mm'],
};

describe('studio url', () => {
  it('round-trips the state and keeps the page filters', () => {
    const base = new URLSearchParams({ province: 'WC', period: '24M' });
    const sp = paramsFromState(full, base, true);
    expect(sp.get('province')).toBe('WC');
    expect(sp.get('run')).toBe('1');
    expect(stateFromParams(sp)).toEqual(full);
  });

  it('leaves defaults out of the link', () => {
    const sp = paramsFromState(
      { ...full, level: 'national', area: undefined, inputs: [], model: 'auto' },
      new URLSearchParams(),
      false,
    );
    expect(sp.has('level')).toBe(false);
    expect(sp.has('inputs')).toBe(false);
    expect(sp.has('run')).toBe(false);
    expect(stateFromParams(new URLSearchParams('horizon=abc&level=planet')).horizon).toBe(12);
    expect(stateFromParams(new URLSearchParams('level=planet')).level).toBe('national');
  });

  it('builds the run request only when every choice is made', () => {
    expect(requestOf({ ...full, column: undefined })).toBeUndefined();
    expect(requestOf({ ...full, area: undefined })).toBeUndefined();
    const req = requestOf(full)!;
    expect(req.scope).toEqual({ level: 'province', id: 'WC' });
    expect(req.inputs).toEqual([
      { table: '6.1_core_rainfall_variables_master', column: 'Monthly_Total_Precipitation_mm' },
    ]);
    // the body the client sends is what the recorder keys fixtures by: key order never matters
    const body = runBody(req);
    const shuffled = {
      resolution: body.resolution,
      inputs: body.inputs,
      horizon: body.horizon,
      model: body.model,
      scope: body.scope,
      column: body.column,
      table: body.table,
    };
    expect(stableJson(shuffled)).toBe(stableJson(body));
    const key = fixtureKey(new URL('http://x/api/v1/forecast/runs'), body);
    expect(key.startsWith('forecast/runs?body=')).toBe(true);
    expect(new URLSearchParams(key.split('?')[1]).get('body')).toBe(stableJson(body));
  });
});
