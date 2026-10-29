/**
 * The names of the card statistics the card list shows: the hover summary, the
 * sort menu, the gallery tile, the table and the history switch take their words
 * from here, so one metric has one Russian name on the whole site. The card
 * page adds three metrics the list never shows and a sentence under every
 * value in `constructedCardDetailMetrics`, which only it loads.
 *
 * `shortLabel` is the same name where a caption has little room: a gallery
 * tile, a table column header, the history switch and the sort menu, whose
 * phone-wide trigger cut «Винрейт колод с картой» to «Винрейт колод с ка…».
 */
export type ConstructedCardMetricId =
  | 'deckPopularity'
  | 'deckWinrate'
  | 'winrateWhenPlayed'
  | 'winrateWhenDrawn'
  | 'keepPercentage'
  | 'timesPlayed';

export const CONSTRUCTED_CARD_METRICS: Record<ConstructedCardMetricId, { label: string; shortLabel?: string }> = {
  deckPopularity: { label: 'Популярность' },
  deckWinrate: { label: 'Винрейт колод с картой', shortLabel: 'Винрейт колод' },
  winrateWhenPlayed: { label: 'Винрейт, если сыграна', shortLabel: 'Если сыграна' },
  winrateWhenDrawn: { label: 'Винрейт, если взята' },
  keepPercentage: { label: 'Оставляют в муллигане' },
  timesPlayed: { label: 'Партий в выборке', shortLabel: 'Партий' },
};

/** The name for a tight caption: the short form where the metric has one. */
export function constructedCardMetricCaption(id: ConstructedCardMetricId): string {
  const { label, shortLabel } = CONSTRUCTED_CARD_METRICS[id];
  return shortLabel ?? label;
}
