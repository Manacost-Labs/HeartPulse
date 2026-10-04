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

const { GUEST_VIEWER, recordVerifiedAccount, recordVerifiedGrants, recordVerifiedViewer, restoredPageMustHideViewer, verifiedViewer, viewerState } =
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

// A's restored paid page while the server last confirmed A: it stays.
recordVerifiedViewer(viewerState(alpha, subscribed));
assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), false);

// Any other confirmed viewer hides it at once: a guest (signed out or the
// session ended), another account (redirect sign-in), or A without the entitlement.
for (const other of [GUEST_VIEWER, viewerState(beta, null), viewerState(beta, subscribed), viewerState(alpha, lapsed)]) {
  recordVerifiedViewer(other);
  assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), true, other);
}

// A session answer records another account (or a guest) at once, before its
// subscription answers; the same account keeps its last confirmed grants.
recordVerifiedViewer(viewerState(alpha, subscribed));
recordVerifiedAccount(alpha);
assert.equal(verifiedViewer(), viewerState(alpha, subscribed));
recordVerifiedAccount(beta);
assert.equal(verifiedViewer(), viewerState(beta, null));
assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), true);
recordVerifiedAccount(null);
assert.equal(verifiedViewer(), GUEST_VIEWER);
assert.equal(viewerState(beta, null), viewerState(beta, lapsed), 'no grants and unknown grants record the same');

// Unknown (nothing recorded, or storage unreadable) hides too.
store.clear();
assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), true);
storageBroken = true;
recordVerifiedViewer(viewerState(alpha, subscribed));
assert.equal(verifiedViewer(), null);
assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), true);
storageBroken = false;

// A late subscription answer for A (another tab meanwhile ended A's session
// and signed B in) must not overwrite B's record: grants are written only
// while the record still names the same account.
recordVerifiedAccount(beta);
recordVerifiedGrants(viewerState(alpha, subscribed));
assert.equal(verifiedViewer(), viewerState(beta, null));
assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), true);
recordVerifiedGrants(viewerState(beta, subscribed));
assert.equal(verifiedViewer(), viewerState(beta, subscribed));
recordVerifiedAccount(null);
recordVerifiedGrants(viewerState(beta, subscribed));
assert.equal(verifiedViewer(), GUEST_VIEWER, 'a guest record is never upgraded by a late answer');

// A write that fails (quota, privacy mode) must not leave the previous
// viewer's record behind: it is removed, so a restored page hides.
recordVerifiedViewer(viewerState(alpha, subscribed));
const setItem = storage.setItem;
storage.setItem = () => { throw new Error('QuotaExceededError'); };
recordVerifiedAccount(beta);
storage.setItem = setItem;
assert.equal(verifiedViewer(), null);
assert.equal(restoredPageMustHideViewer(viewerState(alpha, subscribed), verifiedViewer()), true);

// A guest page shows nothing private; it only re-checks.
assert.equal(restoredPageMustHideViewer(GUEST_VIEWER, viewerState(beta, subscribed)), false);

// The hook records every server answer, hides synchronously before re-checking,
// and a quiet re-check that cannot reach the server hides as well.
const accessSource = readFileSync(new URL('../apps/public-web/ui/usePublicAccess.ts', import.meta.url), 'utf8');
assert.match(accessSource, /addEventListener\('pageshow', onPageShow\)/);
assert.match(accessSource, /removeEventListener\('pageshow', onPageShow\)/);
assert.match(accessSource, /if \(!event\.persisted\) return;/);
assert.match(accessSource, /restoredPageMustHideViewer\(shownViewer\.current, verifiedViewer\(\)\)/);
assert.match(accessSource, /flushSync\(\(\) => \{\s*showUser\(null\);\s*setSubscription\(null\);\s*setChecking\(true\);\s*\}\);\s*void verifySession\(\);/);
assert.equal((accessSource.match(/recordVerifiedAccount\(current\);/g) ?? []).length, 2,
  'every session answer and every sign-in or sign-out records the viewer');
assert.match(accessSource, /recordVerifiedGrants\(viewerState\(current, value\)\);\s*setSubscription\(value\);/);
assert.doesNotMatch(accessSource, /recordVerifiedViewer\(/, 'subscription answers write grants only for the recorded account');
assert.match(accessSource, /if \(quiet\) \{\s*showUser\(null\);\s*setSubscription\(null\);\s*\}/);

// Viewer-specific parts of public pages follow the viewer in the same render,
// so a restored page that hides its viewer also drops them.
const articlesSource = readFileSync(new URL('../apps/public-web/ui/ArticlesPageClient.tsx', import.meta.url), 'utf8');
assert.match(articlesSource, /const data = personal && userId && personal\.owner === userId \? personal\.data : initialData;/);
const contestsSource = readFileSync(new URL('../apps/public-web/ui/ContestsPageClient.tsx', import.meta.url), 'utf8');
assert.match(contestsSource, /<ContestsPage key=\{access\.user\?\.id \?\? 'guest'\}/);
const articleVotesSource = readFileSync(new URL('../src/modules/articles/ui/ArticlesTab.tsx', import.meta.url), 'utf8');
assert.match(articleVotesSource, /castVotes\.articles === data\.articles \? castVotes\.votes : NO_VOTES/);
const classesSource = readFileSync(new URL('../src/modules/arenaClasses/useArenaClasses.ts', import.meta.url), 'utf8');
assert.match(classesSource, /const state = enabled && accountId && view\.accountId === accountId \? view\.state : LOADING;/);

console.log('restored page access tests passed');
