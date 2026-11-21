import { lazy } from 'react';
export { constructedCardPath, constructedCardRoute } from './model/cardRoute';
export type { CardFormat, CardRoute } from './model/cardRoute';
export { ConstructedCardIdentity } from './ui/ConstructedCardIdentity';
export { constructedCardHorizontalArtwork } from './model/horizontalArtwork';
export { fallbackConstructedCardArtwork } from './ui/horizontalArtworkFallback';
export type { ConstructedCardIdentityProps } from './ui/ConstructedCardIdentity';
export type { PublicCardDeckSeed, PublicCardDetailSeed, PublicCardOpenStats, PublicCardSeed } from './model/publicCardSeed';
export { OPEN_STATISTICS_SLICE, DEFAULT_CONSTRUCTED_CARD_RANK, CONSTRUCTED_CARD_PERIOD_OPTIONS, constructedCardPeriodOptions, CONSTRUCTED_CARD_RANK_OPTIONS, constructedCardPeriodFromSearch, constructedCardPeriodLabel, constructedCardRankFromSearch, constructedCardRankLabel, constructedCardStatsFormatFromSearch, constructedCardStatsFormatLabel, constructedCardPeriodUrl, constructedCardStatsUrl } from './model/statisticsContext';
export type { ConstructedCardPeriod, ConstructedCardRank, ConstructedCardStatsFormat } from './model/statisticsContext';
export { useConstructedCardPeriod, useConstructedCardRank } from './useStatisticsContext';
export { constructedCardCatalogUrl, EMPTY_CONSTRUCTED_CARD_FILTERS } from './model/catalogQuery';
export type { ConstructedCardCatalogFilters, ConstructedCardCatalogContext, ConstructedCardFormat } from './model/catalogQuery';
export { catalogLocation, catalogLocationUrl } from './model/catalogLocation';
export type { CatalogLocation } from './model/catalogLocation';
export type { CardCatalogPayload, PublicCatalogCard, PublicCardCatalogSeed } from './model/catalogPayload';
export { useCatalogLocation } from './useCatalogLocation';
export { useCatalogData } from './useCatalogData';
export { forgetPaidCardAnswers, holdPaidCardAnswers, onPaidCardAnswersForgotten, paidCardAnswersGeneration, refusesViewer } from './paidAnswers';
export { useCatalogIntentWarm } from './useCatalogIntentWarm';
export { ConstructedCardsBanner } from './ui/ConstructedCardsBanner';
export { constructedFacetValues } from './model/filterFacets';
export { ConstructedCardTile } from './ui/ConstructedCardTile';
/** Loaded on demand: only card pages with a choice mechanic render it, so catalog pages stay lean. */
export const CardChoicesSection = lazy(() => import('./ui/CardChoicesSection'));
export { cardChoiceKindOf } from './model/cardChoices';
export { isAssembleCard } from './model/cardAssemble';
export type { CardChoiceKind, CardChoicesData } from './model/cardChoices';
/**
 * The «Сборка» tool page: loaded on demand like the section (its chunk carries the card choices and
 * the section), so no card or catalog route bundles it. The route brings the stylesheets itself.
 */
export { AssembleTool } from './ui/AssembleToolLazy';
export type { AssembleToolProps } from './ui/AssembleTool';
export {
  assembleCardIdFromSearch, assembleFormatFromSearch, assemblePageHref, isAssembleCardData, isAssembleList, resolveAssembleCard,
} from './model/assemblePage';
export type { CardAssembleData, CardAssembleListData } from './model/cardAssemble';
