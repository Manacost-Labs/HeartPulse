export type BattlegroundLibraryPool = 'current' | 'archive';

const KINDS = {
  minions: { kind: 'minion', archive: true, base: true },
  spells: { kind: 'spell', archive: true, base: true },
  anomalies: { kind: 'anomaly', archive: true, base: false },
  'dark-gifts': { kind: 'dark_gift', archive: false, base: false },
  quests: { kind: 'quest', archive: true, base: false },
  rewards: { kind: 'reward', archive: true, base: false },
  'darkmoon-prizes': { kind: 'darkmoon_prize', archive: true, base: false },
  trinkets: { kind: 'trinket', archive: true, base: false },
  timewarped: { kind: 'timewarped', archive: false, base: false },
} as const;

export function battlegroundLibraryDetailKind(kind: string, pool: BattlegroundLibraryPool) {
  const config = Object.hasOwn(KINDS, kind) ? KINDS[kind as keyof typeof KINDS] : null;
  return config && (pool === 'current' || config.archive) ? config : null;
}

export function battlegroundLibraryDetailApiPath(kind: string, pool: BattlegroundLibraryPool, dbfId: string): string | null {
  const config = battlegroundLibraryDetailKind(kind, pool);
  if (!config || !/^[1-9][0-9]*$/.test(dbfId) || !Number.isSafeInteger(Number(dbfId))) return null;
  if (config.base) {
    return pool === 'archive'
      ? `/api/bg/library/public/archive/${config.kind}/${dbfId}`
      : `/api/bg/library/public/${config.kind}/${dbfId}`;
  }
  return `/api/bg/library/public/extra/${pool}/${kind}/${dbfId}`;
}
