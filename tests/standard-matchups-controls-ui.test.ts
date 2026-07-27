import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/features/StandardMatchups.tsx', import.meta.url),
  'utf8',
);
const stylesheet = readFileSync(
  new URL('../src/features/StandardMatchups.css', import.meta.url),
  'utf8',
);
const parchmentStylesheet = readFileSync(
  new URL('../src/route-parchment.css', import.meta.url),
  'utf8',
);

const controls = source.slice(
  source.indexOf('standard-matchups__mode-toolbar'),
  source.indexOf('standard-matchups__ledger'),
);

assert.ok(controls.length > 0, 'matchup format and section controls must share one toolbar');
assert.match(controls, /standard-matchups__control-label[\s\S]*Формат/);
assert.match(controls, /standard-matchups__control-label[\s\S]*Раздел/);
assert.match(
  controls,
  /<fieldset[^>]*standard-matchups__control-cluster[\s\S]*<legend[^>]*>Формат игры<\/legend>/,
  'the format switcher must use native fieldset and legend grouping',
);
assert.doesNotMatch(
  controls,
  /rounded-full|style=\{\{[\s\S]*linear-gradient/,
  'mode controls must use the shared matchup control styles instead of conflicting inline pills',
);

assert.match(
  stylesheet,
  /\.standard-matchups__mode-toolbar\s*\{[^}]*display:\s*flex[^}]*border:/s,
  'the toolbar must be a compact bordered control surface',
);
assert.match(
  stylesheet,
  /\.standard-matchups__segmented\s*\{[^}]*display:\s*grid/s,
  'each control family must render as an aligned segmented group',
);
assert.match(
  stylesheet,
  /\.standard-matchups__segmented[^}]*\[aria-pressed='true'\]/s,
  'the active format must have an explicit pressed-state style',
);
assert.doesNotMatch(
  stylesheet,
  /@media \(max-width:\s*720px\)[\s\S]*?\.standard-matchups__index\s*\{\s*display:\s*none;/,
  'section navigation must remain available on mobile',
);
const matchupUtilityLayer = parchmentStylesheet.slice(
  parchmentStylesheet.indexOf('/* Owned by the lazy parchment route layer used by Standard matchups. */'),
);
assert.match(
  matchupUtilityLayer,
  /\.standard-matchups__rank-switcher button\s*\{\s*color:\s*#4f321f\s*!important;/,
  'the layered inactive-format color must remain readable on the light segment',
);
assert.match(
  matchupUtilityLayer,
  /\.standard-matchups__rank-switcher button\[aria-pressed='true'\]\s*\{\s*color:\s*#fff0c4\s*!important;/,
  'the layered active-format color must remain readable on the burgundy segment',
);

console.log('standard matchup controls UI contract passed');
