import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The decision a page restored from the back/forward cache takes before it
// asks the server again: hide the viewer it shows, or keep the page as is.
const store = new Map<string, string>();
let storageBroken = false;
const storage = {
  getItem: (key: string) => { if (storageBroken) throw new Error('denied'); return store.get(key) ?? null; },
  setItem: (key: string, value: string) => { if (storageBroken) throw new Error('denied'); store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const { GUEST_VIEWER, recordVerifiedAccount, recordVerifiedGrants, recordVerifiedViewer, verifiedViewer, viewerState } =
  await import('../apps/public-web/ui/restoredPageAccess.ts');

const alpha = { id: 'alpha', email: 'alpha@example.test', name: 'Альфа', role: 'user' };
const beta = { id: 'beta', email: 'beta@example.test', name: 'Бета', role: 'user' };
const subscribed = { hasAccess: true, entitlements: { battlegrounds: true, arena: true }, source: 'boosty',
  checkedAt: null, stale: false, message: '', boosty: {}, patreon: {}, telegram: {} };
const lapsed = { ...subscribed, hasAccess: false, entitlements: {} };

// The state names the account and its grants, never the raw account id.
assert.equal(viewerState(null, subscribed), GUEST_VIEWER);
assert.notEqual(viewerState(alpha, subscribed), viewerState(beta, subscribed));
assert.notEqual(viewerState(alpha, subscribed), viewerState(alpha, lapsed));
assert.notEqual(viewerState(alpha, null), viewerState({ ...alpha, adminAllowed: true }, null));
assert.equal(viewerState(alpha, subscribed),
  viewerState(alpha, { ...subscribed, entitlements: { arena: true, battlegrounds: true, standard: false } }));
assert.ok(!viewerState(alpha, subscribed).includes('alpha'));

// The record holds exactly the last confirmed viewer.
recordVerifiedViewer(viewerState(alpha, subscribed));
assert.equal(verifiedViewer(), viewerState(alpha, subscribed));
for (const other of [GUEST_VIEWER, viewerState(beta, null), viewerState(beta, subscribed), viewerState(alpha, lapsed)]) {
  recordVerifiedViewer(other);
  assert.equal(verifiedViewer(), other);
}

// A session answer records another account (or a guest) at once, before its
// subscription answers; the same account keeps its last confirmed grants.
recordVerifiedViewer(viewerState(alpha, subscribed));
recordVerifiedAccount(alpha);
assert.equal(verifiedViewer(), viewerState(alpha, subscribed));
recordVerifiedAccount(beta);
assert.equal(verifiedViewer(), viewerState(beta, null));
recordVerifiedAccount(null);
assert.equal(verifiedViewer(), GUEST_VIEWER);
assert.equal(viewerState(beta, null), viewerState(beta, lapsed), 'no grants and unknown grants record the same');

// Unreadable storage records nothing (and remembers no viewer).
store.clear();
storageBroken = true;
recordVerifiedViewer(viewerState(alpha, subscribed));
assert.equal(verifiedViewer(), null);
storageBroken = false;

// A session answer that left before another tab confirmed another viewer is
// not about the current viewer; the same account refining its grants is.
{
  const { recordNamesAnotherViewer } = await import('../apps/public-web/ui/restoredPageAccess.ts');
  recordVerifiedViewer(viewerState(alpha, subscribed));
  const before = verifiedViewer();
  assert.equal(recordNamesAnotherViewer(alpha, before), false);
  recordVerifiedAccount(beta);
  assert.equal(recordNamesAnotherViewer(alpha, before), true, 'another account signed in meanwhile');
  recordVerifiedAccount(null);
  assert.equal(recordNamesAnotherViewer(alpha, before), true, 'signed out meanwhile');
  assert.equal(recordNamesAnotherViewer(null, before), false, 'a guest answer agrees with a guest record');
  recordVerifiedViewer(viewerState(alpha, lapsed));
  assert.equal(recordNamesAnotherViewer(alpha), false, 'the same account with other grants');
  recordVerifiedViewer(viewerState(beta, null));
  assert.equal(recordNamesAnotherViewer(alpha, verifiedViewer()), false, 'unchanged since the answer left: the answer decides');
  store.clear();
  assert.equal(recordNamesAnotherViewer(alpha), false, 'nothing recorded');
}

// A late subscription answer for A (another tab meanwhile ended A's session
// and signed B in) must not overwrite B's record: grants are written only
// while the record still names the same account.
recordVerifiedAccount(beta);
recordVerifiedGrants(viewerState(alpha, subscribed));
assert.equal(verifiedViewer(), viewerState(beta, null));
recordVerifiedGrants(viewerState(beta, subscribed));
assert.equal(verifiedViewer(), viewerState(beta, subscribed));
recordVerifiedAccount(null);
recordVerifiedGrants(viewerState(beta, subscribed));
assert.equal(verifiedViewer(), GUEST_VIEWER, 'a guest record is never upgraded by a late answer');

// A write that fails (quota, privacy mode) must not leave the previous
// viewer's record behind: it is removed, so no remembered viewer matches it.
recordVerifiedViewer(viewerState(alpha, subscribed));
const setItem = storage.setItem;
storage.setItem = () => { throw new Error('QuotaExceededError'); };
recordVerifiedAccount(beta);
storage.setItem = setItem;
assert.equal(verifiedViewer(), null);

// The hook records every server answer. A restored page that shows a viewer
// hides it synchronously before re-checking, whatever the record says, since a
// frozen page cannot know whether the session was revoked meanwhile; a quiet
// re-check that cannot reach the server hides as well.
const accessSource = readFileSync(new URL('../apps/public-web/ui/usePublicAccess.ts', import.meta.url), 'utf8');
assert.match(accessSource, /addEventListener\('pageshow', onPageShow\)/);
assert.match(accessSource, /removeEventListener\('pageshow', onPageShow\)/);
// Every restored page, a guest's too, hides and turns pending before its first
// frame, and every check until one confirms both answers stays atomic.
assert.match(accessSource, /if \(!event\.persisted\) return;\s*atomicUntilConfirmed = true;\s*flushSync\(\(\) => apply\(\{ type: 'hidden' \}\)\);\s*void verifySession\(false, \{[^}]*atomic: true \}\);/);
assert.match(accessSource, /const atomic = series\.atomic \|\| atomicUntilConfirmed;/, 'a retry after a restore stays atomic');
assert.match(accessSource, /apply\(\{ type: 'session', viewer: answer, publish: !atomic, quiet \}\);/);
assert.match(accessSource, /apply\(\{ type: 'unavailable', viewer: atomic \|\| !lastStillHolds \? null : last\?\.user \?\? null \}\);/);
// A confirmation of the series counts only for the same session and viewer.
assert.match(accessSource, /sessionTag\(\) === last\.tag && !recordNamesAnotherViewer\(last\.user\)/);
// A session change, seen in an answer or by the time the check fails,
// restarts the check with its own deadline instead of spending retries.
assert.match(accessSource, /const sessionMoved = error instanceof SessionChanged \|\| Boolean\(last && !lastStillHolds\);\s*if \(sessionMoved && \(series\.restarts \?\? 0\) < MAX_SESSION_RESTARTS\) \{\s*apply\(\{ type: 'hidden' \}\);/);
assert.equal((accessSource.match(/recordVerifiedAccount\((answer|signedIn)\);/g) ?? []).length, 2,
  'every session answer and every sign-in or sign-out records the viewer');
assert.match(accessSource, /rememberVerifiedViewer\(answer, value, confirmedTag, sessionExpiresAt\);\s*apply\(\{ type: 'confirmed', viewer: answer, grants: value \}\);/);
// A stale answer, a 401 included, is dropped before it can touch anything.
assert.match(accessSource, /if \(sessionChanged\(\)\) \{\s*confirmed = null;\s*throw new SessionChanged\(\);\s*\}\s*if \(response\.status === 401\)/);
assert.match(accessSource, /const stillCurrent = \(\) => generation === requestGeneration\.current\s*&& sessionTag\(\) === sessionAtChange && !recordNamesAnotherViewer\(signedIn\);/);
assert.match(accessSource, /if \(!stillCurrent\(\)\) return stale\(\);\s*if \(response\.status === 401\)/);
// After every await, right before acting: the sign-in's body and the refresh's body too.
assert.match(accessSource, /await response\.json\(\) as SubscriptionStatus : null;\s*if \(!stillCurrent\(\)\) return stale\(\);/);
assert.match(accessSource, /const value = await response\.json\(\) as SubscriptionStatus;\s*if \(!stillCurrent\(\)\)/);
assert.match(accessSource, /const loseSession = useCallback\(\(\) => \{\s*clearAuthSessionHint\(\);\s*clearViewerHint\(\);\s*recordVerifiedAccount\(null\);/);
assert.match(accessSource, /function rememberVerifiedViewer[^}]*recordVerifiedGrants\(viewerState\(user, subscription\)\);/);
assert.doesNotMatch(accessSource, /recordVerifiedViewer\(/, 'subscription answers write grants only for the recorded account');
// A quiet re-check that fails hides the viewer like any other.
assert.match(accessSource, /if \(quiet\) apply\(\{ type: 'hidden' \}\);/);
// Whatever the browser remembers, an unfinished check ends unavailable, not as a guest.
assert.doesNotMatch(accessSource, /hasAuthSessionHint/);

// Viewer-specific parts of public pages follow the viewer in the same render,
// so a restored page that hides its viewer also drops them.
const articlesSource = readFileSync(new URL('../apps/public-web/ui/ArticlesPageClient.tsx', import.meta.url), 'utf8');
assert.match(articlesSource, /const data = personal && userId && personal\.owner === userId \? personal\.data : publicData \?\? initialData;/);
const contestsSource = readFileSync(new URL('../apps/public-web/ui/ContestsPageClient.tsx', import.meta.url), 'utf8');
assert.match(contestsSource, /<ContestsPage key=\{access\.user\?\.id \?\? 'guest'\}/);
const articleVotesSource = readFileSync(new URL('../src/modules/articles/ui/ArticlesTab.tsx', import.meta.url), 'utf8');
assert.match(articleVotesSource, /castVotes\.articles === data\.articles \? castVotes\.votes : NO_VOTES/);
const classesSource = readFileSync(new URL('../src/modules/arenaClasses/useArenaClasses.ts', import.meta.url), 'utf8');
assert.match(classesSource, /const state = enabled && accountId && view\.accountId === accountId \? view\.state : LOADING;/);

console.log('restored page access tests passed');
