import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { needsRebuild } from '../../scripts/ensure-fixtures-bundle.mjs';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(root, 'dist'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'fixtures'));
  return root;
}

const at = (path: string, seconds: number) => {
  writeFileSync(path, 'x');
  utimesSync(path, seconds, seconds);
};

describe('needsRebuild (the hybrid suite never tests a stale bundle)', () => {
  const inputs = ['src', 'fixtures'];

  it('rebuilds when there is no bundle', () => {
    expect(needsRebuild(project(), 'dist/index.html', inputs)).toBe(true);
  });

  it('keeps a bundle newer than every input', () => {
    const root = project();
    at(join(root, 'src/a.ts'), 1000);
    at(join(root, 'fixtures/a.json'), 1000);
    at(join(root, 'dist/index.html'), 2000);
    expect(needsRebuild(root, 'dist/index.html', inputs)).toBe(false);
  });

  it('rebuilds when a source or a fixture is newer than the bundle', () => {
    for (const newer of ['src/a.ts', 'fixtures/a.json']) {
      const root = project();
      at(join(root, 'src/a.ts'), 1000);
      at(join(root, 'fixtures/a.json'), 1000);
      at(join(root, 'dist/index.html'), 2000);
      at(join(root, newer), 3000);
      expect(needsRebuild(root, 'dist/index.html', inputs)).toBe(true);
    }
  });
});
