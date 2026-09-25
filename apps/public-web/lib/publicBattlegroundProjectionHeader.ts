export const PUBLIC_BG_PROJECTION_HEADER = 'x-hearthpulse-bg-public-projection';
export const MISSING_PUBLIC_BG_PROJECTION = 'missing';

const PREFIX = 'v1:';
const MAX_HEADER_LENGTH = 4096;

/** Carries only the sanitized anonymous projection between Proxy and a page. */
export function encodePublicBattlegroundProjection(value: unknown): string | null {
  const encoded = `${PREFIX}${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
  // A large header can exceed an upstream request limit; Proxy returns retryable 503.
  return encoded.length <= MAX_HEADER_LENGTH ? encoded : null;
}

export function decodePublicBattlegroundProjection(value: string): unknown {
  if (value.length > MAX_HEADER_LENGTH || !value.startsWith(PREFIX)
    || !/^[A-Za-z0-9_-]+$/.test(value.slice(PREFIX.length))) {
    throw new Error('Invalid public Battleground projection header');
  }
  return JSON.parse(Buffer.from(value.slice(PREFIX.length), 'base64url').toString('utf8'));
}
