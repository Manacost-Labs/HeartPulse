import type { DatabaseSync } from 'node:sqlite';

// One Twitch account per site account and one site account per Twitch
// account; deleting the site account deletes the link. No Twitch token is kept.
export const TWITCH_LINK_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS twitch_links (
    user_id TEXT PRIMARY KEY,
    twitch_user_id TEXT NOT NULL UNIQUE,
    login TEXT NOT NULL,
    display_name TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

export type TwitchLink = {
  userId: string;
  twitchUserId: string;
  login: string;
  displayName: string;
  linkedAt: string;
};

type Row = Record<string, unknown>;
const fromRow = (row: Row): TwitchLink => ({
  userId: String(row.user_id),
  twitchUserId: String(row.twitch_user_id),
  login: String(row.login),
  displayName: String(row.display_name),
  linkedAt: String(row.linked_at),
});

export type TwitchLinkRepository = ReturnType<typeof createTwitchLinkRepository>;

export function createTwitchLinkRepository(getDatabase: () => DatabaseSync) {
  getDatabase().exec(TWITCH_LINK_TABLES_SQL);
  return {
    find(userId: string): TwitchLink | null {
      const row = getDatabase().prepare('SELECT * FROM twitch_links WHERE user_id = ?').get(userId) as Row | undefined;
      return row ? fromRow(row) : null;
    },
    /**
     * Links the Twitch account to this site account. A Twitch account that was
     * linked elsewhere moves here: the OAuth login just proved who controls it.
     */
    link(link: TwitchLink): void {
      const database = getDatabase();
      database.exec('BEGIN IMMEDIATE');
      try {
        database.prepare('DELETE FROM twitch_links WHERE twitch_user_id = ? AND user_id <> ?').run(link.twitchUserId, link.userId);
        database.prepare(`INSERT INTO twitch_links (user_id, twitch_user_id, login, display_name, linked_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET twitch_user_id = excluded.twitch_user_id, login = excluded.login,
            display_name = excluded.display_name, linked_at = excluded.linked_at`)
          .run(link.userId, link.twitchUserId, link.login, link.displayName, link.linkedAt);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    /** The link for the account's data export: what is stored, nothing else. */
    *exportRows(userId: string): Iterable<string> {
      const link = this.find(userId);
      if (link) {
        yield JSON.stringify({ twitchUserId: link.twitchUserId, login: link.login, displayName: link.displayName, linkedAt: link.linkedAt });
      }
    },
    /** Returns the removed link, if there was one. */
    unlink(userId: string): TwitchLink | null {
      const existing = this.find(userId);
      if (existing) getDatabase().prepare('DELETE FROM twitch_links WHERE user_id = ?').run(userId);
      return existing;
    },
  };
}
