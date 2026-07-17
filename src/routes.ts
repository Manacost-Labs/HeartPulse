import {
  BookOpenText,
  ChartNoAxesCombined,
  CircleUserRound,
  Crown,
  Gem,
  Gift,
  Grid3X3,
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
    id: 'gallery', label: 'Галерея', icon: ImageIcon, slug: '/gallery', group: 'misc', entitlement: null,
  },
  {
    id: 'guides-archive', label: 'Архив гайдов', icon: Scroll, slug: '/guides-archive', group: 'misc', entitlement: 'guidesArchive',
  },
  {
    id: 'contests', label: 'Конкурсы', icon: Gift, slug: '/contests', group: 'misc', entitlement: null,
  },
  {
    id: 'standard-matchups', label: 'Матчапы', icon: Swords, slug: '/standard/matchups', group: 'standard', entitlement: 'standard',
  },
  {
    id: 'standard-meta', label: 'Мета', icon: ChartNoAxesCombined, slug: '/standard/meta', group: 'standard', entitlement: 'standard',
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

export const TOP_LEVEL_TABS = routesInGroup('top');
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

const SITE_URL = 'https://arena.hs-manacost.ru';

export function isRemovedPagePath(path: string): boolean {
  return path === '/decks' || path.startsWith('/decks/') || path.startsWith('/jobs');
}

export function tabFromPath(path: string): TabId {
  if (isRemovedPagePath(path)) return 'home';
  const found = TABS.find(route => route.slug !== '/' && path.startsWith(route.slug));
  return found?.id ?? 'home';
}

export function isKnownPath(path: string): boolean {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/' || isRemovedPagePath(clean)) return true;
  return TABS.some(route => route.slug !== '/' && (clean === route.slug || clean.startsWith(`${route.slug}/`)));
}

export async function applyPageMeta(tabId: TabId): Promise<void> {
  const { ROUTE_META } = await import('./route-meta');
  const route = TABS.find(item => item.id === tabId) ?? TABS[0];
  const { title, description } = ROUTE_META[route.id];
  document.title = title;

  const setMeta = (selector: string, content: string) => {
    const element = document.querySelector<HTMLMetaElement>(selector);
    if (element) element.content = content;
  };
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', `${SITE_URL}${route.slug}`);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);

  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${SITE_URL}${route.slug}`;
}
