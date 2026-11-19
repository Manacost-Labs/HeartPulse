import assert from 'node:assert/strict';
import React, { createRef, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationModePicker, NavigationRouteLinks } from '../src/app/shell/NavigationItems.js';
import { PublicNavigation, type PublicNavigationProps } from '../src/app/shell/PublicNavigation.js';
import { COMMUNITY_TABS } from '../src/app/routing/navigationRoutes.js';

const noop = () => {};

const props: PublicNavigationProps = {
  activeTab: 'articles',
  mobileMenuOpen: true,
  mode: 'community',
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
  onToggleCompact: noop,
};

const html = renderToStaticMarkup(<PublicNavigation {...props} />);

assert.match(html, /aria-label="Мобильная навигация"/);
assert.match(html, /aria-label="Основная навигация"/);
assert.match(html, /HearthPulse/);
assert.match(html, /src="\/hearthpulse-logo\.webp"/);
assert.match(html, /aria-current="page"/);
assert.doesNotMatch(html, /href="\/[^"?#.]*[^\/"?#.]"/, 'navigation links must target canonical trailing-slash URLs');
assert.doesNotMatch(html, /arena-sidebar-status|Дата обновления данных|Обновлено/);
assert.doesNotMatch(html, /Конструкторы|Разное|Традиционный режим|Стандарт и Вольный/, 'the old groups are gone');
// The items of all four modes are in the server HTML of the drawer and of the sidebar; CSS shows one list.
for (const path of ['/standard/matchups/', '/standard/deck-builder/', '/battlegrounds/tier-list/', '/battlegrounds/tier-builder/', '/guides-archive/']) {
  assert.equal(html.split(`href="${path}"`).length - 1, 2, `${path} is listed in the drawer and in the sidebar`);
}
assert.equal(html.match(/class="hp-nav-list"/g)?.length, 8, 'four lists in the drawer and four in the sidebar');
// The mode switch is a native <details>: it opens without JavaScript. Its four banners are plain links to the mode's main page.
assert.equal(html.match(/<details class="hp-mode"/g)?.length, 2, 'one switch in the drawer and one in the sidebar');
for (const [mode, path] of [['standard', '/standard/meta/'], ['arena', '/classes/'], ['battlegrounds', '/heroes/'], ['community', '/articles/']]) {
  assert.equal(html.split(`<a href="${path}" class="hp-mode-card" data-mode="${mode}"`).length - 1, 2, `the ${mode} banner leads to ${path}`);
}
assert.equal(html.match(/<a[^>]*class="hp-mode-card"[^>]*aria-current="true"/g)?.length, 2, 'only the current mode is marked');
assert.match(html, /<a[^>]*data-mode="community"[^>]*aria-current="true"/);
assert.doesNotMatch(html, /<a[^>]*data-mode="arena"[^>]*aria-current/);
for (const title of ['Стандарт', 'Арена', 'Поля сражений', 'Сообщество']) assert.match(html, new RegExp(`<strong>${title}</strong>`));
assert.match(html, /Мета, матчапы, колоды, карты/);
assert.equal(html.match(/>Текущий</g)?.length, 8, 'every banner carries the badge, CSS shows the current one');
// The page's mode picks the list on its own; a page without a mode leaves it to the remembered choice.
assert.match(html, /<nav[^>]*class="arena-sidebar-nav hp-nav"[^>]*data-page-mode="community"/);
assert.doesNotMatch(renderToStaticMarkup(<PublicNavigation {...props} activeTab="home" />), /data-page-mode/);
// Menu art: a painted icon of 40 px in three files (width descriptors), the emblem of a mode at 48 px, no inline line icons left.
assert.match(html, /<img class="hp-nav-art" src="\/menu\/icons\/standard-meta-80\.webp" srcSet="\/menu\/icons\/standard-meta-40\.webp 40w, \/menu\/icons\/standard-meta-80\.webp 80w, \/menu\/icons\/standard-meta-120\.webp 120w" sizes="40px" width="40" height="40" loading="lazy" decoding="async" alt=""\/>/);
assert.match(html, /srcSet="\/menu\/icons\/mode-community-40\.webp 40w[^"]*" sizes="48px" width="48" height="48"/);
// A banner card takes its art from a two-file srcset and shows the emblem of its mode; the button's face is a wide strip per mode.
assert.match(html, /srcSet="\/menu\/banners\/arena-440\.webp 440w, \/menu\/banners\/arena-571\.webp 571w" sizes="\(min-width: 1024px\) 200px, 170px" width="440" height="616"/);
assert.equal(html.match(/class="hp-mode-card-emblem"/g)?.length, 8, 'each banner carries the emblem of its mode');
assert.equal(html.match(/<img class="hp-mode-face-art" src="\/menu\/banners\/(?:standard|arena|battlegrounds|community)-face\.webp" width="520" height="160" loading="lazy"/g)?.length, 8, 'four faces in each switch, all lazy');
assert.doesNotMatch(html, /\/menu\/icons\/[a-z-]+\.webp|\/menu\/banners\/(?:standard|arena|battlegrounds|community)\.webp/, 'no file in the old single-size naming is referenced');
// The page's own mode is marked on the server (`data-page-current`) and the first mode is the default, so CSS shows one mode without naming them.
assert.equal(html.match(/data-page-current=""/g)?.length, 6, 'the page mode marks its list, face and badge in the drawer and in the sidebar');
assert.doesNotMatch(html, /data-for="(?:standard|arena|battlegrounds)"[^>]*data-page-current/, 'only the page mode is marked');
assert.equal(html.match(/data-default=""/g)?.length, 6, 'the first mode carries the default mark on its list, face and badge (twice: drawer and sidebar)');
assert.equal(html.match(/style="--modes:4"/g)?.length, 2, 'the panel knows how many modes it holds');
// Order: the switch comes first, then «Главная», then the list of the mode; the same in the drawer and in the sidebar.
for (const part of html.split('<div class="hp-nav-top">').slice(1)) {
  const [switchAt, homeAt, listAt] = [part.indexOf('<details class="hp-mode"'), part.indexOf('href="/"'), part.indexOf('class="hp-nav-list"')];
  assert.ok(switchAt >= 0 && switchAt < homeAt && homeAt < listAt, 'switch, then Главная, then the list');
}
assert.doesNotMatch(html, /class="hp-nav-icon"[^>]*><svg/, 'no line icons are left in the items');
// The administrator panel hangs below the groups, and only when the access allows it.
assert.doesNotMatch(html, /href="\/admin\/"/);
const adminHtml = renderToStaticMarkup(<PublicNavigation {...props} appIsContestAdmin />);
assert.match(adminHtml, /hp-nav-admin"[^>]*>[\s\S]*?href="\/admin\/"[\s\S]*?Админ-панель/);
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
  visibleCommunityTabs: COMMUNITY_TABS,
  onNavigate: tab => calls.push(`navigate ${tab}`),
  onNavigateLogin: () => calls.push('login'),
  onCloseMobileMenu: () => calls.push('close'),
};
const [topbar, drawer] = (PublicNavigation(spied) as Element).props.children as Element[];
const drawerLinks = elementsOf(drawer).filter(element => element.type === NavigationRouteLinks || element.type === NavigationModePicker);
assert.ok(drawerLinks.some(links => links.type === NavigationModePicker), 'a banner chosen in the drawer closes it');
assert.ok(drawerLinks.length >= 6, 'the drawer renders its route lists');
for (const links of drawerLinks) {
  const [first] = links.type === NavigationModePicker ? [{ id: 'standard-meta' }] : links.props.routes as readonly { id: string }[];
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
