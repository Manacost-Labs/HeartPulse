/**
 * Which Battlegrounds hero pages are offered to search engines
 * (docs/specs/seo-entity-indexing.md, «Порог индексации»).
 *
 * One pure rule for every reader of it: the Next.js page puts it in its meta
 * robots and JSON-LD, the hero sitemap source of the Express server filters by
 * it. It counts the facts the open slice of the page states about the hero
 * (the hero's name and the figures of the base rating range in each mode) and
 * applies the site-wide threshold of `seoIndexThreshold.ts`.
 */
import { meetsContentThreshold } from './seoIndexThreshold.js';

/** The figures of one mode as far as the rule reads them. */
export type HeroIndexingModeFacts = {
  tier: string | null;
  avgPlacement: number | null;
  top4Rate: number | null;
  pickRate: number | null;
  games?: number | null;
  bestComposition: string | null;
  keyMinions: readonly string[];
  rank: number | null;
};

export type HeroIndexingFacts = {
  solo?: HeroIndexingModeFacts | null;
  duos?: HeroIndexingModeFacts | null;
};

const present = (value: unknown): number => value !== null && value !== undefined && value !== '' ? 1 : 0;

function modeFactCount(mode: HeroIndexingModeFacts | null | undefined): number {
  if (!mode) return 0;
  return present(mode.tier) + present(mode.avgPlacement) + present(mode.top4Rate) + present(mode.pickRate)
    + present(mode.games) + present(mode.bestComposition) + mode.keyMinions.length + present(mode.rank);
}

/** The hero's own facts: its name plus every open figure the page prints. */
export function countHeroOwnFacts(facts: HeroIndexingFacts): number {
  const figures = modeFactCount(facts.solo) + modeFactCount(facts.duos);
  return figures > 0 ? figures + 1 : 0;
}

/** Whether a hero page is indexable: it has open figures that reach the content threshold. */
export function isIndexableBattlegroundHero(facts: HeroIndexingFacts): boolean {
  return meetsContentThreshold({ ownWords: 0, ownFacts: countHeroOwnFacts(facts) });
}
