import assert from 'node:assert/strict';
import {
  readStandardMatchupsSlice, standardMatchupsSliceQuery, writeStandardMatchupsSlice,
} from '../src/modules/standardMatchups/model/slice';
import { DEFAULT_STANDARD_MATCHUPS_SLICE } from '../src/modules/standardMatchups/model/types';

assert.deepEqual(readStandardMatchupsSlice(''), DEFAULT_STANDARD_MATCHUPS_SLICE);
assert.deepEqual(readStandardMatchupsSlice('?format=wild&rank=diamond_4to1&period=patch_36.6.3&min_games=250'), {
  format: 'wild', rank: 'diamond_4to1', period: 'patch_36.6.3', minGames: 250,
});
assert.deepEqual(readStandardMatchupsSlice('?format=brawl&rank=top_100&period=<script>&min_games=3'),
  DEFAULT_STANDARD_MATCHUPS_SLICE, 'unknown values fall back to the defaults');

// Defaults stay out of the URL; other parameters (a tour, utm) are kept.
assert.equal(writeStandardMatchupsSlice('?utm_source=x', DEFAULT_STANDARD_MATCHUPS_SLICE), '?utm_source=x');
assert.equal(writeStandardMatchupsSlice('?format=wild&utm_source=x', DEFAULT_STANDARD_MATCHUPS_SLICE), '?utm_source=x');
const picked = { format: 'wild', rank: 'all', period: 'black_empire_ban', minGames: 100 } as const;
const search = writeStandardMatchupsSlice('', picked);
assert.equal(search, '?format=wild&rank=all&period=black_empire_ban&min_games=100');
assert.deepEqual(readStandardMatchupsSlice(search), picked, 'a shared link opens the same slice');
assert.equal(standardMatchupsSliceQuery(picked), 'format=wild&rank=all&min_games=100&period=black_empire_ban');
assert.equal(standardMatchupsSliceQuery(DEFAULT_STANDARD_MATCHUPS_SLICE), 'format=standard&rank=legend&min_games=25');

console.log('standard matchup slice URL contract passed');
