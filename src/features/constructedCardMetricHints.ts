import type { ConstructedCardMetricId } from './constructedCardMetrics';

/**
 * One plain sentence per metric on what the number counts. The card page
 * prints it under the value, so a reader never depends on a tooltip. Kept apart
 * from the names so the card list and the deck builder, which need only names,
 * do not load it.
 */
export const CONSTRUCTED_CARD_METRIC_HINTS: Record<ConstructedCardMetricId, string> = {
  deckPopularity: 'В скольких колодах выборки есть карта',
  deckWinrate: 'Доля побед колод, в которых есть карта',
  winrateWhenPlayed: 'Доля побед в партиях, где карту разыграли',
  winrateWhenDrawn: 'Доля побед, когда карта пришла в руку',
  keepPercentage: 'Как часто карту не меняют в стартовой руке',
  openingHandWinrate: 'Доля побед, когда карта была в стартовой руке',
  averageTurnPlayed: 'Средний ход, на котором карту играют',
  averageCopies: 'Среднее число копий в колодах с картой',
  timesPlayed: 'Объём выборки',
};
