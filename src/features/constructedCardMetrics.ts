/**
 * The names of the card statistics. The card page, the hover summary in the
 * card list, the list's table and its sort menu take their words from here, so
 * one metric has one Russian name on the whole site. The sentence under each
 * value on the card page lives in `constructedCardMetricHints`.
 *
 * `shortLabel` is the same name where a caption has little room: a gallery
 * tile, a table column header and the sort menu, whose phone-wide trigger cut
 * «Винрейт колод с картой» to «Винрейт колод с ка…».
 */
export type ConstructedCardMetricId =
  | 'deckPopularity'
  | 'deckWinrate'
  | 'winrateWhenPlayed'
  | 'winrateWhenDrawn'
  | 'keepPercentage'
  | 'openingHandWinrate'
  | 'averageTurnPlayed'
  | 'averageCopies'
  | 'timesPlayed';

export const CONSTRUCTED_CARD_METRICS: Record<ConstructedCardMetricId, { label: string; shortLabel?: string }> = {
  deckPopularity: { label: 'Популярность' },
  deckWinrate: { label: 'Винрейт колод с картой', shortLabel: 'Винрейт колод' },
  winrateWhenPlayed: { label: 'Винрейт, если сыграна' },
  winrateWhenDrawn: { label: 'Винрейт, если взята' },
  keepPercentage: { label: 'Оставляют в муллигане' },
  openingHandWinrate: { label: 'Винрейт из стартовой руки' },
  averageTurnPlayed: { label: 'Обычно разыгрывают на ходу' },
  averageCopies: { label: 'Копий в колоде' },
  timesPlayed: { label: 'Партий в выборке' },
};

/** The name for a tight caption: the short form where the metric has one. */
export function constructedCardMetricCaption(id: ConstructedCardMetricId): string {
  const { label, shortLabel } = CONSTRUCTED_CARD_METRICS[id];
  return shortLabel ?? label;
}
