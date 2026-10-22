import { describe, expect, it } from 'vitest';
import { SCALES, inkFor } from '@/config/palettes';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('inkFor', () => {
  it('gives WCAG AA small-text contrast (4.5 : 1) on every colour-scale bin', () => {
    for (const [id, scale] of Object.entries(SCALES)) {
      for (const bin of scale.bins) {
        if (!/^#[0-9a-f]{3,6}$/i.test(bin.color)) continue;
        expect(
          contrast(bin.color, inkFor(bin.color)),
          `${id} ${bin.id ?? bin.label} ${bin.color}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses black on the drought "No drought" green, where the navy ink falls short', () => {
    expect(inkFor('#1a9850')).toBe('#000000');
    expect(inkFor('#ffffff')).toBe('#13233A');
    expect(inkFor('#0b1f3a')).toBe('#FFFFFF');
  });
});
