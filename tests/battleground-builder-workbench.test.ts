import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuilderPage, createBuilderHistory, restoreTierPlacements, restoreStrategyDraft, pickBuilderSlot } from '../src/modules/battlegrounds/model/builderWorkbench';

test('catalog starts with 60 cards and resets its window for a new query', () => {
  const page = createBuilderPage();
  assert.equal(page.limit('all'), 60);
  page.more();
  assert.equal(page.limit('all'), 120);
  assert.equal(page.limit('murloc'), 60);
});

test('undo ignores duplicate states and recovers an accidentally cleared board', () => {
  const history = createBuilderHistory();
  history.commit({ placed: [] });
  history.commit({ placed: ['card-a'] });
  history.commit({ placed: ['card-a'] });
  history.commit({ placed: [] });
  assert.deepEqual(history.undo(), { placed: ['card-a'] });
  assert.deepEqual(history.undo(), { placed: [] });
  assert.equal(history.undo(), null);
});

test('tier draft keeps each current card once and returns obsolete placements to the pool', () => {
  const draft = { S: ['one', 'one', 'retired'], A: ['one', 'two'], B: [], C: [], D: [] };
  const placements = restoreTierPlacements(['one', 'two', 'three'], draft);
  assert.deepEqual(placements, { POOL: ['three'], S: ['one'], A: ['two'], B: [], C: [], D: [] });
  assert.deepEqual(restoreTierPlacements(['one'], null).POOL, ['one']);
});


test('a drop on an occupied slot uses a free slot instead of overlapping cards', () => {
  assert.equal(pickBuilderSlot([0, 1], 0, 3), 2);
  assert.equal(pickBuilderSlot([0], 2, 3), 2);
  assert.equal(pickBuilderSlot([0, 1, 2], 0, 3), null);
});

test('strategy drafts reject retired cards, overlapping slots and dangling annotations', () => {
  const cards = [{ id: 'one', source: 'MINION' }];
  const draft = {
    placed: [
      { id: 'one', source: 'MINION', uid: 'first', slot: 0 },
      { id: 'one', source: 'MINION', uid: 'overlap', slot: 0 },
      { id: 'old', source: 'MINION', uid: 'retired', slot: 1 },
    ],
    annotations: [
      { id: 'note', type: 'label', cardUids: ['first'], text: 'Ядро' },
      { id: 'dangling', type: 'arrow', cardUids: ['first', 'retired'] },
    ],
  };
  const restored = restoreStrategyDraft(cards, draft);
  assert.equal(restored.placed.length, 1);
  assert.equal(restored.annotations.length, 1);
  assert.equal(restored.annotations[0].text, 'Ядро');
});
