import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/** Row-level SQL adapter shared by dependency-injected route modules. */
export type SqlRepository = {
  get: (sql: string, ...params: SQLInputValue[]) => Record<string, unknown> | null;
  all: (sql: string, ...params: SQLInputValue[]) => Record<string, unknown>[];
  run: (sql: string, ...params: SQLInputValue[]) => { lastInsertRowid: number; changes: number };
};

export function createSqlRepository(getDatabase: () => DatabaseSync): SqlRepository {
  return {
    get: (sql, ...params) => (getDatabase().prepare(sql).get(...params) as Record<string, unknown> | undefined) ?? null,
    all: (sql, ...params) => getDatabase().prepare(sql).all(...params) as Record<string, unknown>[],
    run: (sql, ...params) => {
      const result = getDatabase().prepare(sql).run(...params);
      return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
  };
}
