import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The remembered viewer that lets a page show the signed-in account and its
// paid views before the session check answers. It grants nothing (the API
// still checks every paid request) and must never show a previous viewer.
const store = new Map<string, string>();
let storageBroken = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => { if (storageBroken) throw new Error('denied'); return store.get(key) ?? null; },
  setItem: (key: string, value: string) => { if (storageBroken) throw new Error('denied'); store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
} });
let cookie = '';
Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { return cookie; } } });

const { clearViewerHint, readViewerHint, sessionTag, writeViewerHint, VIEWER_HINT_KEY, VIEWER_HINT_TTL_MS, VIEWER_SESSION_COOKIE } =
  await import('../apps/public-web/ui/viewerHint.ts');
const { recordVerifiedAccount, recordVerifiedGrants, recordVerifiedViewer, viewerState, GUEST_VIEWER } =
  await import('../apps/public-web/ui/restoredPageAccess.ts');
const { VIEWER_SESSION_COOKIE: SERVER_COOKIE } = await import('../server/modules/browserSessionCookies/public.ts');

const alpha = { id: 'alpha', email: 'alpha@example.test', name: 'Альфа', role: 'user', photoUrl: 'https://cdn.example/a.png',
  avatarInitials: 'АЛ', country: 'RU', contactEmail: 'private@example.test', telegramUsername: 'alpha_tg' };
const beta = { id: 'beta', email: 'beta@example.test', name: 'Бета', role: 'user' };
const subscribed = { hasAccess: true, entitlements: { standard: true, battlegrounds: true }, source: 'boosty',
  checkedAt: '2026-10-20T10:00:00.000Z', stale: false, message: 'Подписка активна', boosty: { email: 'alpha@example.test' },
  patreon: {}, telegram: { username: 'alpha_tg' } };
const lapsed = { ...subscribed, hasAccess: false, entitlements: {} };
const now = Date.parse('2026-10-20T12:00:00.000Z');

type Subscription = Omit<typeof subscribed, 'entitlements'> & { entitlements: Record<string, boolean> };
function verify(user: typeof alpha | typeof beta, subscription: Subscription) {
  recordVerifiedAccount(user);
  recordVerifiedGrants(viewerState(user, subscription));
  writeViewerHint(user, subscription, sessionTag(), now);
}

assert.equal(VIEWER_SESSION_COOKIE, SERVER_COOKIE, 'client and server name the same viewer tag cookie');

// Without the session's viewer tag nothing is remembered.
verify(alpha, subscribed);
assert.equal(store.get(VIEWER_HINT_KEY), undefined);
assert.equal(readViewerHint(now), null);

// After a verified answer the page can show the same account and its grants at once.
cookie = `theme=dark; ${VIEWER_SESSION_COOKIE}=tag-alpha-session-0001; other=1`;
verify(alpha, subscribed);
const remembered = readViewerHint(now + 1000);
assert.ok(remembered);
assert.equal(remembered.user.id, 'alpha');
assert.equal(remembered.user.name, 'Альфа');
assert.equal(remembered.user.photoUrl, 'https://cdn.example/a.png');
assert.equal(remembered.subscription.hasAccess, true);
assert.deepEqual(remembered.subscription.entitlements, { battlegrounds: true, standard: true });
assert.equal(viewerState(remembered.user, remembered.subscription), viewerState(alpha, subscribed));

// It keeps only what the header and the access decision need: no e-mail,
// contacts or provider details.
const raw = String(store.get(VIEWER_HINT_KEY));
for (const secret of ['alpha@example.test', 'private@example.test', 'alpha_tg', 'boosty', 'RU', 'Подписка активна']) {
  assert.ok(!raw.includes(secret), `hint must not store ${secret}`);
}
assert.equal(remembered.user.email, '');

