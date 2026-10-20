import type { AuthUser } from '@/src/modules/identity/public';
import type { SubscriptionStatus } from '@/src/modules/subscriptions/public';
import { verifiedViewer, viewerState } from './restoredPageAccess';

// The viewer this browser last verified, kept so that the next page shows the
// signed-in account and its paid views at once instead of after the session
// check (instant access, docs/specs/instant-viewer-access.md). It grants
// nothing: every paid request is still checked by the API, and the session
// check replaces it moments later. Public HTML never carries it.
//
// It is shown only while all of these hold, so a shared or restored device
// never shows a previous viewer:
// - the session's readable viewer tag (`hp_viewer`, set and cleared by the
//   server with the HttpOnly session cookie) is the one it was written under;
// - it is younger than VIEWER_HINT_TTL_MS;
// - it names exactly the viewer the server last confirmed in this browser
//   (restoredPageAccess.ts).
// The head script in apps/public-web/lib/authPrefetch.ts applies the same
// rule before the first paint; keep the two in step.
export const VIEWER_HINT_KEY = 'hs_arena_viewer_hint';
export const VIEWER_SESSION_COOKIE = 'hp_viewer';
export const VIEWER_HINT_TTL_MS = 72 * 60 * 60 * 1000;
const VERSION = 1;

type Entitlements = NonNullable<SubscriptionStatus['entitlements']>;
type StoredHint = {
  v: number;
  tag: string;
  exp: number;
  viewer: string;
  user: Pick<AuthUser, 'id' | 'name' | 'role' | 'photoUrl' | 'avatarInitials' | 'publicProfileId' | 'adminAllowed' | 'contestAdminAllowed'>;
  access: { hasAccess: boolean; entitlements: Entitlements };
};

export type ViewerHint = { user: AuthUser; subscription: SubscriptionStatus };

/** The session's readable viewer tag, or null without a session. */
export function sessionTag(): string | null {
  try {
    const match = /(?:^|;\s*)hp_viewer=([A-Za-z0-9_-]{22})(?:;|$)/.exec(document.cookie);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const optionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean';

function parse(raw: string | null): StoredHint | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.v !== VERSION || typeof value.tag !== 'string' || typeof value.exp !== 'number'
    || typeof value.viewer !== 'string' || !isRecord(value.user) || !isRecord(value.access)) return null;
  const { user, access } = value;
  if (typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.role !== 'string'
    || !optionalString(user.photoUrl) || !optionalString(user.avatarInitials) || !optionalString(user.publicProfileId)
    || !optionalBoolean(user.adminAllowed) || !optionalBoolean(user.contestAdminAllowed)
    || typeof access.hasAccess !== 'boolean' || !isRecord(access.entitlements)
    || !Object.values(access.entitlements).every(granted => granted === true)) return null;
  return value as StoredHint;
}

/** The remembered viewer for this session, or null when it must not be shown. */
export function readViewerHint(now = Date.now()): ViewerHint | null {
  let raw: string | null;
  try { raw = localStorage.getItem(VIEWER_HINT_KEY); } catch { return null; }
  const hint = parse(raw);
  const tag = sessionTag();
  if (!hint || !tag || hint.tag !== tag || hint.exp <= now || hint.exp > now + VIEWER_HINT_TTL_MS) {
    // Another session, none, or too old: it can never be shown again, so it
    // does not stay behind on a shared device either.
    if (raw !== null) clearViewerHint();
    return null;
  }
  const user: AuthUser = { ...hint.user, email: '' };
  const subscription: SubscriptionStatus = {
    hasAccess: hint.access.hasAccess, entitlements: { ...hint.access.entitlements },
    source: 'remembered', checkedAt: null, stale: true, message: '', boosty: {}, patreon: {}, telegram: {},
  };
  const viewer = viewerState(user, subscription);
  return viewer === hint.viewer && viewer === verifiedViewer() ? { user, subscription } : null;
}

/**
 * Remembers a viewer the server has just confirmed, account and subscription
 * both. `confirmedTag` is the session tag when the server confirmed the
 * account: if another sign-in replaced the session since, nothing is written,
 * so the new session never inherits the previous account.
 */
export function writeViewerHint(user: AuthUser, subscription: SubscriptionStatus | null, confirmedTag: string | null,
  now = Date.now(), sessionExpiresAt?: number): void {
  const tag = sessionTag();
  if (!tag || tag !== confirmedTag || !user.id) {
    clearViewerHint();
    return;
  }
  const entitlements = Object.fromEntries(Object.entries(subscription?.entitlements ?? {})
    .filter(([, granted]) => granted === true)) as Entitlements;
  const access = { hasAccess: Boolean(subscription?.hasAccess), entitlements };
  const stored: StoredHint = {
    // Never longer than the server session: a session that ended on its own
    // (the cookies outlive it) shows nobody on a shared device.
    v: VERSION, tag, exp: Math.min(now + VIEWER_HINT_TTL_MS, sessionExpiresAt ?? Infinity),
    viewer: viewerState(user, { ...subscription, ...access } as SubscriptionStatus),
    user: {
      id: user.id, name: user.name, role: user.role, photoUrl: user.photoUrl, avatarInitials: user.avatarInitials,
      publicProfileId: user.publicProfileId, adminAllowed: user.adminAllowed, contestAdminAllowed: user.contestAdminAllowed,
    },
    access,
  };
  try {
    localStorage.setItem(VIEWER_HINT_KEY, JSON.stringify(stored));
  } catch {
    clearViewerHint();
  }
}

/**
 * Drops a viewer tag that outlived its session, after the server answered as
 * a guest for exactly this tag. The server never writes cookies on a session
 * check, because its answer can arrive after another tab signed in.
 */
export function forgetViewerTag(): void {
  try {
    document.cookie = `${VIEWER_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch { /* cookies disabled: nothing to forget */ }
}

export function clearViewerHint(): void {
  try { localStorage.removeItem(VIEWER_HINT_KEY); } catch { /* storage disabled: nothing is remembered */ }
}
