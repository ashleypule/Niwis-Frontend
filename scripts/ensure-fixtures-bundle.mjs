/**
 * Rebuilds dist-fixtures when anything it is built from is newer than the bundle, so the Playwright hybrid project can
 * never test old code. Runs from the hybrid webServer command and from Playwright's global setup: a preview server left
 * over from an earlier run is reused and skips its webServer command, but serves whatever the global setup has rebuilt.
 *
 *   node scripts/ensure-fixtures-bundle.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = 'dist-fixtures/index.html';
const INPUTS = ['src', 'tests/fixtures/backend', 'public', 'index.html', 'vite.config.ts', 'package.json'];

/** Newest modification time (ms) of a file or of the files under a directory; 0 if it does not exist. */
export function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, name)));
  return newest;
}

/** Whether the bundle is missing or older than any of its inputs. */
export function needsRebuild(root = ROOT, bundle = BUNDLE, inputs = INPUTS) {
  const built = newestMtime(join(root, bundle));
  return built === 0 || inputs.some((p) => newestMtime(join(root, p)) > built);
}

export function ensureFixturesBundle() {
  if (!needsRebuild()) {
    console.log(`${BUNDLE} is up to date`);
    return;
  }
  console.log(`rebuilding ${BUNDLE}: its sources or fixtures are newer`);
  execSync('npm run build:fixtures', { cwd: ROOT, stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) ensureFixturesBundle();
