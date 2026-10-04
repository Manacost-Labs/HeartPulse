type CardIdentityFields = { card_id?: unknown; cardId?: unknown; id?: unknown; dbf?: unknown; dbfId?: unknown };

/**
 * Selects the stable image identity shared by every constructed-card view.
 * Canonical IDs resolve HearthstoneJSON renders that may not yet exist in
 * Blizzard's DBF catalog; DBF remains a compatibility fallback for old rows.
 * A `blizzard:<DBF>` ID (a card revealed before HearthstoneJSON names it)
 * resolves to that DBF, which the image pipeline renders from Blizzard; a
 * row whose DBF disagrees keeps its own third-party render.
 */
export function constructedCardImageIdentity(card: CardIdentityFields | null | undefined): string | number | null {
  const cardId = String(card?.card_id ?? card?.cardId ?? card?.id ?? '').trim();
  const blizzardDbf = /^blizzard:([1-9][0-9]{0,18})$/.exec(cardId)?.[1];
  if (blizzardDbf && String(card?.dbf ?? card?.dbfId ?? blizzardDbf) === blizzardDbf) return blizzardDbf;
  if (cardId) return cardId;
  const dbfId = Number(card?.dbf ?? card?.dbfId);
  return Number.isInteger(dbfId) && dbfId > 0 ? dbfId : null;
}
