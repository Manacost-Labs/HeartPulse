import {
  BookOpenText,
  ChartNoAxesCombined,
  CircleHelp,
  CircleUserRound,
  Crown,
  Gem,
  Gift,
  Grid3X3,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  LibraryBig,
  List,
  ListChecks,
  ListTree,
  Scroll,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { ApplicationRouteSurfaceDefinition } from './routeSurface';

export const NAVIGATION_ROUTES = [
  {
    id: 'home', label: 'Главная', icon: Home, path: '/', group: 'home', entitlement: null,
  },
  {
    id: 'articles', label: 'Статьи', icon: BookOpenText, path: '/articles', group: 'top', entitlement: null,
  },
  {
    id: 'faq', label: 'FAQ', icon: CircleHelp, path: '/faq', group: 'top', entitlement: null,
  },
  {
    id: 'developer-api', label: 'API', icon: CircleHelp, path: '/developers/api', group: 'footer', entitlement: null,
  },
  { id: 'privacy', label: 'Конфиденциальность', icon: CircleHelp, path: '/privacy', group: 'footer', entitlement: null },
  { id: 'terms', label: 'Условия использования', icon: CircleHelp, path: '/terms', group: 'footer', entitlement: null },
  {
    id: 'gallery', label: 'Галерея', icon: ImageIcon, path: '/gallery', group: 'misc', entitlement: null,
  },
  {
    id: 'cosmetics', label: 'Косметика', icon: Sparkles, path: '/cosmetics', group: 'misc', entitlement: null,
  },
  {
    id: 'guides-archive', label: 'Архив гайдов', icon: Scroll, path: '/guides-archive', group: 'misc', entitlement: 'guidesArchive',
  },
  {
    id: 'contests', label: 'Конкурсы', icon: Gift, path: '/contests', group: 'misc', entitlement: null,
  },
  {
    id: 'standard-matchups', label: 'Матчапы', icon: Swords, path: '/standard/matchups', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-meta', label: 'Мета', icon: ChartNoAxesCombined, path: '/standard/meta', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'fun-decks', label: 'Фан-колоды', icon: Gem, path: '/standard/fun-decks', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'constructed-archetypes', label: 'Архетипы', icon: ListTree, path: '/standard/archetypes', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-vicious-gold', label: 'Vicious Syndicate Gold', icon: Crown, path: '/standard/vicious-gold', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-cards', label: 'Карты', icon: LibraryBig, path: '/standard/cards', group: 'standard', entitlement: null,
  },
  {
    id: 'winrates', label: 'Классы', icon: Trophy, path: '/classes', group: 'arena', entitlement: 'arena',
  },
  {
    id: 'tierlist', label: 'Тир-лист', icon: ListChecks, path: '/tierlist', group: 'arena', entitlement: 'arena',
  },
  {
    id: 'legendaries', label: 'Легендарки', icon: Gem, path: '/legendaries', group: 'arena', entitlement: 'arena',
  },
  {
    id: 'bg-heroes', label: 'Герои', icon: CircleUserRound, path: '/heroes', group: 'bg-primary', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-library', label: 'Библиотека', icon: LibraryBig, path: '/library', group: 'bg-primary', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-tier-list', label: 'Тир-лист', icon: ListTree, path: '/battlegrounds/tier-list', group: 'bg-primary', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-strategies', label: 'Конструктор стратегий', icon: Grid3X3, path: '/battlegrounds/strategies', group: 'bg-builder', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-tier-builder', label: 'Конструктор тир-листов', icon: List, path: '/battlegrounds/tier-builder', group: 'bg-builder', entitlement: 'battlegrounds',
  },
  {
    id: 'admin-panel', label: 'Админ панель', icon: ShieldCheck, path: '/admin', group: 'admin', entitlement: null,
  },
] as const satisfies readonly Omit<ApplicationRouteSurfaceDefinition, 'loader' | 'preload'>[];

type NavigationDefinition = (typeof NAVIGATION_ROUTES)[number];
export function navigationDefinition<Id extends NavigationDefinition['id']>(id: Id) {
  const route = NAVIGATION_ROUTES.find((route): route is Extract<NavigationDefinition, { id: Id }> => route.id === id);
  if (!route) throw new Error(`Unknown navigation route: ${id}`);
  return route;
}
