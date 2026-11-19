import { resolve } from 'node:path';
import type {
  CardImageResult,
  CardImageRouterDependencies,
  CardImageVariant,
} from '../cardImageRoutes.js';
import { createDeckArtImages, type DeckArtImageDependencies } from '../deckArtImages.js';

type CardImageDependencyInput = {
  cacheDir: string;
  ensureCardImage: (
    cardId: string,
    variant: Exclude<CardImageVariant, 'tile' | 'row' | 'portrait'>,
  ) => Promise<CardImageResult>;
  ensureCardTile: (cardId: string) => Promise<CardImageResult>;
  /** Sources of the deck-list art: the deck-builder row tile and the round portrait. */
  deckArt: Pick<DeckArtImageDependencies, 'catalogBaseUrl' | 'withSlot'>;
  immutableCacheHeader: string;
  onError: CardImageRouterDependencies['onError'];
};

/**
 * Builds the shared site/Public API image boundary in one place. Keeping the
 * cache-root check here prevents route registrations from drifting apart.
 */
export function createCardImageDependencies(
  input: CardImageDependencyInput,
): CardImageRouterDependencies {
  const cacheRoot = resolve(input.cacheDir);
  const deckArt = createDeckArtImages({ cacheDir: input.cacheDir, ...input.deckArt });
  return {
    ensureImage: (cardId, variant) => {
      if (variant === 'tile') return input.ensureCardTile(cardId);
      if (variant === 'row' || variant === 'portrait') return deckArt.ensure(cardId, variant);
      return input.ensureCardImage(cardId, variant);
    },
    isAllowedPath: path => {
      const candidate = resolve(path);
      return candidate === cacheRoot || candidate.startsWith(`${cacheRoot}/`);
    },
    immutableCacheHeader: input.immutableCacheHeader,
    onError: input.onError,
  };
}
