// Compatibility facade; statistics query policy belongs to the card domain.
export {
  CONSTRUCTED_CARD_PERIOD_OPTIONS,
  constructedCardPeriodOptions,
  CONSTRUCTED_CARD_RANK_OPTIONS,
  constructedCardPeriodFromSearch,
  constructedCardPeriodLabel,
  constructedCardRankFromSearch,
  constructedCardRankLabel,
  constructedCardStatsFormatFromSearch,
  constructedCardStatsFormatLabel,
  constructedCardPeriodUrl,
  constructedCardStatsUrl
} from '../modules/constructedCards/public';
export type { ConstructedCardPeriod, ConstructedCardRank, ConstructedCardStatsFormat } from '../modules/constructedCards/public';
