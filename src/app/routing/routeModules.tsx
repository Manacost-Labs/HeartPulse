import React from 'react';
import {
  loadBattlegroundsModule,
  loadBgLibraryModule,
  loadConstructedArchetypesModule,
  loadContestsModule,
  loadCosmeticsModule,
  loadDeferredRoutesModule,
  loadDeveloperApiModule,
  loadFAQPageModule,
  loadLegalPageModule,
  loadFunDecksModule,
  loadGalleryModule,
  loadGuidesArchiveModule,
  loadHomeModule,
  loadStandardCardsModule,
  loadStandardMatchupsModule,
  loadStandardMetaModule,
  loadViciousSyndicateGoldModule,
} from './routeManifest';

export function prefetchInitialStandardCardCatalog(hasFullAccess: boolean): Promise<void> {
  return loadStandardCardsModule().then(module => (
    module.prefetchInitialConstructedCardCatalog('standard', hasFullAccess)
  ));
}

export const LazyHomeTab = React.lazy(loadHomeModule);
export const LazyLegalPage = React.lazy(loadLegalPageModule);
export const LazyFAQPage = React.lazy(loadFAQPageModule);
export const LazyDeveloperApiPage = React.lazy(() => loadDeveloperApiModule()
  .then(module => ({ default: module.DeveloperApiPage })));
export const LazyAccountRoute = React.lazy(() => import('../../modules/browserIdentity/public'));
export const LazyNotFoundPage = React.lazy(() => import('../../features/NotFoundPageRoute'));
export const LazyWinrates = React.lazy(() => loadDeferredRoutesModule()
  .then(module => ({ default: module.Winrates })));
export const LazyTierList = React.lazy(() => loadDeferredRoutesModule()
  .then(module => ({ default: module.TierList })));
export const LazyLegendaries = React.lazy(() => loadDeferredRoutesModule()
  .then(module => ({ default: module.Legendaries })));
export const LazyArticlesTab = React.lazy(() => Promise.all([
  import('../../modules/articles/public'),
  import('../../features/DeferredRoutes.css'),
]).then(([module]) => ({ default: module.ArticlesTab })));
export const LazyGalleryTab = React.lazy(loadGalleryModule);
export const LazyBgLibrary = React.lazy(loadBgLibraryModule);
export const LazyGuidesArchive = React.lazy(loadGuidesArchiveModule);
export const LazyCosmetics = React.lazy(loadCosmeticsModule);
export const LazyStandardMatchupsPage = React.lazy(loadStandardMatchupsModule);
export const LazyStandardMetaPage = React.lazy(loadStandardMetaModule);
export const LazyConstructedArchetypesPage = React.lazy(loadConstructedArchetypesModule);
export const LazyViciousSyndicateGoldPage = React.lazy(loadViciousSyndicateGoldModule);
export const LazyStandardCardsPage = React.lazy(loadStandardCardsModule);
export const LazyFunDecksPage = React.lazy(loadFunDecksModule);
export const LazyContestsPage = React.lazy(() => loadContestsModule()
  .then(module => ({ default: module.ContestsPage })));
export const LazyContestAdminPanel = React.lazy(() => loadContestsModule()
  .then(module => ({ default: module.ContestAdminPanel })));
export const LazyBattlegroundHeroesRoute = React.lazy(() => loadBattlegroundsModule()
  .then(module => ({ default: module.BattlegroundHeroesRoute })));
export const LazyBattlegroundTierList = React.lazy(() => loadBattlegroundsModule()
  .then(module => ({ default: module.BattlegroundTierList })));
export const LazyBattlegroundStrategyBuilderEmbed = React.lazy(() => loadBattlegroundsModule()
  .then(module => ({ default: module.BattlegroundStrategyBuilderEmbed })));
export const LazyBattlegroundTierBuilderEmbed = React.lazy(() => loadBattlegroundsModule()
  .then(module => ({ default: module.BattlegroundTierBuilderEmbed })));
