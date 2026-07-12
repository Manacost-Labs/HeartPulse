import assert from 'node:assert/strict';
import {
  contestSelectionReducer,
  INITIAL_CONTEST_SELECTION,
} from '../src/features/contestSelection.js';

const first = { id: 'contest-1', winners: ['user-1'] };
const second = { id: 'contest-2', winners: ['user-2', 'user-3'] };

const selectedFirst = contestSelectionReducer(INITIAL_CONTEST_SELECTION, {
  type: 'sync',
  contests: [first, second],
});
assert.deepEqual(selectedFirst, {
  contestId: 'contest-1',
  winnersText: 'user-1',
  sourceWinnersText: 'user-1',
  entriesPage: 1,
});

const edited = contestSelectionReducer(selectedFirst, {
  type: 'setWinnersText',
  winnersText: 'user-1\nuser-local-draft',
});
const paged = contestSelectionReducer(edited, { type: 'setEntriesPage', entriesPage: 3 });
assert.equal(paged.entriesPage, 3);

const unchangedRefresh = contestSelectionReducer(paged, {
  type: 'sync',
  contests: [{ ...first }, { ...second }],
});
assert.strictEqual(unchangedRefresh, paged, 'unchanged server data must preserve the local winners draft and page');

const changedRefresh = contestSelectionReducer(paged, {
  type: 'sync',
  contests: [{ ...first, winners: ['user-server-new'] }, second],
});
assert.deepEqual(changedRefresh, {
  contestId: 'contest-1',
  winnersText: 'user-server-new',
  sourceWinnersText: 'user-server-new',
  entriesPage: 1,
});

const selectedSecond = contestSelectionReducer(paged, { type: 'select', contest: second });
assert.equal(selectedSecond.contestId, 'contest-2');
assert.equal(selectedSecond.winnersText, 'user-2\nuser-3');
assert.equal(selectedSecond.entriesPage, 1);
assert.strictEqual(
  contestSelectionReducer(selectedSecond, { type: 'select', contest: second }),
  selectedSecond,
  'selecting the current contest must preserve its local state',
);

const preferredSecond = contestSelectionReducer(selectedFirst, {
  type: 'sync',
  contests: [first, second],
  preferredContestId: 'contest-2',
});
assert.equal(preferredSecond.contestId, 'contest-2');

const removedSelection = contestSelectionReducer(selectedSecond, {
  type: 'sync',
  contests: [first],
});
assert.equal(removedSelection.contestId, 'contest-1');
assert.deepEqual(
  contestSelectionReducer(removedSelection, { type: 'select' }),
  INITIAL_CONTEST_SELECTION,
);
assert.equal(
  contestSelectionReducer(selectedFirst, { type: 'setEntriesPage', entriesPage: -4 }).entriesPage,
  1,
);

console.log('contest selection reducer tests passed');
