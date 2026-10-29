import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  orderStandardMetaPeriods,
  STANDARD_META_COINS,
  resolveStandardMetaDefaultPeriod,
  standardMetaPeriodLabel,
} from '../src/features/standardMetaFilterModel.js';
import { latestStandardMetaBanPeriod, type StandardMetaPeriod } from '../shared/standardMetaPeriods.js';

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

// HSGuru's menu order: Bans, expansion, patch, then rolling windows shortest first.
assert.deepEqual(
  orderStandardMetaPeriods(
    ['past_day', 'past_week', 'patch_36.6.3', 'black_empire', 'black_empire_ban'],
    'black_empire',
    'patch_36.6.3',
  ),
  ['black_empire_ban', 'black_empire', 'patch_36.6.3', 'past_day', 'past_week'],
);
assert.equal(standardMetaPeriodLabel('black_empire_ban'), 'Баны');
assert.deepEqual(STANDARD_META_COINS.map(option => [option.id, option.label]),
  [['any_player', 'Любая'], ['going_first', 'Ходит первым'], ['on_coin', 'С монеткой']]);
// The coin filter is part of the request and of its identity.
assert.match(metaSource, /const \[coin, setCoin\] = useState<MetaCoin>\(TEASER_SEED_FILTERS\.coin\)/);
assert.match(metaSource, /metaRequestKey\(format, rank, period, coin, minGames, metaRevision, hasFullAccess\)/);
assert.match(metaSource, /Очерёдность хода/);
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
// The current expansion's Bans window opens the page whenever the source offers it.
assert.equal(
  resolveStandardMetaDefaultPeriod(
    ['past_day', 'patch_36.6.3', 'black_empire', 'black_empire_ban'],
    'black_empire',
    'patch_36.6.3',
  ),
  'black_empire_ban',
);
// A previous expansion's Bans window is stale once a new expansion starts.
assert.equal(
  resolveStandardMetaDefaultPeriod(
    ['past_day', 'patch_37.0.0', 'next_expansion', 'black_empire_ban'] as StandardMetaPeriod[],
    'next_expansion' as StandardMetaPeriod,
    'patch_37.0.0',
  ),
  'next_expansion',
);
// Without a known expansion window the last listed Bans window wins; without one, the patch.
assert.equal(latestStandardMetaBanPeriod(['past_day', 'black_empire_ban'], null), 'black_empire_ban');
assert.equal(resolveStandardMetaDefaultPeriod(['past_day', 'patch_36.6.3'], null, 'patch_36.6.3'), 'patch_36.6.3');
assert.equal(latestStandardMetaBanPeriod(['past_day', 'unknown_ban'], null), null);
// The selector shows the default before the first answer sets it, so the label never flips.
assert.match(metaSource, /const selectedPeriod = period\s*\?\? resolveStandardMetaDefaultPeriod\(/);

// The page opens on Diamond–Legend; a server-rendered teaser also fixes the
// period it was read for, otherwise the page resolves the current one itself.
const teaserSource = readFileSync(new URL('../src/features/standardMetaTeaser.ts', import.meta.url), 'utf8');
assert.match(teaserSource, /TEASER_SEED_FILTERS = \{ format: 'standard', rank: 'diamond_legend', coin: 'any_player', minGames: 100 \} as const/);
assert.match(metaSource, /useState<MetaRank>\(TEASER_SEED_FILTERS\.rank\)/);
assert.match(metaSource, /useState<MetaPeriod \| null>\(initialTeaser\?\.period \?\? null\)/);
// Until a payload resolves the summary shows a value placeholder, never a fake zero.
assert.match(metaSource, /const summaryReady = hasPayload && !\(hasFullAccess && data === initialTeaser\?\.data\);/);
assert.match(metaSource, /<MetaSummary data=\{summaryReady \? data : null\}/);
assert.match(metaSource, /<dd>\{data \? data\.items\.length : <LoadingValue \/>\}<\/dd>/);
assert.match(metaSource, /\{loading && !hasPayload && \(\s*<AsyncSurfaceState\s*variant="loading"/);
// Without a server-rendered teaser only a browser holding a session waits for
// its access check: a subscriber's remount would abort a teaser in flight.
assert.match(metaSource, /if \(requestKey === answeredKey\.current \|\| teaserWaitsForAccess\) return undefined;\s*answeredKey\.current = '';/);
assert.match(readFileSync(new URL('../apps/public-web/ui/StandardMetaPageClient.tsx', import.meta.url), 'utf8'),
  /teaserWaitsForAccess=\{pending && sessionTag\(\) !== null\}/);
// A teaser already sent is not aborted by the full-access remount (a failed
// request in the browser); one not yet sent stays unsent.
assert.match(metaSource, /controller\.signal\.aborted \? Promise\.reject\(new DOMException\('', 'AbortError'\)\)[\s\S]*?signal: hasFullAccess \? controller\.signal : undefined,/);
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

// Tiers rank the win rate's lower confidence bound, so a thin sample cannot outrank its games.
{
  const { standardMetaTier } = await import('../src/features/standardMetaClassModel.js');
  assert.equal(standardMetaTier(63.3, 8883), 'S');
  assert.equal(standardMetaTier(56, 100), 'B');
  assert.equal(standardMetaTier(52, 20000), 'A');
  assert.equal(standardMetaTier(50, 5000), 'B');
  assert.equal(standardMetaTier(48.5, 3000), 'C');
  assert.equal(standardMetaTier(44, 5000), 'D');
}
