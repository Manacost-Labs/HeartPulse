import type { PublicViciousGold } from '../../../shared/viciousGoldPublicContract';
import type { ViciousGoldPayload } from './viciousGoldModel';

/**
 * The open frame (#656) in the report's shape, for the same components: its classes and archetypes in their neutral
 * order with no share, the rank brackets with no rows, no games, threshold or builds. A view given it with `locked`
 * shows a lock in the place of every closed value.
 */
export function lockedPayload(open: PublicViciousGold): ViciousGoldPayload {
  return {
    title: open.title,
    format: open.format,
    games: 0,
    source: open.source,
    sourceUrl: open.sourceUrl,
    updatedAt: open.updatedAt,
    timeRanges: open.timeRanges,
    minimumDeckFrequency: 0,
    classDistribution: open.classes.map(item => ({ ...item, frequency: 0 })),
    deckDistribution: open.archetypes.map(item => ({ ...item, frequency: 0, build: null })),
    tierList: open.rankBrackets.map(section => ({ ...section, decks: [] })),
    buildCoverage: { found: 0, total: 0 },
  };
}
