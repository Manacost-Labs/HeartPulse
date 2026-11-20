/**
 * The one indexing threshold of the site (docs/specs/seo-entity-indexing.md,
 * «Индексация: единый порог»). A page is either `index` + in the sitemap +
 * self-canonical, or `noindex` + outside the sitemap. Whether a templated page
 * crosses the line is decided here and nowhere else: the page's meta robots and
 * the sitemap projection both import these functions.
 */
/** Own words of a page's main content, without menu, footer and other shared chrome. */
export const INDEX_MIN_OWN_WORDS = 150;

/** Own facts (numbers and named values the page states about its entity), without menu and footer. */
export const INDEX_MIN_OWN_FACTS = 10;

/**
 * Sample size below which a templated statistics page is noise: the one source
 * of the number. Archetype pilot value: it keeps about a third of the Standard
 * catalog; tune it from Search Console coverage, here and nowhere else.
 * `constructedArchetypeIndexing.ts` reads it (its `INDEXABLE_ARCHETYPE_MIN_GAMES`
 * and `INDEXABLE_WILD_ARCHETYPE_MIN_GAMES` are these values under the readers'
 * names) and decides with `meetsSampleThreshold`.
 */
export const INDEX_MIN_SAMPLE_GAMES = {
  archetype: 1000,
  /**
   * Wild archetypes: the Wild sample is thinner (three of four archetypes have
   * fewer than 500 games), so a Wild page needs five times the Standard one.
   */
  wildArchetype: 5000,
} as const;

export type IndexContentFacts = {
  /** Words of the page's own content. */
  ownWords: number;
  /** Own facts the page states about its entity. */
  ownFacts: number;
};

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The content threshold: at least 150 own words or at least 10 own facts. */
export function meetsContentThreshold(content: IndexContentFacts): boolean {
  return count(content.ownWords) >= INDEX_MIN_OWN_WORDS || count(content.ownFacts) >= INDEX_MIN_OWN_FACTS;
}

/** The sample threshold of a template: `games` played against the template's minimum. */
export function meetsSampleThreshold(games: number | null | undefined, minGames: number): boolean {
  return typeof games === 'number' && Number.isFinite(games) && games >= minGames;
}

export type IndexThresholdFacts = {
  /** Games in the sample behind the page. `null`/`undefined` is an empty sample. */
  games: number | null | undefined;
  /** The template's minimum sample (`INDEX_MIN_SAMPLE_GAMES`). */
  minGames: number;
};

/**
 * The line a visitor sees on a page below the threshold, or `null` when the page
 * is indexable. The data-freshness line of the page prints it.
 */
export function indexThresholdNotice(facts: IndexThresholdFacts): string | null {
  if (meetsSampleThreshold(facts.games, facts.minGames)) return null;
  const games = count(facts.games ?? 0);
  return `Мало данных: ${games} игр из нужных ${count(facts.minGames)}, страница не индексируется до набора выборки`;
}
