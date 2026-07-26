import assert from 'node:assert/strict';
import {
  adminWorkspaceReducer,
  createAdminWorkspaceState,
} from '../src/features/adminWorkspaceState.js';

const initial = createAdminWorkspaceState('dashboard');
assert.deepEqual(initial, {
  section: 'dashboard',
  adminMenuOpen: false,
  openUserMenuId: '',
  message: null,
});

const menuOpen = adminWorkspaceReducer(initial, { type: 'toggleAdminMenu' });
assert.equal(menuOpen.adminMenuOpen, true);
const userMenuOpen = adminWorkspaceReducer(menuOpen, { type: 'toggleUserMenu', userId: 'user-1' });
assert.equal(userMenuOpen.openUserMenuId, 'user-1');
const withMessage = adminWorkspaceReducer(userMenuOpen, {
  type: 'setMessage',
  message: { type: 'ok', text: 'Сохранено' },
});

const navigated = adminWorkspaceReducer(withMessage, { type: 'navigate', section: 'contests' });
assert.deepEqual(navigated, {
  section: 'contests',
  adminMenuOpen: false,
  openUserMenuId: '',
  message: null,
});
assert.strictEqual(
  adminWorkspaceReducer(navigated, { type: 'navigate', section: 'contests' }),
  navigated,
  'an already clean navigation state must keep its identity',
);

const funDecks = adminWorkspaceReducer(navigated, { type: 'navigate', section: 'fun-decks' });
assert.equal(funDecks.section, 'fun-decks');

const sameUserMenuClosed = adminWorkspaceReducer(
  adminWorkspaceReducer(initial, { type: 'toggleUserMenu', userId: 'user-1' }),
  { type: 'toggleUserMenu', userId: 'user-1' },
);
assert.equal(sameUserMenuClosed.openUserMenuId, '');
assert.strictEqual(
  adminWorkspaceReducer(initial, { type: 'closeAdminMenu' }),
  initial,
  'closing an already closed admin menu must not rerender',
);
assert.strictEqual(
  adminWorkspaceReducer(initial, { type: 'closeUserMenu' }),
  initial,
  'closing an already closed user menu must not rerender',
);

console.log('admin workspace state reducer tests passed');
