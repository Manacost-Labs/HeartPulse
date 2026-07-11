import {
  BookOpen,
  Gift,
  Grid3X3,
  Home,
  Image as ImageIcon,
  Library,
  List,
  Scroll,
  ShieldCheck,
  Star,
  Swords,
  Trophy,
  UserCircle,
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
  meta: {
    title: string;
    description: string;
  };
};

export const TABS = [
  {
    id: 'home', label: 'Главная', icon: Home, slug: '/', group: 'home', entitlement: null,
    meta: {
      title: 'HS-Arena — Тир-лист и Винрейты для Арены Hearthstone',
      description: 'Актуальная статистика Арены Hearthstone: тир-лист карт, винрейты классов, легендарные группы. Данные обновляются 4 раза в сутки.',
    },
  },
  {
    id: 'articles', label: 'Статьи', icon: BookOpen, slug: '/articles', group: 'top', entitlement: null,
    meta: {
      title: 'Статьи и гайды по Арене Hearthstone | HS-Arena',
      description: 'Гайды, разборы и советы по режиму Арена в Hearthstone от команды Manacost.',
    },
  },
  {
    id: 'gallery', label: 'Галерея', icon: ImageIcon, slug: '/gallery', group: 'misc', entitlement: null,
    meta: {
      title: 'Галерея артов Hearthstone | HS-Arena',
      description: 'Публичная галерея артов Манакоста в высоком качестве: просмотр и скачивание доступны всем пользователям.',
    },
  },
  {
    id: 'guides-archive', label: 'Архив гайдов', icon: BookOpen, slug: '/guides-archive', group: 'misc', entitlement: 'guidesArchive',
    meta: {
      title: 'Архив гайдов Hearthstone | Manacost Stats',
      description: 'Архив старых гайдов, мета-отчетов и материалов Koloda Hearthstone в удобном формате для чтения.',
    },
  },
  {
    id: 'contests', label: 'Конкурсы', icon: Gift, slug: '/contests', group: 'misc', entitlement: null,
    meta: {
      title: 'Конкурсы Манакоста | Manacost Stats',
      description: 'Конкурсы для подписчиков Манакоста: участие, проверка подписки и публикация ID победителей.',
    },
  },
  {
    id: 'standard-matchups', label: 'Матчапы', icon: Swords, slug: '/standard/matchups', group: 'standard', entitlement: 'standard',
    meta: {
      title: 'Матчапы Стандарта Hearthstone | Manacost Stats',
      description: 'Матрица матчапов актуальной меты Стандарта по данным HSGuru: винрейты архетипов против друг друга.',
    },
  },
  {
    id: 'winrates', label: 'Классы', icon: Trophy, slug: '/classes', group: 'arena', entitlement: 'arena',
    meta: {
      title: 'Винрейт классов — Арена Hearthstone | HS-Arena',
      description: 'Актуальные винрейты всех 11 классов в режиме Арена Hearthstone. Рейтинг на основе миллионов партий, обновляется автоматически.',
    },
  },
  {
    id: 'tierlist', label: 'Тир-лист', icon: Scroll, slug: '/tierlist', group: 'arena', entitlement: 'arena',
    meta: {
      title: 'Тир-лист карт — Арена Hearthstone | HS-Arena',
      description: 'Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S до F.',
    },
  },
  {
    id: 'legendaries', label: 'Легендарки', icon: Star, slug: '/legendaries', group: 'arena', entitlement: 'arena',
    meta: {
      title: 'Легендарки на Арене Hearthstone — Лучшие группы | HS-Arena',
      description: 'Какую легендарную карту выбрать на Арене? Все группы первого выбора с процентом побед. Обновляется автоматически.',
    },
  },
  {
    id: 'bg-heroes', label: 'Герои', icon: UserCircle, slug: '/heroes', group: 'bg-primary', entitlement: 'battlegrounds',
    meta: {
      title: 'Герои Полей Сражений Hearthstone | HS-Arena',
      description: 'Тир-лист героев Hearthstone Battlegrounds с отдельными страницами героев, способностями, компаньонами и статистикой.',
    },
  },
  {
    id: 'bg-library', label: 'Библиотека', icon: Library, slug: '/library', group: 'bg-primary', entitlement: 'battlegrounds',
    meta: {
      title: 'Библиотека Полей Сражений Hearthstone | HS-Arena',
      description: 'Библиотека существ и заклинаний Hearthstone Battlegrounds: актуальный пул, архив, фильтры, статистика и отдельные страницы карт.',
    },
  },
  {
    id: 'bg-tier-list', label: 'Тир-лист', icon: Scroll, slug: '/battlegrounds/tier-list', group: 'bg-primary', entitlement: 'battlegrounds',
    meta: {
      title: 'Тир-лист Полей Сражений Hearthstone | HS-Arena',
      description: 'Тир-лист Hearthstone Battlegrounds: существа, стратегии, заклинания и аксессуары с фильтрами и просмотром карт.',
    },
  },
  {
    id: 'bg-strategies', label: 'Конструктор стратегий', icon: Grid3X3, slug: '/battlegrounds/strategies', group: 'bg-builder', entitlement: 'battlegrounds',
    meta: {
      title: 'Конструктор стратегий Полей Сражений | HS-Arena',
      description: 'Инструмент для сборки и визуализации стратегий Hearthstone Battlegrounds.',
    },
  },
  {
    id: 'bg-tier-builder', label: 'Конструктор тир-листов', icon: List, slug: '/battlegrounds/tier-builder', group: 'bg-builder', entitlement: 'battlegrounds',
    meta: {
      title: 'Конструктор тир-листов Полей Сражений | HS-Arena',
      description: 'Инструмент для создания собственных тир-листов карт Hearthstone Battlegrounds.',
    },
  },
  {
    id: 'admin-panel', label: 'Админ панель', icon: ShieldCheck, slug: '/admin', group: 'admin', entitlement: null,
    meta: {
      title: 'Админ панель конкурсов | Manacost Stats',
      description: 'Панель администратора конкурсов Манакоста: создание конкурсов, заявки, победители и поиск профилей.',
    },
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

export function applyPageMeta(tabId: TabId): void {
  const route = TABS.find(item => item.id === tabId) ?? TABS[0];
  const { title, description } = route.meta;
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
