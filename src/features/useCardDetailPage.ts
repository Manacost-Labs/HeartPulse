import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { htmlPlainText as plainText } from '../shared/text/htmlPlainText';
import { applyDocumentPageMeta } from '../shared/seo/publicUrlPolicy';
import { constructedCardDescription, constructedCardTitle } from '../../shared/entityPageTitles';
import { constructedCardPath } from '../modules/constructedCards/public';
import { publicResourceUrl } from '../publicResourceUrl';
import { CONSTRUCTED_SET_LABELS } from './constructedCardLabels';
import { constructedRarityLabel } from './constructedCardFilterOptions';
import { cardName, type CardFormat, type CardRecord } from './constructedCardRecord';
import { forgetPaidCardAnswers, onPaidCardAnswersForgotten } from '../modules/constructedCards/public';

// Hooks of the card page (`StandardCardDetail`), kept apart so the page stays within its size budget.

/** The document title and description of the card page: the same facts as the server title (`page.tsx`). */
export function useCardDocumentMeta(card: CardRecord | null, cardId: string, format: CardFormat) {
  useEffect(() => {
    if (!card) return;
    const name = cardName(card);
    const resolvedCardId = card.card_id || cardId;
    // The same facts as the server title (`page.tsx`), so loading the full record does not change the title a crawler rendered:
    // the seed carries the labels, the full record the codes.
    const facts = {
      name, id: resolvedCardId, format, rulesText: plainText(card.text?.ru || card.text?.en), classCode: card.class,
      set: card.card_set ? CONSTRUCTED_SET_LABELS[card.card_set] ?? card.card_set : null,
      rarity: card.rarity ? constructedRarityLabel(card.rarity) : null,
      type: card.card_type?.name_ru, mana: card.mana_cost, attack: card.attack, health: card.health, durability: card.durability,
    };
    void applyDocumentPageMeta({
      title: constructedCardTitle(facts),
      description: constructedCardDescription(facts),
      pathname: constructedCardPath(format, resolvedCardId),
      search: '',
      image: publicResourceUrl(card.images?.card),
    });
  }, [card, cardId, format]);
}

/**
 * Access not confirmed now (refused, being checked, unavailable), or a refusal or a guest answer of any card request:
 * every paid answer held in the page goes
 * (`constructedCards/paidAnswers`), the loaded card's paid numbers included (`forgetLoaded`), so a confirmed access
 * shows them only from a new answer of the server.
 */
export function useForgetPaidWithoutAccess(statsAccess: boolean, forgetLoaded: () => void) {
  const forget = useRef(forgetLoaded);
  useEffect(() => { forget.current = forgetLoaded; });
  useEffect(() => {
    if (statsAccess) return;
    forgetPaidCardAnswers({ sync: false });
  }, [statsAccess]);
  // Any refusal or guest answer anywhere (a prefetch, another card, the catalog list) drops the page's paid numbers in
  // the same frame.
  useEffect(() => onPaidCardAnswersForgotten(sync => { if (sync) flushSync(() => forget.current()); else forget.current(); }), []);
}
