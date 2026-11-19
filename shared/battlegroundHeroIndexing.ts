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
  /** Name of the hero power: a fact the page prints and the ranking row carries. */
  heroPowerName?: string | null;
};

const present = (value: unknown): number => value !== null && value !== undefined && value !== '' ? 1 : 0;

function modeFactCount(mode: HeroIndexingModeFacts | null | undefined): number {
  if (!mode) return 0;
  return present(mode.tier) + present(mode.avgPlacement) + present(mode.top4Rate) + present(mode.pickRate)
    + present(mode.games) + present(mode.bestComposition) + mode.keyMinions.length + present(mode.rank);
}

/** The hero's own facts: its name, its hero power and every open figure of the modes the page prints. */
export function countHeroOwnFacts(facts: HeroIndexingFacts): number {
  const figures = modeFactCount(facts.solo) + modeFactCount(facts.duos);
  return figures > 0 ? figures + 1 + present(facts.heroPowerName) : 0;
}

/**
 * Whether a hero page is indexable. Both modes must be rated first: a hero seen in one mode only is a
 * thin page however many figures that mode carries (a full build and three minions must not make up for
 * the missing mode). Then the open facts must reach the content threshold. The ten facts of a typical
 * hero (name, hero power and the core figures of both modes) leave a margin of one: losing one source
 * field does not turn the whole segment to `noindex`.
 */
export function isIndexableBattlegroundHero(facts: HeroIndexingFacts): boolean {
  if (!facts.solo || !facts.duos) return false;
  return meetsContentThreshold({ ownWords: 0, ownFacts: countHeroOwnFacts(facts) });
}
