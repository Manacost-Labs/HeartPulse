/**
 * Pages that have a walkthrough, without the step copy: the header renders the
 * «Как пользоваться страницей» button from this list during server rendering,
 * and the tour definitions load only when a tour starts. A registry test keeps
 * it equal to `PAGE_TOURS` in pageTourDefinitions.ts.
 */
export const PAGE_TOUR_ROUTES: ReadonlyArray<{ id: string; paths: readonly string[] }> = [
  { id: 'profile', paths: ['/profile'] },
  { id: 'standard-matchups', paths: ['/standard/matchups'] },
  { id: 'standard-meta', paths: ['/standard/meta'] },
  { id: 'constructed-archetypes', paths: ['/standard/archetypes'] },
  { id: 'constructed-archetype-detail', paths: ['/standard/archetypes/:format/:slug', '/standard/meta/:format/:slug'] },
  { id: 'standard-fun-decks', paths: ['/standard/fun-decks'] },
  { id: 'standard-vicious-gold', paths: ['/standard/vicious-gold'] },
  { id: 'standard-cards', paths: ['/standard/cards', '/standard/cards/:format'] },
  { id: 'standard-patches', paths: ['/standard/patches'] },
  { id: 'standard-card-detail', paths: ['/standard/cards/:format/:cardId'] },
  { id: 'arena-classes', paths: ['/classes'] },
  { id: 'arena-tier-list', paths: ['/tierlist'] },
  { id: 'arena-legendaries', paths: ['/legendaries'] },
  { id: 'battlegrounds-heroes', paths: ['/heroes'] },
  { id: 'battlegrounds-hero-detail', paths: ['/heroes/:dbfId'] },
  { id: 'battlegrounds-library', paths: ['/library', '/library/:section', '/library/archive/:section'] },
  { id: 'battlegrounds-library-detail', paths: ['/library/:kind/:slug', '/library/archive/:kind/:slug'] },
  { id: 'battlegrounds-strategy-builder', paths: ['/battlegrounds/strategies'] },
  { id: 'battlegrounds-tier-builder', paths: ['/battlegrounds/tier-builder'] },
  { id: 'battlegrounds-tier-list', paths: ['/battlegrounds/tier-list'] },
];
