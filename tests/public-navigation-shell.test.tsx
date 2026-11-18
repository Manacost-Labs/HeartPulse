import assert from 'node:assert/strict';
import React, { createRef, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationRouteLinks } from '../src/app/shell/NavigationItems.js';
import { PublicNavigation, type PublicNavigationProps } from '../src/app/shell/PublicNavigation.js';
import { COMMUNITY_TABS } from '../src/app/routing/navigationRoutes.js';

const noop = () => {};

const props: PublicNavigationProps = {
  activeTab: 'articles',
  mobileMenuOpen: true,
  mobileNavGroups: new Set(['battlegrounds'] as const),
  sidebarNavGroups: new Set(['community'] as const),
  compact: false,
  badges: { 'patch-notes': { label: 'Новый', title: 'Новый патч 37.0.0' } },
  visibleArenaTabs: [],
  visibleCommunityTabs: COMMUNITY_TABS,
  appIsContestAdmin: false,
  wantsLogin: false,
  updatedAtLabel: '14 сентября 2026, 12:00',
  mobileMenuRef: createRef<HTMLElement>(),
  mobileMenuToggleRef: createRef<HTMLButtonElement>(),
  mobileProfile: <span>Войти</span>,
  sidebarProfile: <span>Профиль</span>,
  profileLabel: 'Войти в профиль',
  onNavigate: noop,
  onNavigateLogin: noop,
  onToggleMobileMenu: noop,
  onCloseMobileMenu: noop,
  onToggleMobileNavGroup: noop,
  onToggleSidebarNavGroup: noop,
  onToggleCompact: noop,
};

const html = renderToStaticMarkup(<PublicNavigation {...props} />);

