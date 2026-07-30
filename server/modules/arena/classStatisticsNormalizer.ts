type JsonRecord = Record<string, unknown>;

type ArenaClassInfo = JsonRecord & {
  id: string;
  name: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function percentage(value: unknown): number | null {
  const raw = typeof value === 'string' ? value.replace('%', '').trim() : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.round(percent * 100) / 100;
}

function optionalCount(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}

function cardId(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return /^[A-Za-z0-9_]{1,80}$/.test(normalized) ? normalized : null;
}

/**
 * Preserves every class-level statistic published by the HSReplay Arena
 * dataset while keeping provider field aliases out of the public contract.
 */
export function normalizeHsReplayArenaClassRows(
  values: unknown[],
  classIdByKey: Record<string, string>,
  classInfoByKey: Record<string, ArenaClassInfo>,
) {
  return values
    .map((value) => {
      const row = record(value);
      const rawClassKey = String(row.class ?? row.class_name ?? row.name ?? '')
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z]/g, '');
      const classId = classIdByKey[rawClassKey] ?? null;
      const infoKey = classId ? classId.replace(/-/g, '') : '';
      const info = classInfoByKey[infoKey] ?? classInfoByKey[classId ?? ''];
      const winrate = percentage(row.win_rate ?? row.winrate);
      const games = Number(
        row.num_drafts ?? row.games ?? row.total_games ?? row.totalGames ?? 0,
      );
      if (!info || winrate === null || !Number.isFinite(games) || games <= 0) {
        return null;
      }
      return {
        ...info,
        winrate: Math.round(winrate * 10) / 10,
        games,
        wins: optionalCount(row.wins ?? row.total_wins ?? row.totalWins),
        losses: optionalCount(row.losses ?? row.total_losses ?? row.totalLosses),
        pickRate: percentage(row.pick_rate ?? row.pickRate),
        sevenPlusWinsRate: percentage(
          row.pct_7_plus ?? row.pct7Plus ?? row.seven_plus_wins_rate,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.winrate - left.winrate);
}

/**
 * Converts Firestone class aggregates into the shared Arena class shape.
 * Losses are derived only when both source counts are finite.
 */
export function normalizeFirestoneArenaClassRows(
  values: unknown[],
  classInfoByKey: Record<string, ArenaClassInfo>,
) {
  return values
    .map((value) => {
      const row = record(value);
      const key = String(row.playerClass ?? '')
        .toLocaleLowerCase('en-US')
        .replace(/\s+/g, '');
      const info = classInfoByKey[key];
      const games = Number(row.totalGames);
      const wins = Number(row.totalsWins);
      if (!info || !Number.isFinite(games) || games <= 0 || !Number.isFinite(wins)) {
        return null;
      }
      return {
        ...info,
        winrate: Math.round((wins / games) * 1000) / 10,
        games,
        wins,
        losses: Math.max(0, games - wins),
        heroPowerCardId: cardId(row.playerHeroPower),
        winsDistribution: (Array.isArray(row.winsDistribution) ? row.winsDistribution : [])
          .map((value) => {
            const distribution = record(value);
            const distributionWins = optionalCount(distribution.wins);
            const distributionGames = optionalCount(
              distribution.total ?? distribution.games,
            );
            return distributionWins === undefined || distributionGames === undefined
              ? null
              : { wins: distributionWins, games: distributionGames };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .sort((left, right) => left.wins - right.wins),
        matchups: (Array.isArray(row.matchups) ? row.matchups : [])
          .map((value) => {
            const matchup = record(value);
            const opponentKey = String(matchup.opponentClass ?? '')
              .toLocaleLowerCase('en-US')
              .replace(/\s+/g, '');
            const opponentClassId = classInfoByKey[opponentKey]?.id;
            const matchupGames = optionalCount(matchup.totalGames);
            const matchupWins = optionalCount(matchup.totalsWins);
            if (!opponentClassId || matchupGames === undefined
              || matchupGames <= 0 || matchupWins === undefined) {
              return null;
            }
            return {
              opponentClassId,
              opponentHeroPowerCardId: cardId(matchup.opponentHeroPower),
              games: matchupGames,
              wins: matchupWins,
              losses: Math.max(0, matchupGames - matchupWins),
              winrate: Math.round((matchupWins / matchupGames) * 10_000) / 100,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        pickRate: percentage(row.pickRate ?? row.pick_rate),
        sevenPlusWinsRate: percentage(
          row.pct7Plus ?? row.pct_7_plus ?? row.sevenPlusWinsRate,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.winrate - left.winrate);
}

type NormalizedFirestoneArenaClass = ReturnType<
  typeof normalizeFirestoneArenaClassRows
>[number];

export function firestoneArenaMatchupsDataset(data: {
  classes: NormalizedFirestoneArenaClass[];
  updatedAt: string | null;
  source: string;
}) {
  return {
    updatedAt: data.updatedAt,
    source: data.source,
    matchups: data.classes.flatMap(classItem => classItem.matchups.map(matchup => ({
      classAId: classItem.id,
      classBId: matchup.opponentClassId,
      winrate: matchup.winrate,
      games: matchup.games,
    }))),
  };
}
