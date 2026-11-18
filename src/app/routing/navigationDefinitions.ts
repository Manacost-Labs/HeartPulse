import {
  AdminIcon, ApiIcon, ArchetypesIcon, ArenaTierIcon, ArticlesIcon, CardsIcon, ClassesIcon, ContestsIcon, CosmeticsIcon,
  DeckBuilderIcon, FaqIcon, FunDecksIcon, GalleryIcon, GuidesArchiveIcon, HeroesIcon, HomeIcon, LeaderboardsIcon,
  LegendariesIcon, LibraryIcon, MatchupsIcon, MetaIcon, PatchNotesIcon, PodiumIcon, PrivacyIcon, StrategiesIcon,
  StreamersIcon, TermsIcon, TierBuilderIcon, ViciousGoldIcon, type MenuIcon,
} from '../shell/menuIcons';
import { NAVIGATION_DATA } from './navigationData';

/** One icon per menu item, none repeated (tests/routes.test.ts);  labels, paths and groups live in `navigationData.ts`. */
const NAVIGATION_ICONS: Record<(typeof NAVIGATION_DATA)[number]['id'], MenuIcon> = {
  'home': HomeIcon,
  'articles': ArticlesIcon,
  'faq': FaqIcon,
  'developer-api': ApiIcon,
  'privacy': PrivacyIcon,
  'terms': TermsIcon,
  'leaderboards': LeaderboardsIcon,
  'gallery': GalleryIcon,
  'cosmetics': CosmeticsIcon,
  'guides-archive': GuidesArchiveIcon,
  'contests': ContestsIcon,
  'streamers': StreamersIcon,
  'standard-matchups': MatchupsIcon,
  'standard-meta': MetaIcon,
  'fun-decks': FunDecksIcon,
  'constructed-archetypes': ArchetypesIcon,
  'standard-vicious-gold': ViciousGoldIcon,
  'standard-cards': CardsIcon,
  'patch-notes': PatchNotesIcon,
  'winrates': ClassesIcon,
  'tierlist': ArenaTierIcon,
  'legendaries': LegendariesIcon,
  'bg-heroes': HeroesIcon,
  'bg-library': LibraryIcon,
  'bg-tier-list': PodiumIcon,
  'bg-strategies': StrategiesIcon,
  'deck-builder': DeckBuilderIcon,
  'bg-tier-builder': TierBuilderIcon,
  'admin-panel': AdminIcon,
};

type WithIcon<T> = T extends unknown ? T & { readonly icon: MenuIcon } : never;

export const NAVIGATION_ROUTES: readonly WithIcon<(typeof NAVIGATION_DATA)[number]>[] = NAVIGATION_DATA.map(
  route => ({ ...route, icon: NAVIGATION_ICONS[route.id] }),
);
