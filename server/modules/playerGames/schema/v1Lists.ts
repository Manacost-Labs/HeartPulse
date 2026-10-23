import { isObject } from './fields.js';

type Payload = Record<string, unknown>;

const LIST_CARD_ID = /^[A-Za-z0-9_]{1,64}$/;
const MULLIGAN_STAGES = ['initial', 'kept', 'replaced', 'after'];

/** A v1 card list as plain card ids: entries may be ids or `{ cardId }`; anything else is dropped. */
function cardIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map(item => (typeof item === 'string' ? item : isObject(item) ? item.cardId : null))
    .filter((item): item is string => typeof item === 'string' && LIST_CARD_ID.test(item));
}

/**
 * The v1 lists other features read, kept next to the version 2 statistics
 * fields. Only card ids survive, so no name or note nested in them is stored.
 */
export function v1Lists(payload: Payload): Payload {
  const lists: Payload = {};
  if (isObject(payload.playerMulligan)) {
    const mulligan = payload.playerMulligan;
    lists.playerMulligan = Object.fromEntries(MULLIGAN_STAGES.flatMap(stage => {
      const ids = cardIds(mulligan[stage]);
      return ids ? [[stage, ids]] : [];
    }));
  }
  if (isObject(payload.opponentDeck)) {
    const observed = cardIds(payload.opponentDeck.observedCards);
    lists.opponentDeck = observed ? { observedCards: observed } : {};
  }
  for (const field of ['finalDeckCardIds', 'offeredCardIds']) {
    const ids = cardIds(payload[field]);
    if (ids) lists[field] = ids;
  }
  return lists;
}
