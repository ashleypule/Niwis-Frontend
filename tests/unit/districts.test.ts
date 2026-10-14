/** Local municipality → district roll-up for live requests (the backend is keyed by the 52 districts). */
import { describe, expect, it } from 'vitest';
import { DISTRICTS, districtById, districtLabel, districtOf, lmsInDistrict } from '@/config/districts';
import { liveParams } from '@/api/scope';
import { MUNICIPALITIES } from '@/mocks/reference/regions';

describe('LM → district roll-up', () => {
  it('maps every one of the 213 local municipalities to one of the 52 districts', () => {
    expect(DISTRICTS).toHaveLength(52);
    expect(MUNICIPALITIES).toHaveLength(213);
    for (const m of MUNICIPALITIES) expect(districtById(districtOf(m.id))?.province, m.name).toBe(m.province);
    expect(DISTRICTS.every((d) => lmsInDistrict(d.id).length > 0)).toBe(true);
  });

  it('knows the hand-checked border cases and the metros', () => {
    const lm = (name: string) => MUNICIPALITIES.find((m) => m.name === name)!.id;
    expect(districtOf(lm('Breede Valley'))).toBe('DC2');
    expect(districtOf(lm('Overstrand'))).toBe('DC3');
    expect(districtOf(lm('City of Cape Town'))).toBe('CPT');
    expect(districtLabel(districtById('DC32'))).toBe('Ehlanzeni District');
    expect(districtLabel(districtById('CPT'))).toBe('City of Cape Town');
  });

  it('live requests send the parent district as `municipality`', () => {
    const lm = MUNICIPALITIES.find((m) => m.name === 'Mbombela')!.id;
    expect(liveParams({ period: '12M', district: 'DC32', municipality: lm })).toEqual({
      period: '12M',
      municipality: 'DC32',
    });
    expect(liveParams({ district: 'DC44' })).toEqual({ municipality: 'DC44' });
    expect(liveParams({ province: 'WC' })).toEqual({ province: 'WC' });
  });
});
