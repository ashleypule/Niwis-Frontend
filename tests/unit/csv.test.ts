import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/exporter';

describe('toCsv', () => {
  it('writes RFC 4180 CSV: header from the first row, CRLF, quotes only where needed', () => {
    const rows = [
      { name: 'Cape Town', value: 12.5, note: null },
      { name: 'Say "hi", then go', value: -3, note: 'line one\nline two' },
      { name: ' padded ', value: 0, note: 'a,b' },
    ];
    expect(toCsv(rows)).toBe(
      'name,value,note\r\n' +
        'Cape Town,12.5,\r\n' +
        '"Say ""hi"", then go",-3,"line one\nline two"\r\n' +
        '" padded ",0,"a,b"',
    );
  });

  it('gives an empty string for no rows, and blank cells for missing keys', () => {
    expect(toCsv([])).toBe('');
    expect(toCsv([{ a: 1, b: 2 }, { a: 3 } as never])).toBe('a,b\r\n1,2\r\n3,');
  });
});
