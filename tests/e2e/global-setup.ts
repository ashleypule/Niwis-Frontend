import { ensureFixturesBundle } from '../../scripts/ensure-fixtures-bundle.mjs';

/** The hybrid projects must test the current code, also when a preview server from an earlier run is reused. */
export default function globalSetup() {
  const args = process.argv.join(' ');
  const onlyOthers = /--project[= ](mock|live|release)\b/.test(args) && !/--project[= ]hybrid\b/.test(args);
  if (!onlyOthers) ensureFixturesBundle();
}
