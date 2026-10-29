import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hsguruCoverageText, hsguruGamesText, hsguruOptions, hsguruSliceLabel, hsguruSliceQuery, nearestCollectedSlices,
  type HsguruSlice, type HsguruSliceEntry,
} from '../src/features/hsguruStatsModel';
import { cardStatsCsvRows } from '../src/features/archetypeDetailModel';

const slice: HsguruSlice = { rank: 'legend', period: 'black_empire_ban', coin: 'any_player', opponentClass: 'any' };
const entry = (extra: Partial<HsguruSliceEntry>): HsguruSliceEntry => ({ ...slice, kind: 'cards', games: 1000, checkedAt: null, ...extra });

test('an option is collected only with the values the other filters keep', () => {
  const slices = [entry({}), entry({ rank: 'all' }), entry({ period: 'black_empire', rank: 'top_5k' }), entry({ kind: 'matchups', rank: 'top_legend' })];
  const ranks = hsguruOptions('rank', slice, slices);
  assert.deepEqual(ranks.filter(option => option.collected).map(option => option.id), ['all', 'legend']);
  const periods = hsguruOptions('period', slice, slices);
  assert.deepEqual(periods.slice(0, 2).map(option => option.label), ['После банов', 'Тёмная империя']);
  assert.equal(periods.find(option => option.id === 'black_empire')?.collected, false, 'top_5k does not make Legend collected');
  assert.ok(hsguruOptions('period', slice, [entry({ period: 'patch_36.6.3' })]).some(option => option.label === 'Патч 36.6.3'));
});

test('slice labels name the coin and the opponent only when they narrow the slice', () => {
  assert.equal(hsguruSliceLabel(slice), 'Легенда · После банов');
  assert.equal(hsguruSliceLabel({ ...slice, coin: 'on_coin', opponentClass: 'MAGE' }), 'Легенда · После банов · С монеткой · против: маг');
  assert.equal(hsguruSliceLabel({ ...slice, opponentClass: 'MAGE' }, false), 'Легенда · После банов');
  assert.equal(hsguruSliceLabel({ ...slice, period: 'current' }), 'Легенда · Текущее дополнение');
});

test('the query is empty for the default slice and names every field otherwise', () => {
  assert.equal(hsguruSliceQuery(null), '');
  assert.equal(hsguruSliceQuery(slice), 'rank=legend&period=black_empire_ban&coin=any_player&opponent=any');
});

test('coverage reads as collected pages of the plan', () => {
  assert.match(hsguruCoverageText({ collected: 520, planned: 8720 }) ?? '', /^собрано 520 из 8\s720 срезов \(5%\)$/);
  assert.equal(hsguruCoverageText({ collected: 0, planned: 0 }), null);
  assert.equal(hsguruCoverageText(null), null);
});

test('the nearest collected slices keep the period and rank before coin and opponent', () => {
  const wanted = { ...slice, coin: 'on_coin' as const };
  const nearest = nearestCollectedSlices(wanted, [
    entry({ rank: 'all', period: 'black_empire' }), entry({}), entry({ rank: 'all' }), entry({ kind: 'matchups' }),
  ]);
  assert.deepEqual(nearest.map(next => hsguruSliceLabel(next)), ['Легенда · После банов', 'Все ранги · После банов', 'Все ранги · Тёмная империя']);
});

test('the CSV adds Not Drawn only for rows that carry it', () => {
  const row = { cardName: 'Кузня', mulliganImpact: 3.5, mulliganCount: 633, drawnImpact: -0.6, drawnCount: 1946, keptImpact: 6.5, keptCount: 314 };
  assert.equal(cardStatsCsvRows([row]).header.length, 7);
  const full = cardStatsCsvRows([{ ...row, notDrawnImpact: 0.6, notDrawnCount: 1242 }]);
  assert.equal(full.header.length, 9);
  assert.deepEqual(full.rows[0].slice(5, 7), ['+0,6%', '1242']);
});

test('the sample size declines «игра» by its number and groups digits with a no-break space', () => {
  assert.equal(hsguruGamesText(0), '0 игр');
  assert.equal(hsguruGamesText(1), '1 игра');
  assert.equal(hsguruGamesText(2), '2 игры');
  assert.equal(hsguruGamesText(4), '4 игры');
  assert.equal(hsguruGamesText(5), '5 игр');
  assert.equal(hsguruGamesText(11), '11 игр');
  assert.equal(hsguruGamesText(14), '14 игр');
  assert.equal(hsguruGamesText(21), '21 игра');
  assert.equal(hsguruGamesText(112), '112 игр');
  assert.equal(hsguruGamesText(1000), '1\u00a0000 игр');
  assert.equal(hsguruGamesText(5302), '5\u00a0302 игры');
  assert.equal(hsguruGamesText(49117), '49\u00a0117 игр');
  assert.equal(hsguruGamesText(1234567), '1\u00a0234\u00a0567 игр');
});

test('the window after the bans carries its full name as the option tooltip, and no other option does', () => {
  const periods = hsguruOptions('period', slice, [entry({ period: 'patch_36.6.3' })]);
  assert.equal(periods.find(option => option.id === 'black_empire_ban')?.title, 'Тёмная империя, с патча банов');
  assert.deepEqual(periods.filter(option => option.title).map(option => option.id), ['black_empire_ban']);
  assert.equal(hsguruOptions('rank', slice, []).some(option => option.title), false);
});
