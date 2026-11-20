import {
  parsePublicStandardMatchups, PUBLIC_STANDARD_MATCHUPS_HTML_LIMIT, PUBLIC_STANDARD_MATCHUPS_PATH,
  type PublicStandardMatchups,
} from '@/src/modules/standardMatchups/public';

/** Express path of the open general slice of Standard. */
export const standardMatchupsPublicPath = `${PUBLIC_STANDARD_MATCHUPS_PATH}?format=standard`;

/**
 * The open slice for the server HTML, re-checked field by field (a paid or unlisted field of the
 * answer is not copied) and cut to the most played archetypes. `null` for any failure.
 */
export function loadStandardMatchupsSeed(raw: unknown): PublicStandardMatchups | null {
  return parsePublicStandardMatchups(raw, 'standard', PUBLIC_STANDARD_MATCHUPS_HTML_LIMIT);
}

/**
 * A kept slice (the model `loadStandardMatchupsSeed` made) checked again: it is turned back into the open answer
 * and goes through the same field-by-field parser, so nothing the parser does not know survives in a stored file.
 */
export function restoreStandardMatchupsSeed(stored: unknown): PublicStandardMatchups | null {
  const model = stored as Partial<PublicStandardMatchups> | null;
  if (!model || typeof model !== 'object' || !Array.isArray(model.archetypes) || !Array.isArray(model.pairs)) return null;
  const parsed = parsePublicStandardMatchups({
    format: model.format, rank: 'all', formatLabel: model.formatLabel, rankLabel: model.rankLabel, period: model.period,
    minGames: model.minGames, totalGames: model.totalGames, sourceUrl: model.sourceUrl, updatedAt: model.updatedAt, warning: model.warning,
    columns: model.archetypes.map(item => ({ name: item?.name, label: item?.label, classKey: item?.classKey, popularity: item?.popularity, games: item?.games })),
    rows: model.archetypes.map((item, row) => ({
      archetype: item?.name, archetypeLabel: item?.label, classKey: item?.classKey, winrate: item?.winrate, games: item?.games,
      cells: model.archetypes!.map((opponent, column) => ({ opponent: opponent?.name, ...(Array.isArray(model.pairs?.[row]) ? model.pairs[row][column] : null) })),
    })),
  }, 'standard', PUBLIC_STANDARD_MATCHUPS_HTML_LIMIT);
  return parsed && { ...parsed, truncated: model.truncated === true };
}
