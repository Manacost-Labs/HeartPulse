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
