import assert from 'node:assert/strict';
import { cardDeckStats } from '../src/features/constructedCardDeckStats';

// A player's deck carries only its record: the win rate and games come from it.
assert.deepEqual(cardDeckStats({ winrate: null, score: '22-10' }), {
  winRate: 68.8,
  stats: [{ label: 'Винрейт', value: '68,8%' }, { label: 'Игры', value: '32 (22–10)' }],
  note: null,
});

// A known win rate wins over the record.
assert.deepEqual(cardDeckStats({ winrate: 55.2, score: '11-5' }).stats[0], { label: 'Винрейт', value: '55,2%' });

// A guest receives neither: a dash and no games.
assert.deepEqual(cardDeckStats({ winrate: null, score: null }), {
  winRate: null,
  stats: [{ label: 'Винрейт', value: '—' }],
  note: null,
});

// Text that is not a record stays a note under the deck.
assert.deepEqual(cardDeckStats({ winrate: null, score: 'Легенда, топ-100' }).note, 'Легенда, топ-100');
