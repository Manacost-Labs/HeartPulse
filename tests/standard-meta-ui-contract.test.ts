import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  orderStandardMetaPeriods,
} from '../src/features/standardMetaFilterModel.js';

const metaSource = readFileSync(
  new URL('../src/features/StandardMeta.tsx', import.meta.url),
  'utf8',
);
const chartSource = readFileSync(
  new URL('../src/features/StandardMetaChart.tsx', import.meta.url),
  'utf8',
);
const metaStyles = readFileSync(
  new URL('../src/features/StandardMeta.css', import.meta.url),
  'utf8',
);

assert.deepEqual(
  orderStandardMetaPeriods(
    ['past_day', 'past_3_days', 'patch_36.0.3', 'violet_hold', 'past_week'],
    'patch_36.0.3',
  ),
  ['patch_36.0.3', 'violet_hold', 'past_day', 'past_3_days', 'past_week'],
);

assert.match(metaSource, /useState<MetaRank>\('diamond_legend'\)/);
assert.match(metaSource, /useState<MetaPeriod \| null>\(null\)/);
assert.match(metaSource, /option\.asset/);
assert.match(metaSource, /\/card-format-standard\.webp/);
assert.match(metaSource, /\/card-format-wild\.webp/);
assert.doesNotMatch(metaSource, /standard-meta__season-context/);
assert.doesNotMatch(metaStyles, /\.standard-meta__season-context/);
assert.match(chartSource, /useState\(false\)/);
