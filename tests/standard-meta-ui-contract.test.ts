import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  orderStandardMetaPeriods,
  resolveStandardMetaDefaultPeriod,
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
    'patch_36.0.3',
  ),
  ['patch_36.0.3', 'violet_hold', 'past_day', 'past_3_days', 'past_week'],
);

assert.deepEqual(
  orderStandardMetaPeriods(
    ['past_day', 'patch_36.2.2', 'violet_hold', 'most_wanted'],
    'most_wanted',
    'patch_36.2.2',
  ),
  ['most_wanted', 'patch_36.2.2', 'violet_hold', 'past_day'],
);
assert.equal(
  resolveStandardMetaDefaultPeriod(
    ['past_day', 'patch_36.2.2', 'most_wanted'],
    'most_wanted',
    'patch_36.2.2',
  ),
  'most_wanted',
);

// The page opens on Diamond–Legend; a server-rendered teaser also fixes the
// period it was read for, otherwise the page resolves the current one itself.
const teaserSource = readFileSync(new URL('../src/features/standardMetaTeaser.ts', import.meta.url), 'utf8');
assert.match(teaserSource, /TEASER_SEED_FILTERS = \{ format: 'standard', rank: 'diamond_legend', minGames: 100 \} as const/);
assert.match(metaSource, /useState<MetaRank>\(TEASER_SEED_FILTERS\.rank\)/);
assert.match(metaSource, /useState<MetaPeriod \| null>\(initialTeaser\?\.period \?\? null\)/);
// Until a payload resolves the summary shows a dash, never a fake zero.
assert.match(metaSource, /const summaryReady = hasPayload && !\(hasFullAccess && data === initialTeaser\?\.data\);/);
assert.match(metaSource, /<dd>\{summaryReady \? data\.items\.length : '—'\}<\/dd>/);
assert.match(metaSource, /\{loading && !hasPayload && \(\s*<AsyncSurfaceState\s*variant="loading"/);
// The guest teaser's prompt waits for the account check, so a subscriber never sees it.
assert.match(metaSource, /\{!hasFullAccess && !accessPending \? \(\s*<PaywallGate/);
assert.match(metaSource, /option\.asset/);
assert.match(metaSource, /\/card-format-standard\.webp/);
assert.match(metaSource, /\/assets\/card-format-wild-128\.webp/);
assert.match(
  metaSource,
  /most_wanted:\s*'За мини-набор — В розыске'/,
  'the current mini-set must use its official Russian name',
);
assert.doesNotMatch(metaSource, /standard-meta__season-context/);
assert.doesNotMatch(metaStyles, /\.standard-meta__season-context/);
assert.match(chartSource, /useState\(false\)/);
