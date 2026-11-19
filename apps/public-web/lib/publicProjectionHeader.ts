export const PUBLIC_BG_PROJECTION_HEADER = 'x-hearthpulse-bg-public-projection';
/** Related cards of a library card: a header of its own, so a long list never costs the card its open facts. */
export const PUBLIC_BG_RELATED_HEADER = 'x-hearthpulse-bg-public-related';
export const PUBLIC_CARD_PROJECTION_HEADER = 'x-hearthpulse-card-public-projection';
export const MISSING_PUBLIC_PROJECTION = 'missing';

const PREFIX = 'v1:';
const MAX_HEADER_LENGTH = 4096;

/**
 * Carries the anonymous projection that Proxy read from Express to the page,
 * so one request reads it once. Null when it does not fit a request header.
 */
export function encodePublicProjection(value: unknown): string | null {
  const encoded = `${PREFIX}${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
  return encoded.length <= MAX_HEADER_LENGTH ? encoded : null;
}

export function decodePublicProjection(value: string): unknown {
  if (value.length > MAX_HEADER_LENGTH || !value.startsWith(PREFIX)
    || !/^[A-Za-z0-9_-]+$/.test(value.slice(PREFIX.length))) {
    throw new Error('Invalid public projection header');
  }
  return JSON.parse(Buffer.from(value.slice(PREFIX.length), 'base64url').toString('utf8'));
}

/** The longest prefix of `items` that fits a request header (possibly none): navigation, not content to fail on. */
export function encodePublicProjectionList(items: readonly unknown[]): string | null {
  for (let count = items.length; count > 0; count -= 1) {
    const encoded = encodePublicProjection(items.slice(0, count));
    if (encoded) return encoded;
  }
  return null;
}
