type ConstructedCardImageOverride = {
  cardId: string;
  staleOfficialUrl: string;
  replacementUrl: string;
};

// Blizzard's localized render can lag behind a balance patch even after the
// card text API has changed. These entries are self-expiring: the replacement
// is used only while Blizzard returns the exact known stale render URL. As soon
// as Blizzard publishes a new URL, the official image is used again.
const IMAGE_OVERRIDES = new Map<number, ConstructedCardImageOverride>([
  [126663, {
    cardId: 'JAIL_733',
    staleOfficialUrl: 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/c1d2c0af640c1c3cb4a580021cbc662ecf8510e469a04c265eeca2831a5c70b0.png',
    replacementUrl: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/JAIL_733.png',
  }],
]);

export function resolveConstructedCardImageSourceUrl(
  dbfIdValue: unknown,
  officialUrlValue: unknown,
): string | null {
  const dbfId = Number(dbfIdValue);
  const officialUrl = String(officialUrlValue ?? '').trim();
  if (!Number.isInteger(dbfId) || dbfId <= 0 || !officialUrl) return officialUrl || null;

  const override = IMAGE_OVERRIDES.get(dbfId);
  if (!override || officialUrl !== override.staleOfficialUrl) return officialUrl;
  return override.replacementUrl;
}

export function constructedCardImageOverrideCardId(dbfIdValue: unknown): string | null {
  const dbfId = Number(dbfIdValue);
  return Number.isInteger(dbfId) && dbfId > 0
    ? IMAGE_OVERRIDES.get(dbfId)?.cardId ?? null
    : null;
}
