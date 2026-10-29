import { CONSTRUCTED_CARD_METRICS as NAMES, type ConstructedCardMetricId } from './constructedCardMetrics';

export type ConstructedCardDetailMetricId = ConstructedCardMetricId | 'openingHandWinrate' | 'averageTurnPlayed' | 'averageCopies';

/**
 * The card page's metrics in reading order: the name, and one plain sentence on
 * what the number counts, printed under the value so a reader never depends on a
 * tooltip. Names the card list shares come from `constructedCardMetrics`; the
 * three the list never shows are named here. Kept apart so the card list and the
 * deck builder do not load the sentences.
 */
export const CONSTRUCTED_CARD_DETAIL_METRICS: ReadonlyArray<{ id: ConstructedCardDetailMetricId; label: string; hint: string }> = [
  { id: 'deckPopularity', label: NAMES.deckPopularity.label, hint: 'В скольких колодах выборки есть карта' },
  { id: 'deckWinrate', label: NAMES.deckWinrate.label, hint: 'Доля побед колод, в которых есть карта' },
  { id: 'winrateWhenPlayed', label: NAMES.winrateWhenPlayed.label, hint: 'Доля побед в партиях, где карту разыграли' },
  { id: 'winrateWhenDrawn', label: NAMES.winrateWhenDrawn.label, hint: 'Доля побед, когда карта пришла в руку' },
  { id: 'keepPercentage', label: NAMES.keepPercentage.label, hint: 'Как часто карту не меняют в стартовой руке' },
  { id: 'openingHandWinrate', label: 'Винрейт из стартовой руки', hint: 'Доля побед, когда карта была в стартовой руке' },
  { id: 'averageTurnPlayed', label: 'Обычно разыгрывают на ходу', hint: 'Средний ход, на котором карту играют' },
  { id: 'averageCopies', label: 'Копий в колоде', hint: 'Среднее число копий в колодах с картой' },
  { id: 'timesPlayed', label: NAMES.timesPlayed.label, hint: 'Объём выборки' },
];