// Another session (sign-out, expiry or another account signed in) has another
// tag, or none: the remembered viewer is not shown, and it is forgotten so it
// does not stay behind on a shared device.
for (const other of [`${VIEWER_SESSION_COOKIE}=tag-beta-session-00002`, '']) {
  cookie = `${VIEWER_SESSION_COOKIE}=tag-alpha-session-0001`;
  verify(alpha, subscribed);
  cookie = other;
  assert.equal(readViewerHint(now), null, other);
  assert.equal(store.get(VIEWER_HINT_KEY), undefined, other);
}
cookie = `${VIEWER_SESSION_COOKIE}=tag-alpha-session-0001`;
verify(alpha, subscribed);
assert.ok(readViewerHint(now));

// It is short-lived.
assert.equal(readViewerHint(now + VIEWER_HINT_TTL_MS + 1), null);
assert.equal(store.get(VIEWER_HINT_KEY), undefined);
assert.ok(VIEWER_HINT_TTL_MS <= 3 * 24 * 60 * 60 * 1000);
verify(alpha, subscribed);

// It never outlives the server session it was confirmed for: the cookies
// outlive a session that ends on its own.
clearViewerHint();
writeViewerHint(alpha, subscribed, sessionTag(), now, now + 60_000);
assert.ok(readViewerHint(now + 59_000));
assert.equal(readViewerHint(now + 61_000), null);
verify(alpha, subscribed);

// An answer confirmed under one session is not remembered for the session
// that replaced it (another account signed in meanwhile, in another tab).
clearViewerHint();
writeViewerHint(alpha, subscribed, 'tag-of-the-previous-session', now);
assert.equal(store.get(VIEWER_HINT_KEY), undefined);
writeViewerHint(alpha, subscribed, null, now);
assert.equal(store.get(VIEWER_HINT_KEY), undefined);
verify(alpha, subscribed);

// It must agree with the viewer the server last confirmed in this browser
// (restoredPageAccess.ts): another account, a guest or changed grants win.
recordVerifiedViewer(viewerState(beta, null));
assert.equal(readViewerHint(now), null);
recordVerifiedViewer(GUEST_VIEWER);
assert.equal(readViewerHint(now), null);
recordVerifiedViewer(viewerState(alpha, lapsed));
assert.equal(readViewerHint(now), null);
verify(alpha, subscribed);
assert.ok(readViewerHint(now));

// A lapsed subscription is remembered as such: the page shows the gate at once.
verify(alpha, lapsed);
assert.equal(readViewerHint(now)?.subscription.hasAccess, false);

// A guest answer forgets it.
verify(alpha, subscribed);
clearViewerHint();
assert.equal(readViewerHint(now), null);

// Tampered or foreign values are ignored, never trusted.
for (const value of ['{', 'null', '[]', JSON.stringify({ v: 2 }),
  JSON.stringify({ v: 1, tag: 'tag-alpha-session-0001', exp: now + 1000, viewer: viewerState(alpha, subscribed),
    user: { id: 7, name: 'x', role: 'user' }, access: { hasAccess: true } }),
  JSON.stringify({ v: 1, tag: 'tag-alpha-session-0001', exp: now + 1000, viewer: viewerState(alpha, subscribed),
    user: { id: 'alpha', name: 'Альфа', role: 'user' }, access: { hasAccess: 'yes' } })]) {
  store.set(VIEWER_HINT_KEY, value);
  assert.equal(readViewerHint(now), null, value);
}

// Storage that cannot be read or written leaves no viewer behind.
verify(alpha, subscribed);
storageBroken = true;
assert.equal(readViewerHint(now), null);
writeViewerHint(beta, subscribed, sessionTag(), now);
storageBroken = false;
assert.equal(readViewerHint(now), null, 'a failed write must not keep the previous viewer');

// The head script applies the same rule before the first paint.
const head = readFileSync(new URL('../apps/public-web/lib/authPrefetch.ts', import.meta.url), 'utf8');
for (const name of [VIEWER_HINT_KEY, VIEWER_SESSION_COOKIE, 'hs_arena_verified_viewer', 'hpViewer']) {
  assert.ok(head.includes(name), `authPrefetch must check ${name}`);
}
assert.equal(VIEWER_HINT_TTL_MS, 2592e5);
assert.ok(head.includes('n+2592e5'), 'the head script uses the same lifetime');

console.log('public viewer hint tests passed');
