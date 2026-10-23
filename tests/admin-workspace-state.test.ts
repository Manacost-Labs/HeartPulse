import assert from 'node:assert/strict';
import {
  adminWorkspaceReducer,
  createAdminWorkspaceState,
} from '../src/features/adminWorkspaceState.js';

const initial = createAdminWorkspaceState('dashboard');
assert.deepEqual(initial, { section: 'dashboard', message: null });

const withMessage = adminWorkspaceReducer(initial, {
  type: 'setMessage',
  message: { type: 'ok', text: 'Сохранено' },
});
assert.equal(withMessage.message?.text, 'Сохранено');

const navigated = adminWorkspaceReducer(withMessage, { type: 'navigate', section: 'contests' });
assert.deepEqual(navigated, { section: 'contests', message: null }, 'opening another section clears the toast');
assert.strictEqual(
  adminWorkspaceReducer(navigated, { type: 'navigate', section: 'contests' }),
  navigated,
  'an already clean navigation state must keep its identity',
);

const funDecks = adminWorkspaceReducer(navigated, { type: 'navigate', section: 'fun-decks' });
assert.equal(funDecks.section, 'fun-decks');
const apiKeys = adminWorkspaceReducer(funDecks, { type: 'navigate', section: 'api-keys' });
assert.equal(apiKeys.section, 'api-keys');
const referrals = adminWorkspaceReducer(funDecks, { type: 'navigate', section: 'referrals' });
assert.equal(referrals.section, 'referrals');

assert.strictEqual(
  adminWorkspaceReducer(initial, { type: 'setMessage', message: null }),
  initial,
  'clearing an absent toast must not rerender',
);

console.log('admin workspace state reducer tests passed');
