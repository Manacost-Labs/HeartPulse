export interface AuthSessionRecord {
  tokenHash: string;
  userId?: string;
  email: string;
  expiresAt: number;
  createdAt: string;
}

export function cookieValues(cookieHeader: string | undefined, name: string): string[] {
  if (!cookieHeader || !name) return [];
  const values: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey !== name) continue;
    try {
      values.push(decodeURIComponent(rawValue.join('=') || ''));
    } catch {
      // A malformed legacy cookie must not hide a valid cookie with the same name.
    }
  }
  return values.filter(Boolean);
}

interface AuthTokenCandidateOptions {
  authorization?: string;
  cookieHeader?: string;
  cookieName: string;
  bodyToken?: string;
}

export function authTokenCandidates({
  authorization,
  cookieHeader,
  cookieName,
  bodyToken,
}: AuthTokenCandidateOptions): string[] {
  const header = String(authorization ?? '');
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  return [...new Set([
    bearer,
    ...cookieValues(cookieHeader, cookieName),
    String(bodyToken ?? '').trim(),
  ].filter(Boolean))];
}

interface AddAuthSessionOptions<T extends AuthSessionRecord> {
  sessions: T[];
  session: T;
  now: number;
  maxSessionsPerUser: number;
}

export function addBoundedAuthSession<T extends AuthSessionRecord>({
  sessions,
  session,
  now,
  maxSessionsPerUser,
}: AddAuthSessionOptions<T>): T[] {
  const limit = Math.max(1, Math.floor(maxSessionsPerUser));
  const active = sessions.filter(item => item.expiresAt > now);
  const belongsToUser = (item: T) => Boolean(
    (session.userId && item.userId === session.userId)
    || item.email === session.email,
  );
  const otherUsers = active.filter(item => !belongsToUser(item));
  const recentUserSessions = active
    .filter(belongsToUser)
    .sort((left, right) => right.expiresAt - left.expiresAt)
    .slice(0, limit - 1);

  return [...otherUsers, ...recentUserSessions, session];
}
