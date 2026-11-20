import type { AssembleCard, CardAssembleData, CardAssembleListData } from './cardAssemble';

export type AssembleListCard = CardAssembleListData['cards'][number];
export type AssembleFormat = CardAssembleData['format'];

const PAGE_PATH = '/standard/assemble/';
const CARD_ID = /^[A-Za-z0-9_]{2,80}$/;

/** `?format=wild` is Wild, anything else is Standard. */
export function assembleFormatFromSearch(value: string | null | undefined): AssembleFormat {
  return value === 'wild' ? 'wild' : 'standard';
}

/** A card id fit for the address and for the API path, or `null`. */
export function assembleCardIdFromSearch(value: string | null | undefined): string | null {
  return typeof value === 'string' && CARD_ID.test(value) ? value : null;
}

/** The address of the tool: a chosen card, in a format. Standard leaves no `format` parameter. */
export function assemblePageHref(format: AssembleFormat, cardId: string | null): string {
  const params = new URLSearchParams();
  if (cardId) params.set('card', cardId);
  if (format === 'wild') params.set('format', 'wild');
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

/**
 * The card the page shows: the requested one when the list has it; otherwise the neutral card
 * with data (F3TCH3R), then the first card with data. A list without any data shows its first card.
 * Never `null` for a non-empty list, so a wrong `?card=` is a page, not a 404.
 */
export function resolveAssembleCard(cards: readonly AssembleListCard[], requested: string | null): AssembleListCard | null {
  const asked = requested ? cards.find(item => item.card.cardId === requested) : undefined;
  if (asked) return asked;
  const withData = cards.filter(item => item.state === 'ok');
  return withData.find(item => item.card.cardClass === 'NEUTRAL') ?? withData[0] ?? cards[0] ?? null;
}

/** Label of the class line of a card tile. */
export function assembleClassLabel(card: Pick<AssembleCard, 'cardClass'>): string {
  return CLASS_LABELS[card.cardClass ?? ''] ?? 'Нейтральная';
}

const CLASS_LABELS: Record<string, string> = {
  NEUTRAL: 'Нейтральная', DEATHKNIGHT: 'Рыцарь смерти', DEMONHUNTER: 'Охотник на демонов', DRUID: 'Друид', HUNTER: 'Охотник',
  MAGE: 'Маг', PALADIN: 'Паладин', PRIEST: 'Жрец', ROGUE: 'Разбойник', SHAMAN: 'Шаман', WARLOCK: 'Чернокнижник', WARRIOR: 'Воин',
};

/** The two server reads of the page agree with the browser's: cheap shape guards for the JSON the Express proxy sent. */
export function isAssembleList(value: unknown, format: AssembleFormat): value is CardAssembleListData {
  const data = value as CardAssembleListData | null;
  return !!data && data.format === format && Array.isArray(data.cards) && data.cards.length > 0
    && data.cards.every(item => typeof item?.card?.cardId === 'string' && typeof item.state === 'string');
}

export function isAssembleCardData(value: unknown, format: AssembleFormat, cardId: string): value is CardAssembleData {
  const data = value as CardAssembleData | null;
  return !!data && data.format === format && data.cardId === cardId && Array.isArray(data.bases) && typeof data.state === 'string';
}
