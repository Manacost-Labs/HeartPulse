import { resolve } from 'node:path';
import type {
  CardImageResult,
  CardImageRouterDependencies,
  CardImageVariant,
} from '../cardImageRoutes.js';

type CardImageDependencyInput = {
  cacheDir: string;
  ensureCardImage: (
    cardId: string,
    variant: Exclude<CardImageVariant, 'tile'>,
  ) => Promise<CardImageResult>;
  ensureCardTile: (cardId: string) => Promise<CardImageResult>;
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
  return {
    ensureImage: (cardId, variant) => variant === 'tile'
      ? input.ensureCardTile(cardId)
      : input.ensureCardImage(cardId, variant),
    isAllowedPath: path => {
      const candidate = resolve(path);
      return candidate === cacheRoot || candidate.startsWith(`${cacheRoot}/`);
    },
    immutableCacheHeader: input.immutableCacheHeader,
    onError: input.onError,
  };
}
