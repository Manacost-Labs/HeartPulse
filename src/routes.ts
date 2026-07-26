import {
  BookOpenText,
  ChartNoAxesCombined,
  CircleHelp,
  CircleUserRound,
  Crown,
  Gem,
  Gift,
  Grid3X3,
  LayoutGrid,
  Home,
  Image as ImageIcon,
  LibraryBig,
  List,
  ListChecks,
  ListTree,
  Scroll,
  ShieldCheck,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { ResolvedPublicUrlPolicy } from './seo/publicUrlPolicy';

export type RouteGroup = 'home' | 'top' | 'standard' | 'arena' | 'bg-primary' | 'bg-builder' | 'misc' | 'admin';
export type RouteEntitlement = 'arena' | 'battlegrounds' | 'standard' | 'contests' | 'guidesArchive' | 'arenaArticles' | 'battlegroundsArticles';

type RouteDefinition = {
  id: string;
  label: string;
  icon: LucideIcon;
  slug: string;
  group: RouteGroup;
  entitlement: RouteEntitlement | null;
  adminOnly?: boolean;
};

export const TABS = [
  {
    id: 'home', label: 'Главная', icon: Home, slug: '/', group: 'home', entitlement: null,
  },
  {
    id: 'articles', label: 'Статьи', icon: BookOpenText, slug: '/articles', group: 'top', entitlement: null,
  },
  {
    id: 'faq', label: 'FAQ', icon: CircleHelp, slug: '/faq', group: 'top', entitlement: null,
  },
  {
    id: 'gallery', label: 'Галерея', icon: ImageIcon, slug: '/gallery', group: 'misc', entitlement: null,
  },
  {
    id: 'guides-archive', label: 'Архив гайдов', icon: Scroll, slug: '/guides-archive', group: 'misc', entitlement: 'guidesArchive',
  },
  {
    id: 'contests', label: 'Конкурсы', icon: Gift, slug: '/contests', group: 'misc', entitlement: null,
  },
  {
    id: 'deck-builder',
    label: 'Конструктор колоды',
    icon: LayoutGrid,
    slug: '/deck-builder',
    group: 'misc',
    entitlement: null,
    adminOnly: true,
  },
  {
    id: 'archetypes',
    label: 'Архетипы',
    icon: ListTree,
    slug: '/archetypes',
    group: 'misc',
    entitlement: null,
    adminOnly: true,
  },
  {
    id: 'standard-matchups', label: 'Матчапы', icon: Swords, slug: '/standard/matchups', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-meta', label: 'Мета', icon: ChartNoAxesCombined, slug: '/standard/meta', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'fun-decks', label: 'Фан-колоды', icon: Gem, slug: '/standard/fun-decks', group: 'standard', entitlement: null,
  },
  {
    id: 'constructed-archetypes', label: 'Архетипы', icon: ListTree, slug: '/standard/archetypes', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-vicious-gold', label: 'Vicious Syndicate Gold', icon: Crown, slug: '/standard/vicious-gold', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-cards', label: 'Карты', icon: LibraryBig, slug: '/standard/cards', group: 'standard', entitlement: null,
  },
  {
    id: 'winrates', label: 'Классы', icon: Trophy, slug: '/classes', group: 'arena', entitlement: 'arena',
  },
  {
    id: 'tierlist', label: 'Тир-лист', icon: ListChecks, slug: '/tierlist', group: 'arena', entitlement: 'arena',
  },
  {
    id: 'legendaries', label: 'Легендарки', icon: Gem, slug: '/legendaries', group: 'arena', entitlement: 'arena',
  },
  {
    id: 'bg-heroes', label: 'Герои', icon: CircleUserRound, slug: '/heroes', group: 'bg-primary', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-library', label: 'Библиотека', icon: LibraryBig, slug: '/library', group: 'bg-primary', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-tier-list', label: 'Тир-лист', icon: ListTree, slug: '/battlegrounds/tier-list', group: 'bg-primary', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-strategies', label: 'Конструктор стратегий', icon: Grid3X3, slug: '/battlegrounds/strategies', group: 'bg-builder', entitlement: 'battlegrounds',
  },
  {
    id: 'bg-tier-builder', label: 'Конструктор тир-листов', icon: List, slug: '/battlegrounds/tier-builder', group: 'bg-builder', entitlement: 'battlegrounds',
  },
  {
    id: 'admin-panel', label: 'Админ панель', icon: ShieldCheck, slug: '/admin', group: 'admin', entitlement: null,
  },
] as const satisfies readonly RouteDefinition[];

export type TabId = (typeof TABS)[number]['id'];

const routesInGroup = (group: RouteGroup) => TABS.filter(route => route.group === group);

// FAQ remains a public standalone route and lives in the global Help menu,
// but it should not compete with primary product sections in either drawer.
export const TOP_LEVEL_TABS = routesInGroup('top').filter(route => route.id !== 'faq');
export const STANDARD_TABS = routesInGroup('standard');
export const ARENA_TABS = routesInGroup('arena');
export const BG_PRIMARY_TABS = routesInGroup('bg-primary');
export const BG_BUILDER_TABS = routesInGroup('bg-builder');
export const MISC_TABS = routesInGroup('misc');
export const ADMIN_TABS = routesInGroup('admin');
export const ADMIN_ONLY_TAB_IDS = new Set<TabId>(
  TABS.filter(route => 'adminOnly' in route && route.adminOnly).map(route => route.id),
);
export const BG_TAB_IDS = new Set<TabId>([...BG_PRIMARY_TABS, ...BG_BUILDER_TABS].map(route => route.id));
export const PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS = Object.fromEntries(
  TABS.filter(route => route.entitlement).map(route => [route.id, route.entitlement]),
) as Partial<Record<TabId, RouteEntitlement>>;

export function isRemovedPagePath(path: string): boolean {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  return clean === '/decks' || clean.startsWith('/decks/') || clean === '/jobs' || clean.startsWith('/jobs/');
}

export function tabFromPath(path: string): TabId {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  if (isRemovedPagePath(clean)) return 'home';
  if (/^\/standard\/meta\/(?:standard|wild)\/[a-z0-9][a-z0-9-]{0,119}$/.test(clean)) {
    return 'constructed-archetypes';
  }
  const found = TABS.find(route => route.slug !== '/'
    && (clean === route.slug || clean.startsWith(`${route.slug}/`)));
  return found?.id ?? 'home';
}

export function isKnownPath(path: string): boolean {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  if (clean === '/' || isRemovedPagePath(clean)) return true;
  return TABS.some(route => route.slug !== '/' && (clean === route.slug || clean.startsWith(`${route.slug}/`)));
}

export async function applyPageMeta(
  tabId: TabId,
  pathname = window.location.pathname,
  search = window.location.search,
): Promise<ResolvedPublicUrlPolicy> {
  const [{ seoPageForExactPath, seoPageForNavigationRoute }, { applyDocumentPageMeta }] = await Promise.all([
    import('./seo/registry'),
    import('./seo/publicUrlPolicy'),
  ]);
  const route = TABS.find(item => item.id === tabId) ?? TABS[0];
  const { title, description } = seoPageForExactPath(pathname)
    ?? seoPageForNavigationRoute(route.id);
  return applyDocumentPageMeta({ title, description, pathname, search });
}
