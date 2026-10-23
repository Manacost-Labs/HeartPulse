import assert from 'node:assert/strict';
import {
  contestStatusLabel,
  dateTimeInputToIso,
  formatDateTimeInput,
  parseDateTimeInput,
  parseWinnerIds,
} from '../src/features/adminConsole/sections/contestFormModel.js';

// Winners pasted in any separator, with blanks and repeats.
assert.deepEqual(parseWinnerIds('p1, p2;\np1\n\n p3 '), ['p1', 'p2', 'p3']);
assert.deepEqual(parseWinnerIds(''), []);

// A value without a zone is already the local wall time of the field.
assert.equal(formatDateTimeInput('2026-10-23T18:30'), '2026-10-23T18:30');
assert.equal(formatDateTimeInput(null), '');
const local = new Date(2026, 9, 23, 18, 30);
assert.equal(formatDateTimeInput(local.toISOString()), '2026-10-23T18:30');

assert.equal(parseDateTimeInput('2026-10-23T18:30')?.getTime(), local.getTime());
assert.equal(parseDateTimeInput('not a date'), null);
assert.equal(dateTimeInputToIso('2026-10-23T18:30'), local.toISOString());
assert.equal(dateTimeInputToIso(''), '');

assert.equal(contestStatusLabel('pending'), 'На проверке');
assert.equal(contestStatusLabel('anything-else'), 'Активен');

console.log('admin contest form model tests passed');
