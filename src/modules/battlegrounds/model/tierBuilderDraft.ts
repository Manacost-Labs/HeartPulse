import { createBuilderHistory, restoreTierPlacements } from './builderWorkbench';
import { TIER_BUILDER_TIERS } from './tierBuilder';

export type TierBuilderPlacement = Record<string, string[]>;

/** A saved draft read back against the current pool; unknown and repeated ids are dropped. */
export function readTierBuilderDraft(cardIds: string[], draft: unknown): TierBuilderPlacement {
  const restored = restoreTierPlacements(cardIds, draft);
  return Object.fromEntries(TIER_BUILDER_TIERS.map(tier => [tier.id, restored[tier.id] ?? []]));
}

/**
 * Undo history of placements. Entries are the draft read back against the pool,
 * so a restored step equals its own entry and pushes nothing new: a raw `{}`
 * from «Все в пул» used to differ from its restored form and lock undo on an
 * empty board.
 */
export function createTierBuilderHistory(cardIds: string[]) {
  const history = createBuilderHistory();
  return {
    commit: (placement: TierBuilderPlacement) => history.commit(readTierBuilderDraft(cardIds, placement)),
    canUndo: history.canUndo,
    undo(): TierBuilderPlacement | null {
      const previous = history.undo();
      return previous === null ? null : readTierBuilderDraft(cardIds, previous);
    },
  };
}

/**
 * Saved tier ids the current pool does not know. A source that failed or fell
 * back to bundled data (other ids) hides them for one visit; the draft keeps
 * them so they return once the source recovers.
 */
export function unresolvedTierBuilderDraft(cardIds: string[], draft: unknown): TierBuilderPlacement {
  const known = new Set(cardIds);
  const saved = draft && typeof draft === 'object' ? draft as Record<string, unknown> : {};
  const seen = new Set<string>();
  return Object.fromEntries(TIER_BUILDER_TIERS.map(tier => {
    const ids = Array.isArray(saved[tier.id]) ? saved[tier.id] as unknown[] : [];
    return [tier.id, ids.filter((id): id is string => typeof id === 'string' && !!id && id.length <= 200
      && !known.has(id) && !seen.has(id) && !!seen.add(id))];
  }).filter(([, ids]) => ids.length));
}

/** The classic draft shape, POOL included, so an older page bundle still reads it; `carried` ids stay in their tiers. */
export function tierBuilderDraft(cardIds: string[], placement: TierBuilderPlacement,
  carried: TierBuilderPlacement = {}): Record<string, string[]> {
  const draft = restoreTierPlacements(cardIds, placement);
  for (const [tier, ids] of Object.entries(carried)) {
    if (draft[tier] && tier !== 'POOL') draft[tier].push(...ids);
  }
  return draft;
}

export function placedTierBuilderCount(placement: TierBuilderPlacement): number {
  return TIER_BUILDER_TIERS.reduce((sum, tier) => sum + (placement[tier.id]?.length ?? 0), 0);
}
