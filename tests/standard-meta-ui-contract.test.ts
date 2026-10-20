import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  orderStandardMetaPeriods,
  resolveStandardMetaDefaultPeriod,
  standardMetaPeriodLabel,
} from '../src/features/standardMetaFilterModel.js';
import type { StandardMetaPeriod } from '../shared/standardMetaPeriods.js';

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

// HSGuru's menu order: expansion, patch, then rolling windows shortest first.
assert.deepEqual(
  orderStandardMetaPeriods(
    ['past_3_hours', 'past_6_hours', 'past_day', 'past_3_days', 'past_week', 'past_2_weeks', 'past_30_days',
      'patch_36.6.3', 'black_empire'],
    'black_empire',
    'patch_36.6.3',
  ),
  ['black_empire', 'patch_36.6.3', 'past_3_hours', 'past_6_hours', 'past_day', 'past_3_days', 'past_week',
    'past_2_weeks', 'past_30_days'],
);
assert.deepEqual(
  orderStandardMetaPeriods(
    ['past_day', 'past_3_days', 'patch_36.0.3', 'past_week'],
    'patch_36.0.3',
    'patch_36.0.3',
  ),
  ['patch_36.0.3', 'past_day', 'past_3_days', 'past_week'],
);
assert.equal(
  resolveStandardMetaDefaultPeriod(
    ['past_day', 'patch_36.6.3', 'black_empire'],
    'black_empire',
    'patch_36.6.3',
  ),
  'black_empire',
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
assert.deepEqual(
  ['black_empire', 'patch_36.6.3', 'past_3_hours', 'past_6_hours', 'past_day', 'past_3_days', 'past_week',
    'past_2_weeks', 'past_30_days'].map(period => standardMetaPeriodLabel(period as StandardMetaPeriod)),
  ['Тёмная империя', 'Патч 36.6.3', '3 часа', '6 часов', 'Сутки', '3 дня', 'Неделя', '2 недели', '30 дней'],
);
assert.doesNotMatch(metaSource, /standard-meta__season-context/);
assert.doesNotMatch(metaStyles, /\.standard-meta__season-context/);
assert.match(chartSource, /useState\(false\)/);
