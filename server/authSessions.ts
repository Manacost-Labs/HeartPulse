export interface AuthSessionRecord {
  tokenHash: string;
  userId?: string;
  email: string;
  expiresAt: number;
  createdAt: string;
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
