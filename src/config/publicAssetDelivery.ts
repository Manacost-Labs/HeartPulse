import {
  PUBLIC_CARD_IMAGE_CDN_ORIGIN,
  resolveCardImageDeliveryUrl,
  resolveCardImageOriginUrl,
  type CardImageDeliveryConfig,
} from '../../shared/publicAssetDelivery';

type RuntimeCardImageCdnConfig = {
  enabled?: unknown;
  origin?: unknown;
};

type ArenaRuntimeConfig = {
  cardImageCdn?: RuntimeCardImageCdnConfig;
};

declare global {
  interface Window {
    __ARENA_RUNTIME_CONFIG__?: ArenaRuntimeConfig;
  }
}

type CardImageElement = {
  currentSrc: string;
  src: string;
  removeAttribute(name: string): void;
};

function runtimeCardImageDeliveryConfig(): CardImageDeliveryConfig {
  const runtimeConfig = typeof window === 'undefined'
    ? undefined
    : window.__ARENA_RUNTIME_CONFIG__?.cardImageCdn;

  return {
    enabled: runtimeConfig?.enabled === true,
    origin: typeof runtimeConfig?.origin === 'string'
      ? runtimeConfig.origin
      : PUBLIC_CARD_IMAGE_CDN_ORIGIN,
  };
}

/**
 * Resolves card images through the runtime-selected delivery layer. Reading the
 * configuration for every URL keeps emergency rollback independent of a build.
 */
export function cardImageDeliveryUrl(value: unknown): string {
  return resolveCardImageDeliveryUrl(value, runtimeCardImageDeliveryConfig());
}

/** Returns the same-origin URL for downloads and CDN retry handling. */
export function cardImageOriginUrl(value: unknown): string {
  return resolveCardImageOriginUrl(value);
}

/**
 * Retries a failed CDN image from the application origin exactly once. The
 * srcset removal prevents the browser from immediately selecting the failed
 * CDN candidate again.
 */
export function fallbackCardImageElementToOrigin(element: CardImageElement): boolean {
  const current = String(element.currentSrc || element.src || '').trim();
  const originUrl = cardImageOriginUrl(current);
  if (!originUrl || originUrl === current || element.src === originUrl) return false;
  element.removeAttribute('srcset');
  element.src = originUrl;
  return true;
}

export function fallbackCardImageToOrigin(event: { currentTarget: CardImageElement }): void {
  fallbackCardImageElementToOrigin(event.currentTarget);
}
