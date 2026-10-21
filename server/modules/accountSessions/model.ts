import { createHash } from 'node:crypto';

/**
 * A session row as the account page needs it. `tokenHash` never leaves the
 * server: the browser names a session by `publicSessionId`.
 */
export type StoredAccountSession = {
  tokenHash: string;
  createdAt: string;
  lastSeenAt: number | null;
  client: string;
  region: string;
};

export type AccountSessionActivity = { lastSeenAt: number; client: string; region: string };

export type AccountSessionView = {
  id: string;
  current: boolean;
  /** «Chrome · Windows»; empty when the browser did not say. */
  device: string;
  /** Coarse place from the edge («Россия», «Европа»), or null. */
  place: string | null;
  signedInAt: string;
  lastActiveAt: string | null;
};

/**
 * Activity is written at most this often per session, so an ordinary request
 * reads the session without writing it.
 */
export const SESSION_ACTIVITY_INTERVAL_MS = 5 * 60_000;

// The edge forwards only these coarse regions (deploy/nginx/arena-edge-client-region-map.conf);
// the IP address itself is never stored.
const REGION_LABELS: Record<string, string> = {
  russia: 'Россия',
  europe: 'Европа',
  'north-america': 'Северная Америка',
  'south-america': 'Южная Америка',
  asia: 'Азия',
  oceania: 'Океания',
  africa: 'Африка',
};

const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bYaBrowser\//, 'Яндекс Браузер'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/** Browser and system only: the full user agent is never stored. */
export function summarizeUserAgent(userAgent: unknown): string {
  const value = typeof userAgent === 'string' ? userAgent.slice(0, 512) : '';
  const browser = BROWSERS.find(([pattern]) => pattern.test(value))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(value))?.[1];
  return [browser, system].filter(Boolean).join(' · ');
}

/** A region slug the edge forwards, or '' for anything else. */
export function sessionRegion(header: unknown): string {
  const value = typeof header === 'string' ? header : '';
  return Object.hasOwn(REGION_LABELS, value) ? value : '';
}

/**
 * The id the browser uses for a session: a one-way digest of the stored hash,
 * so neither the token nor its lookup key reaches the page, and distinct from
 * the `hp_viewer` tag.
 */
export function publicSessionId(tokenHash: string): string {
  return createHash('sha256').update(`hearthpulse-account-session:${tokenHash}`).digest('base64url').slice(0, 22);
}

export const PUBLIC_SESSION_ID = /^[A-Za-z0-9_-]{22}$/;

/**
 * What to write for a request on this session, or null when the stored
 * activity is recent and still describes the same browser and region.
 */
export function sessionActivityToRecord(
  stored: Pick<StoredAccountSession, 'lastSeenAt' | 'client' | 'region'>,
  request: { userAgent: unknown; region: unknown },
  now: number,
): AccountSessionActivity | null {
  // A request without the header (an internal one, such as Cover's access
  // check, reaches the API without the edge) keeps what is known, so it never
  // turns into a write per request.
  const client = summarizeUserAgent(request.userAgent) || stored.client;
  const region = sessionRegion(request.region) || stored.region;
  const recent = stored.lastSeenAt !== null && now - stored.lastSeenAt < SESSION_ACTIVITY_INTERVAL_MS && now >= stored.lastSeenAt;
  if (recent && stored.client === client && stored.region === region) return null;
  return { lastSeenAt: now, client, region };
}

/** The viewer's sessions, this one first, then the most recently active. */
export function accountSessionViews(sessions: StoredAccountSession[], currentTokenHash: string): AccountSessionView[] {
  const activeAt = (session: StoredAccountSession) => session.lastSeenAt ?? (Date.parse(session.createdAt) || 0);
  return [...sessions]
    .sort((left, right) => Number(right.tokenHash === currentTokenHash) - Number(left.tokenHash === currentTokenHash)
      || activeAt(right) - activeAt(left))
    .map(session => ({
      id: publicSessionId(session.tokenHash),
      current: session.tokenHash === currentTokenHash,
      device: session.client,
      place: REGION_LABELS[session.region] ?? null,
      signedInAt: session.createdAt,
      lastActiveAt: session.lastSeenAt === null ? null : new Date(session.lastSeenAt).toISOString(),
    }));
}
