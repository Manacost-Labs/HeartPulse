export type ArenaClass = {
  id: string;
  name: string;
  winrate: number;
  color: string;
  games?: number;
};
export type ArenaClassSource = 'hsreplay' | 'firestone';
export type ArenaClassesData = {
  classes: ArenaClass[];
  updatedAt: string | null;
  source: string;
  warning?: string;
};
export type ArenaClassesState = {
  status: 'loading' | 'ready' | 'empty' | 'error' | 'stale';
  data: ArenaClassesData | null;
};
export const ARENA_CLASSES_TTL_MS = 6 * 60 * 60_000;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Reject malformed or synthetic payloads before they can enter the real-data cache. */
export function parseArenaClasses(value: unknown): ArenaClassesData | null {
  if (!object(value) || !Array.isArray(value.classes)
    || typeof value.source !== 'string' || !value.source || value.source === 'initial') return null;
  const classes: ArenaClass[] = [];
  for (const entry of value.classes) {
    if (!object(entry) || typeof entry.id !== 'string' || !entry.id
      || typeof entry.name !== 'string' || !entry.name
      || typeof entry.winrate !== 'number' || !Number.isFinite(entry.winrate)
      || entry.winrate < 0 || entry.winrate > 100
      || typeof entry.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color)) return null;
    classes.push({ id: entry.id, name: entry.name, winrate: entry.winrate, color: entry.color,
      ...(typeof entry.games === 'number' && Number.isFinite(entry.games) && entry.games >= 0
        ? { games: entry.games } : {}),
    });
  }
  return { classes, source: value.source,
    updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
      ? value.updatedAt : null,
    ...(typeof value.warning === 'string' ? { warning: value.warning } : {}),
  };
}

export function arenaClassesState(data: ArenaClassesData, now: number, stale = false): ArenaClassesState {
  if (!data.classes.length) return { status: 'empty', data };
  const expired = data.updatedAt !== null && now - Date.parse(data.updatedAt) > ARENA_CLASSES_TTL_MS;
  return { status: stale || data.warning || expired ? 'stale' : 'ready', data };
}