assert.match(html, /aria-label="Мобильная навигация"/);
assert.match(html, /aria-label="Основная навигация"/);
assert.match(html, /HearthPulse/);
assert.match(html, /src="\/hearthpulse-logo\.webp"/);
assert.match(html, /arena-(?:mobile-menu|sidebar)-link-icon/);
assert.match(html, /aria-current="page"/);
assert.doesNotMatch(html, /href="\/[^"?#.]*[^\/"?#.]"/, 'navigation links must target canonical trailing-slash URLs');
for (const title of ['Стандарт и Вольный', 'Арена', 'Поля сражений', 'Сообщество']) assert.match(html, new RegExp(`<span class="arena-nav-label">${title}</span>`));
assert.doesNotMatch(html, /Конструкторы|Разное|Традиционный режим/, 'the old groups are gone');
assert.match(html, /aria-expanded="true"/);
assert.match(html, /id="arena-mobile-battlegrounds"/);
assert.match(html, /id="arena-sidebar-community"/);
assert.doesNotMatch(html, /arena-sidebar-status|Дата обновления данных|Обновлено/);
// No decorative captions under groups, no emblem coins: the title says it.
assert.doesNotMatch(html, /Мета и колоды|Драфт и выборы|Герои и тактика|Создавайте и сравнивайте|Материалы и события/);
assert.doesNotMatch(html, /arena-nav-section-icon|arena-(?:sidebar|mobile-menu)-section/, 'group titles carry no coins');
// A group title is a button tied to its list; the links of a closed group stay in the HTML for crawlers and no-JS readers.
assert.match(html, /<button[^>]*aria-expanded="false"[^>]*aria-controls="arena-sidebar-standard"/);
assert.match(html, /id="arena-sidebar-standard"[^>]*data-closed=""[^>]*>[\s\S]*?href="\/standard\/deck-builder\/"/, 'the deck builder is in the Standard group');
assert.equal(html.match(/arena-(?:sidebar|mobile-menu)-group-trigger/g)?.length, 8, 'four collapsible groups in the drawer and four in the sidebar');
// Groups open independently: opening one never collapses another under the pointer.
const bothOpen = renderToStaticMarkup(<PublicNavigation {...props} sidebarNavGroups={new Set(['standard', 'community'] as const)} />);
assert.match(bothOpen, /id="arena-sidebar-standard"(?![^>]*data-closed)/);
assert.match(bothOpen, /id="arena-sidebar-community"(?![^>]*data-closed)/);
// The administrator panel hangs below the groups, and only when the access allows it.
assert.doesNotMatch(html, /href="\/admin\/"/);
const adminHtml = renderToStaticMarkup(<PublicNavigation {...props} appIsContestAdmin />);
assert.match(adminHtml, /arena-sidebar-admin"[^>]*>[\s\S]*?href="\/admin\/"[\s\S]*?Админ-панель/);
// A badge is plain text next to its link.
assert.match(html, /href="\/standard\/patches\/"[^>]*>[\s\S]*?<span class="arena-nav-badge" title="Новый патч 37\.0\.0">Новый<\/span>/);
// The compact rail keeps one name per item for its tooltip and a pressed toggle state.
assert.match(html, /data-nav-tip="Тир-лист · Поля сражений"/);
assert.match(html, /<button[^>]*class="arena-sidebar-compact-toggle"[^>]*aria-pressed="false"[^>]*aria-label="Свернуть меню"/);
const compactHtml = renderToStaticMarkup(<PublicNavigation {...props} compact />);
assert.match(compactHtml, /aria-pressed="true"[^>]*aria-label="Развернуть меню"/);

// The drawer is in the server HTML even while closed: a native popover the
// toggle opens before React hydrates, with plain links inside.
const closedHtml = renderToStaticMarkup(<PublicNavigation {...props} mobileMenuOpen={false} />);
assert.match(closedHtml, /<nav[^>]*id="arena-mobile-menu"[^>]*popover="auto"/, 'the closed drawer is rendered as a popover');
assert.doesNotMatch(closedHtml, /data-open/, 'a closed drawer is not marked open');
// HTML attribute names are case-insensitive; React writes `popoverTarget`.
assert.match(closedHtml, /<button[^>]*popovertarget="arena-mobile-menu"[^>]*class="arena-mobile-nav-toggle"/i,
  'the toggle opens the drawer without JavaScript');
assert.match(closedHtml, /id="arena-mobile-menu"[\s\S]*href="\/standard\/meta\/"/, 'drawer links are plain anchors');
assert.match(html, /id="arena-mobile-menu"[^>]*data-open=""/, 'an open drawer is marked for browsers without popovers');

// Every way out of the drawer closes it, so the scroll lock is released while
// the page is still there and Back returns to the reading position.
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elementsOf(node: ReactNode, found: Element[] = []): Element[] {
  if (Array.isArray(node)) { node.forEach(child => elementsOf(child, found)); return found; }
  if (!React.isValidElement(node)) return found;
  const element = node as Element;
  found.push(element);
  if (typeof element.type === 'function' && element.type !== NavigationRouteLinks) {
    elementsOf((element.type as (props: unknown) => ReactNode)(element.props), found);
  }
  elementsOf(element.props.children, found);
  return found;
}
const calls: string[] = [];
const spied: PublicNavigationProps = {
  ...props,
  mobileNavGroups: new Set(['community'] as const),
  visibleCommunityTabs: COMMUNITY_TABS,
  onNavigate: tab => calls.push(`navigate ${tab}`),
  onNavigateLogin: () => calls.push('login'),
  onCloseMobileMenu: () => calls.push('close'),
};
const [topbar, drawer] = (PublicNavigation(spied) as Element).props.children as Element[];
const drawerLinks = elementsOf(drawer).filter(element => element.type === NavigationRouteLinks);
assert.ok(drawerLinks.length >= 5, 'the drawer renders its route lists');
for (const links of drawerLinks) {
  const [first] = links.props.routes as readonly { id: string }[];
  if (!first) continue;
  calls.length = 0;
  (links.props.onNavigate as (tab: string) => void)(first.id);
  assert.deepEqual(calls.sort(), ['close', `navigate ${first.id}`], `${first.id} closes the drawer as it navigates`);
}
assert.ok(drawerLinks.some(links => links.props.routes === COMMUNITY_TABS), 'the community links close it too');
const click = {
  button: 0, defaultPrevented: false,
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
  preventDefault: noop,
};
calls.length = 0;
(elementsOf(drawer).find(element => String(element.props.className ?? '').includes('arena-mobile-menu-profile'))!
  .props.onClick as (event: typeof click) => void)(click);
assert.deepEqual(calls.sort(), ['close', 'login'], 'the profile link closes the drawer');
calls.length = 0;
(elementsOf(topbar).find(element => element.props.className === 'arena-mobile-brand')!
  .props.onClick as (event: typeof click) => void)(click);
assert.deepEqual(calls.sort(), ['close', 'navigate home'], 'the brand link closes the drawer');

console.log('public navigation shell assertions passed');
