import {
  parsePublicStandardMatchups, PUBLIC_STANDARD_MATCHUPS_HTML_LIMIT, PUBLIC_STANDARD_MATCHUPS_PATH,
  type PublicStandardMatchups, type StandardMatchupsFormat,
} from '@/src/modules/standardMatchups/public';

/** Express path of the open general slice of a format. */
export const standardMatchupsPath = (format: StandardMatchupsFormat) => `${PUBLIC_STANDARD_MATCHUPS_PATH}?format=${format}`;
/** Express path of the open general slice of Standard. */
export const standardMatchupsPublicPath = standardMatchupsPath('standard');

/**
 * The open slice of a format for the server HTML, re-checked field by field (a paid or unlisted field of the
 * answer is not copied) and cut to the most played archetypes. `null` for any failure, and for the slice of
 * another format.
 */
export function loadStandardMatchupsSeed(raw: unknown, format: StandardMatchupsFormat = 'standard'): PublicStandardMatchups | null {
  return parsePublicStandardMatchups(raw, format, PUBLIC_STANDARD_MATCHUPS_HTML_LIMIT);
}
