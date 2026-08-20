export const PUBLIC_CARD_IMAGE_CDN_ORIGIN = 'https://cdn.hearthpulse.net';

export type CardImageDeliveryConfig = {
  enabled: boolean;
  origin: string;
};

const CARD_IMAGE_PATH_PREFIX = '/api/card-image/';

function normalizedCardImageCdnOrigin(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:'
      || url.origin !== PUBLIC_CARD_IMAGE_CDN_ORIGIN
      || url.pathname !== '/'
      || url.search
      || url.hash
      || url.username
      || url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Moves a same-origin card-image path to the approved CDN when delivery is
 * enabled. Invalid configuration and unrelated paths fail closed to origin.
 */
export function resolveCardImageDeliveryUrl(
  value: unknown,
  config: CardImageDeliveryConfig,
): string {
  const raw = String(value ?? '').trim();
  if (!config.enabled || !raw.startsWith(CARD_IMAGE_PATH_PREFIX)) return raw;

  const origin = normalizedCardImageCdnOrigin(config.origin);
  return origin ? `${origin}${raw}` : raw;
}

/**
 * Converts an approved CDN card-image URL back to its same-origin path so UI
 * surfaces can retry without depending on the external delivery layer.
 */
export function resolveCardImageOriginUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;

  try {
    const url = new URL(raw);
    if (
      url.origin !== PUBLIC_CARD_IMAGE_CDN_ORIGIN
      || !url.pathname.startsWith(CARD_IMAGE_PATH_PREFIX)
    ) {
      return raw;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw;
  }
}
