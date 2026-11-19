import type { SubscriptionEntitlementKey } from '../../modules/subscriptions/public';

/**
 * The public menu without icons or any client code: id, label, path, group.
 * The site menu (`navigationDefinitions.ts` adds the icons) and the server-built
 * «data unavailable» page (`apps/public-web/lib/unavailablePage.ts`) both read
 * it, so a label or a section changes here once.
 */
export type NavigationGroupId = 'home' | 'standard' | 'arena' | 'battlegrounds' | 'community' | 'footer' | 'admin';

/** The four modes of the site: the menu shows the items of one at a time and a banner switches between them. */
export type NavigationModeId = Extract<NavigationGroupId, 'standard' | 'arena' | 'battlegrounds' | 'community'>;

export const NAVIGATION_MODES = [
  { id: 'standard', label: 'Стандарт', description: 'Мета, матчапы, колоды, карты', homeTab: 'standard-meta', path: '/standard/meta' },
  { id: 'arena', label: 'Арена', description: 'Классы, тир-лист, легендарки', homeTab: 'winrates', path: '/classes' },
  { id: 'battlegrounds', label: 'Поля сражений', description: 'Герои, тир-лист, библиотека', homeTab: 'bg-heroes', path: '/heroes' },
  { id: 'community', label: 'Сообщество', description: 'Подборка, стримеры, конкурсы', homeTab: 'articles', path: '/articles' },
] as const satisfies readonly { id: NavigationModeId; label: string; description: string; homeTab: string; path: `/${string}` }[];

type NavigationDatum = {
  id: string;
  label: string;
  path: `/${string}`;
  group: NavigationGroupId;
  // The subscription the section sells; the page itself enforces access.
  entitlement: SubscriptionEntitlementKey | null;
  adminOnly?: boolean;
};

export const NAVIGATION_DATA = [
  { id: 'home', label: 'Главная', path: '/', group: 'home', entitlement: null },
  { id: 'standard-meta', label: 'Мета', path: '/standard/meta', group: 'standard', entitlement: 'standard' },
  { id: 'standard-matchups', label: 'Матчапы', path: '/standard/matchups', group: 'standard', entitlement: 'standard' },
  { id: 'constructed-archetypes', label: 'Архетипы', path: '/standard/archetypes', group: 'standard', entitlement: 'standard' },
  { id: 'fun-decks', label: 'Фан-колоды', path: '/standard/fun-decks', group: 'standard', entitlement: 'standard' },
  { id: 'standard-vicious-gold', label: 'VS Gold', path: '/standard/vicious-gold', group: 'standard', entitlement: 'standard' },
  { id: 'standard-cards', label: 'Карты', path: '/standard/cards', group: 'standard', entitlement: null },
  { id: 'deck-builder', label: 'Конструктор колод', path: '/standard/deck-builder', group: 'standard', entitlement: null },
  { id: 'patch-notes', label: 'Патчноуты', path: '/standard/patches', group: 'standard', entitlement: null },
  { id: 'winrates', label: 'Классы', path: '/classes', group: 'arena', entitlement: 'arena' },
  { id: 'tierlist', label: 'Тир-лист', path: '/tierlist', group: 'arena', entitlement: 'arena' },
  { id: 'legendaries', label: 'Легендарки', path: '/legendaries', group: 'arena', entitlement: 'arena' },
  { id: 'bg-heroes', label: 'Герои', path: '/heroes', group: 'battlegrounds', entitlement: 'battlegrounds' },
  { id: 'bg-tier-list', label: 'Тир-лист', path: '/battlegrounds/tier-list', group: 'battlegrounds', entitlement: 'battlegrounds' },
  { id: 'bg-library', label: 'Библиотека', path: '/library', group: 'battlegrounds', entitlement: 'battlegrounds' },
  { id: 'bg-strategies', label: 'Конструктор стратегий', path: '/battlegrounds/strategies', group: 'battlegrounds', entitlement: 'battlegrounds' },
  { id: 'bg-tier-builder', label: 'Конструктор тир-листов', path: '/battlegrounds/tier-builder', group: 'battlegrounds', entitlement: 'battlegrounds' },
  { id: 'articles', label: 'Подборка', path: '/articles', group: 'community', entitlement: null },
  { id: 'leaderboards', label: 'Таблицы лидеров', path: '/leaderboards', group: 'community', entitlement: null },
  { id: 'streamers', label: 'Стримеры', path: '/streamers', group: 'community', entitlement: null },
  { id: 'contests', label: 'Конкурсы', path: '/contests', group: 'community', entitlement: null },
  { id: 'gallery', label: 'Галерея', path: '/gallery', group: 'community', entitlement: null },
  { id: 'cosmetics', label: 'Косметика', path: '/cosmetics', group: 'community', entitlement: null },
  { id: 'guides-archive', label: 'Архив гайдов', path: '/guides-archive', group: 'community', entitlement: 'guidesArchive' },
  { id: 'faq', label: 'FAQ', path: '/faq', group: 'footer', entitlement: null },
  { id: 'developer-api', label: 'API', path: '/developers/api', group: 'footer', entitlement: null },
  { id: 'privacy', label: 'Конфиденциальность', path: '/privacy', group: 'footer', entitlement: null },
  { id: 'terms', label: 'Условия использования', path: '/terms', group: 'footer', entitlement: null },
  { id: 'admin-panel', label: 'Админ-панель', path: '/admin', group: 'admin', entitlement: null },
] as const satisfies readonly NavigationDatum[];
