import type { DatabaseSync } from 'node:sqlite';

/** Reads only the provider column of the user's own identities: no subjects, emails or tokens. */
export function createSqliteLinkedProviderReader(database: () => DatabaseSync): (userId: string) => string[] {
  return userId => database()
    .prepare('SELECT DISTINCT provider FROM identities WHERE user_id = ?')
    .all(userId)
    .map(row => String((row as { provider: unknown }).provider ?? ''));
}
