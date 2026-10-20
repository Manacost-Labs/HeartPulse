import assert from 'node:assert/strict';

// The viewer's access as one explicit state (apps/public-web/ui/accessState.ts):
// every transition and what each paid section shows in each state.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
} });
const { accessChecking, entitlementAccess, INITIAL_ACCESS_STATE, reduceAccess } =
  await import('../apps/public-web/ui/accessState.ts');
type State = typeof INITIAL_ACCESS_STATE;
type Event = Parameters<typeof reduceAccess>[1];

const reader = { id: 'reader', email: 'reader@example.test', name: 'Читатель', role: 'user' };
const other = { id: 'other', email: 'other@example.test', name: 'Другой', role: 'user' };
const admin = { id: 'admin', email: 'admin@example.test', name: 'Админ', role: 'admin', adminAllowed: true };
const status = (entitlements: Record<string, boolean>) => ({ hasAccess: Object.keys(entitlements).length > 0, entitlements,
  source: 'boosty', checkedAt: null, stale: false, message: '', boosty: {}, patreon: {}, telegram: {} });
const standard = status({ standard: true });
const none = status({});

const unknown = INITIAL_ACCESS_STATE;
const remembered: State = { phase: 'pending', viewer: reader, grants: standard, source: 'remembered' };
const hidden: State = { phase: 'pending', viewer: null, grants: null, source: 'none' };
const guest: State = { phase: 'confirmed', viewer: null, grants: null, source: 'session' };
const subscriber: State = { phase: 'confirmed', viewer: reader, grants: standard, source: 'session' };
const lapsed: State = { phase: 'confirmed', viewer: reader, grants: none, source: 'session' };
const awaitingGrants: State = { phase: 'pending', viewer: reader, grants: null, source: 'session' };
const signingIn: State = { phase: 'pending', viewer: reader, grants: null, source: 'sign-in' };
const failed: State = { phase: 'unavailable', viewer: null, grants: null, source: 'none' };
const failedWithAccount: State = { phase: 'unavailable', viewer: reader, grants: null, source: 'session' };

const transitions: Array<[string, State, Event, State]> = [
  ['a remembered viewer shows before the check', unknown, { type: 'remembered', viewer: reader, grants: standard }, remembered],
  ['a restore hides everything, pending', subscriber, { type: 'hidden' }, hidden],
  ['a check makes the page pending, keeping what it shows', lapsed, { type: 'checking' }, { ...lapsed, phase: 'pending' }],
  ['a guest answer is confirmed at once', remembered, { type: 'session', viewer: null, publish: true, quiet: true }, guest],
  ['a guest answer on a restored page too', hidden, { type: 'session', viewer: null, publish: false, quiet: false }, guest],
  ['a quiet re-check of the same account changes nothing', subscriber,
    { type: 'session', viewer: reader, publish: true, quiet: true }, subscriber],
  ['…nor of a remembered one', remembered, { type: 'session', viewer: reader, publish: true, quiet: true }, remembered],
  ['another account replaces the remembered one, its grants unknown', remembered,
    { type: 'session', viewer: other, publish: true, quiet: true }, { phase: 'pending', viewer: other, grants: null, source: 'session' }],
  ['a restored page shows no account before its subscription', hidden,
    { type: 'session', viewer: reader, publish: false, quiet: false }, hidden],
  ['…even when it showed one before', subscriber, { type: 'session', viewer: other, publish: false, quiet: false }, hidden],
  ['a first check shows the account while its grants are pending', { ...unknown, phase: 'pending' },
    { type: 'session', viewer: reader, publish: true, quiet: false }, awaitingGrants],
  ['both answers confirm the viewer', awaitingGrants, { type: 'confirmed', viewer: reader, grants: standard }, subscriber],
  ['a confirmed refusal', remembered, { type: 'confirmed', viewer: reader, grants: none }, lapsed],
  ['a sign-in shows the account, grants pending', guest, { type: 'signed-in', viewer: reader }, signingIn],
  ['sign-out or a lost session leaves a guest', subscriber, { type: 'guest' }, guest],
  ['a failed check without a confirmed account', remembered, { type: 'unavailable', viewer: null }, failed],
  ['a failed check keeps the account it confirmed', awaitingGrants, { type: 'unavailable', viewer: reader }, failedWithAccount],
  ['a refresh confirms the shown account\'s grants', failedWithAccount, { type: 'refreshed', grants: standard }, subscriber],
  ['a refresh without an account changes nothing', guest, { type: 'refreshed', grants: standard }, guest],
];
for (const [label, from, event, to] of transitions) {
  assert.deepEqual(reduceAccess(from, event), to, label);
}

// What a section needing `standard` (and one needing `battlegrounds`) shows.
const sections: Array<[string, State, string, string, boolean]> = [
  ['before anything is known', unknown, 'pending', 'pending', true],
  ['a remembered subscriber opens what is granted, the rest waits', remembered, 'granted', 'pending', false],
  ['a restored page', hidden, 'pending', 'pending', true],
  ['a confirmed guest sees the lock', guest, 'denied', 'denied', false],
  ['a confirmed subscriber', subscriber, 'granted', 'denied', false],
  ['a confirmed lapsed plan sees the lock', lapsed, 'denied', 'denied', false],
  ['an account whose grants are on their way', awaitingGrants, 'pending', 'pending', false],
  ['right after a sign-in', signingIn, 'pending', 'pending', false],
  ['a failed check offers a retry, never the lock', failed, 'unavailable', 'unavailable', false],
  ['…with the account it confirmed', failedWithAccount, 'unavailable', 'unavailable', false],
  ['an administrator opens everything', { ...awaitingGrants, viewer: admin }, 'granted', 'granted', false],
];
for (const [label, state, standardAccess, battlegroundsAccess, checking] of sections) {
  assert.equal(entitlementAccess(state, 'standard'), standardAccess, `${label}: standard`);
  assert.equal(entitlementAccess(state, 'battlegrounds'), battlegroundsAccess, `${label}: battlegrounds`);
  assert.equal(accessChecking(state), checking, `${label}: session placeholder`);
}

// Only a confirmed refusal locks: no transition reaches `denied` without the server.
for (const [label, , event, to] of transitions) {
  if (to.phase === 'confirmed') {
    assert.ok(['session', 'confirmed', 'guest', 'refreshed'].includes(event.type), `${label}: confirmed only by a server answer`);
  }
}

console.log('public access state tests passed');
