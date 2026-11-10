import { describe, expect, it } from 'vitest';
import { checkItems } from '@/config/naming';
import { axisName } from '@/components/charts/options';

const item = (text: string, prov = 'live', kind = 'kpi') => ({ route: '/drought', kind, text, prov });
const sourceRule = (text: string, prov?: string, kind?: string) =>
  checkItems([item(text, prov, kind)]).filter((v) => v.rule === 'deprecated' && /river flow/.test(v.detail));

describe('SSI names its source (backend D53)', () => {
  it('accepts the two named series', () => {
    for (const t of ['SSI-3 (river flow)', 'Streamflow: SSI-3 (river flow)', 'SSI-6 (modelled runoff)'])
      expect(sourceRule(t), t).toEqual([]);
  });

  it('flags an SSI on a live page that does not say which', () => {
    for (const t of ['SSI-3', 'SSI-3 (from discharge)', 'Standardised Streamflow Index (SSI)'])
      expect(sourceRule(t), t).toHaveLength(1);
  });

  it('leaves sample pages alone', () => {
    expect(sourceRule('SSI-3', 'sample')).toEqual([]);
  });

  it('keeps the source on a unitless SSI axis', () => {
    expect(axisName('index', 'SSI (modelled runoff)')).toBe('SSI (modelled runoff)');
    expect(axisName('—', 'SSI (river flow)')).toBe('SSI (river flow)');
    expect(axisName('mm', 'Monthly rainfall (mm)')).toBe('Monthly rainfall (mm)');
    expect(checkItems([item('SSI (modelled runoff)', 'live', 'axis')])).toEqual([]);
  });
});
