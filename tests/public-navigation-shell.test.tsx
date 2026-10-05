import assert from 'node:assert/strict';
import React, { createRef, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationRouteLinks } from '../src/app/shell/NavigationItems.js';
import { PublicNavigation, type PublicNavigationProps } from '../src/app/shell/PublicNavigation.js';
import { BG_BUILDER_TABS, MISC_TABS } from '../src/app/routing/navigationRoutes.js';

const noop = () => {};

const props: PublicNavigationProps = {
  activeTab: 'articles',
  mobileMenuOpen: true,
  mobileNavGroup: 'constructors',
  sidebarNavGroup: 'misc',
  visibleArenaTabs: [],
  visibleMiscTabs: [],
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
};

const html = renderToStaticMarkup(<PublicNavigation {...props} />);

assert.match(html, /aria-label="Мобильная навигация"/);
assert.match(html, /aria-label="Основная навигация"/);
assert.match(html, /HearthPulse/);
assert.match(html, /src="\/hearthpulse-logo\.webp"/);
assert.match(html, /arena-(?:mobile-menu|sidebar)-link-icon/);
assert.match(html, /aria-current="page"/);
assert.doesNotMatch(html, /href="\/[^"?#.]*[^\/"?#.]"/, 'navigation links must target canonical trailing-slash URLs');
assert.match(html, /Традиционный режим/);
assert.match(html, /Мета и колоды/);
assert.match(html, /Арена/);
assert.match(html, /Драфт и выборы/);
assert.match(html, /Поля Сражений/);
assert.match(html, /Герои и тактика/);
assert.match(html, /Конструкторы/);
assert.match(html, /Создавайте и сравнивайте/);
assert.match(html, /Разное/);
assert.match(html, /Материалы и события/);
assert.match(html, /aria-expanded="true"/);
assert.match(html, /id="arena-mobile-constructors"/);
assert.match(html, /id="arena-sidebar-misc"/);
assert.match(html, /Обновлено/);

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
  mobileNavGroup: 'misc',
  visibleMiscTabs: MISC_TABS,
  onNavigate: tab => calls.push(`navigate ${tab}`),
  onNavigateLogin: () => calls.push('login'),
  onCloseMobileMenu: () => calls.push('close'),
};
const [topbar, drawer] = (PublicNavigation(spied) as Element).props.children as Element[];
const drawerLinks = elementsOf(drawer).filter(element => element.type === NavigationRouteLinks);
assert.ok(drawerLinks.length >= 6, 'the drawer renders its route lists');
for (const links of drawerLinks) {
  const [first] = links.props.routes as readonly { id: string }[];
  if (!first) continue;
  calls.length = 0;
  (links.props.onNavigate as (tab: string) => void)(first.id);
  assert.deepEqual(calls.sort(), ['close', `navigate ${first.id}`], `${first.id} closes the drawer as it navigates`);
}
assert.ok(drawerLinks.some(links => links.props.routes === BG_BUILDER_TABS), 'the builder sub-links close it too');
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
