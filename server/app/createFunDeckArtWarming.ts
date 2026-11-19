import { existsSync } from 'node:fs';
import { resolveDeckPayload } from '../deckBuilderRoutes.js';
import type { createDeckArtImages } from '../deckArtImages.js';
import { loadPublishedFunDecks, type PublicFunDecksDependencies } from '../adminFunDecksRoutes.js';
import { createFunDeckArtPrewarmer, type FunDeckArtPrewarmer } from '../funDeckArtPrewarmer.js';

type DeckResolver = Parameters<typeof resolveDeckPayload>[0];

type FunDeckArtWarmingInput = {
  deckArt: ReturnType<typeof createDeckArtImages>;
  deckBuilder: DeckResolver;
  /** Where the published fun decks come from, for the periodic warm-up. */
  funDecks: Pick<PublicFunDecksDependencies, 'loadFunDecks' | 'getDatabase' | 'onError'>;
  /** Off in tests and one-shot processes: no timer. */
  periodic: boolean;
};

/**
 * Wires the deck-art prewarmer to the real deck resolver and the shared image
 * cache. Tunables: FUN_DECK_PREWARM_ART_DELAY_MS (pause between images),
 * _TTL_MS (a warmed deck is not queued again), _INTERVAL_MS, _START_MS.
 */
export function createFunDeckArtWarming(input: FunDeckArtWarmingInput): FunDeckArtPrewarmer {
  const prewarmer = createFunDeckArtPrewarmer({
    resolveCardIds: async deck => {
      const format = deck.format.toLowerCase() === 'wild' ? 'wild' : 'standard';
      const resolved = await resolveDeckPayload(input.deckBuilder, deck.deckCode, format, deck.nearestArchetype || '');
      const sideboards = resolved.sideboards ?? [];
      return [
        ...resolved.cards.map(card => card.id),
        ...sideboards.flatMap(board => [board.keyCard?.id, ...board.cards.map(card => card.id)]),
      ].filter((id): id is string => Boolean(id));
    },
    isCached: (cardId, variant) => existsSync(input.deckArt.cachePath(cardId, variant)),
    ensure: input.deckArt.ensure,
    loadDecks: () => loadPublishedFunDecks(input.funDecks),
    delayMs: Number(process.env.FUN_DECK_PREWARM_ART_DELAY_MS || 250),
    warmTtlMs: Number(process.env.FUN_DECK_PREWARM_ART_TTL_MS || 6 * 60 * 60_000),
    intervalMs: Number(process.env.FUN_DECK_PREWARM_ART_INTERVAL_MS || 30 * 60_000),
    startDelayMs: Number(process.env.FUN_DECK_PREWARM_ART_START_MS || 60_000),
    onError: (error, subject) => console.warn(
      `[fun-decks] art prewarm failed for ${subject}:`,
      error instanceof Error ? error.message : error,
    ),
  });
  if (input.periodic) prewarmer.start();
  return prewarmer;
}
