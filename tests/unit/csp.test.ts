import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** deploy/nginx.conf allows each inline script of index.html by its hash: editing one without the other breaks it. */
describe('production Content Security Policy', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const nginx = readFileSync(resolve(__dirname, '../../deploy/nginx.conf'), 'utf8');

  it('lists the hash of every inline script in index.html', () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) {
      const hash = createHash('sha256').update(body, 'utf8').digest('base64');
      expect(nginx).toContain(`'sha256-${hash}'`);
    }
  });

  it('allows no inline or remote script sources', () => {
    const csp = /set \$csp "([^"]+)"/.exec(nginx)?.[1] ?? '';
    const script = /script-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toMatch(/https?:/);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
