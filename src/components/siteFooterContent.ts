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
  const route = NAVIGATION_DATA.find(item => item.id === id)!;
  return { label: label ?? route.label, href: canonicalPagePath(route.path) };
};

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  { title: 'Разделы', navLabel: 'Навигация по сайту', links: (['home', 'winrates', 'tierlist', 'legendaries', 'articles', 'gallery'] as const).map(id => navigationLink(id)) },
  { title: 'Сообщество', links: [
    { label: 'Telegram', href: 'https://t.me/manacost_ru', external: true },
    { label: 'Boosty', href: 'https://boosty.to/kolodahearthstone', external: true }] },
  { title: 'Разработчикам', links: [
    navigationLink('developer-api', 'API для разработчиков'),
    { label: 'OpenAPI JSON', href: '/api/v1/openapi.json' }] },
];

export const FOOTER_LEGAL_LINKS: readonly FooterLink[] = [navigationLink('privacy'), navigationLink('terms')];
