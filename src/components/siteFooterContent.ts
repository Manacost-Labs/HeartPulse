import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { NAVIGATION_DATA } from '../app/routing/navigationData';

/**
 * What the footer says, without markup: the site footer (`SiteFooter.tsx`) and
 * the server-built «data unavailable» page (`apps/public-web/lib/unavailablePage.ts`)
 * both read it. Section names and paths come from the menu data, so a renamed
 * section changes in one place.
 */
type NavigationId = (typeof NAVIGATION_DATA)[number]['id'];
export type FooterLink = { label: string; href: string; external?: boolean };
export type FooterColumn = { title: string; /** Set when the list is a navigation landmark. */ navLabel?: string; links: readonly FooterLink[] };

const navigationLink = (id: NavigationId, label?: string): FooterLink => {
  const route = NAVIGATION_DATA.find(item => item.id === id);
  if (!route) throw new Error(`Unknown navigation item ${id}`);
  return { label: label ?? route.label, href: canonicalPagePath(route.path) };
};

/**
 * The mode hubs (`apps/public-web/lib/modeHubs.ts`, #557): every page links to
 * them, so each mode landing gets its links from the whole site.
 */
const MODE_HUB_LINKS: readonly FooterLink[] = [
  { label: 'Стандарт', href: '/standard/' },
  { label: 'Вольный формат', href: '/wild/' },
  { label: 'Арена', href: '/arena/' },
  { label: 'Поля сражений', href: '/battlegrounds/' },
];

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  { title: 'Режимы', navLabel: 'Режимы игры', links: MODE_HUB_LINKS },
  { title: 'Разделы', navLabel: 'Навигация по сайту', links: (['home', 'winrates', 'tierlist', 'legendaries', 'articles', 'gallery'] as const).map(id => navigationLink(id)) },
  { title: 'Сообщество', links: [
    { label: 'Telegram', href: 'https://t.me/manacost_ru', external: true },
    { label: 'Boosty', href: 'https://boosty.to/kolodahearthstone', external: true }] },
  { title: 'Разработчикам', links: [
    navigationLink('developer-api', 'API для разработчиков'),
    { label: 'OpenAPI JSON', href: '/api/v1/openapi.json' }] },
];

export const FOOTER_LEGAL_LINKS: readonly FooterLink[] = [navigationLink('privacy'), navigationLink('terms')];
