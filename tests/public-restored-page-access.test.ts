import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The decision a page restored from the back/forward cache takes before it
// asks the server again: hide the viewer it shows, or keep the page as is.
const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: { ...storage, removeItem: () => {} }, configurable: true });

const { recordViewerChange, restoredPageMustHideViewer, sessionSnapshot, viewerKey } =
  await import('../apps/public-web/ui/restoredPageAccess.ts');
const { clearAuthSessionHint, markAuthSessionHint } = await import('../src/modules/identity/public.ts');

assert.equal(viewerKey(null), null);
assert.equal(viewerKey({ id: 'reader', email: 'reader@example.test', name: 'Игрок', role: 'user' }), 'reader');
assert.equal(viewerKey({ email: 'reader@example.test', name: 'Игрок', role: 'user' }), 'reader@example.test');

// A subscriber's page checked while signed in, then restored with nothing changed: it stays.
markAuthSessionHint();
const signedIn = sessionSnapshot();
assert.equal(restoredPageMustHideViewer('reader', signedIn, sessionSnapshot()), false);

// Signed out in another page (the hint is gone): the restored page hides the viewer at once.
clearAuthSessionHint();
assert.equal(restoredPageMustHideViewer('reader', signedIn, sessionSnapshot()), true);

// Signed out and in again, maybe as someone else: the hint is back, the change record is new.
recordViewerChange();
markAuthSessionHint();
assert.notEqual(sessionSnapshot(), signedIn);
assert.equal(restoredPageMustHideViewer('reader', signedIn, sessionSnapshot()), true);

// A page that has not finished its first check, or cannot read storage, hides too.
assert.equal(restoredPageMustHideViewer('reader', null, sessionSnapshot()), true);
assert.equal(restoredPageMustHideViewer('reader', signedIn, null), true);

// A guest page shows nothing private; it only re-checks.
assert.equal(restoredPageMustHideViewer(null, signedIn, null), false);

// The hook wires the decision to `pageshow` and hides synchronously before re-checking.
const accessSource = readFileSync(new URL('../apps/public-web/ui/usePublicAccess.ts', import.meta.url), 'utf8');
assert.match(accessSource, /addEventListener\('pageshow', onPageShow\)/);
assert.match(accessSource, /removeEventListener\('pageshow', onPageShow\)/);
assert.match(accessSource, /if \(!event\.persisted\) return;/);
assert.match(accessSource, /flushSync\(\(\) => \{\s*showUser\(null\);\s*setSubscription\(null\);\s*setChecking\(true\);\s*\}\);\s*void verifySession\(\);/);
assert.match(accessSource, /if \(viewerKey\(current\) !== shownViewer\.current\) recordViewerChange\(\);/,
  'sign-in and sign-out on the account page must be visible to restored pages');

console.log('restored page access tests passed');
