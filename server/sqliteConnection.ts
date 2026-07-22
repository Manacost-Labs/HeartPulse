export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

type WritableSqliteConnection = {
  exec(sql: string): void;
};

export function configureWritableSqliteConnection(database: WritableSqliteConnection): void {
  database.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
}
