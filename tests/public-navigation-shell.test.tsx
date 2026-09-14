import assert from 'node:assert/strict';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicNavigation } from '../src/app/shell/PublicNavigation.js';

const noop = () => {};

const html = renderToStaticMarkup(
  <PublicNavigation
    activeTab="articles"
    mobileMenuOpen
    mobileNavGroup="constructors"
    sidebarNavGroup="misc"
    visibleArenaTabs={[]}
    visibleMiscTabs={[]}
    appIsContestAdmin={false}
    wantsLogin={false}
    updatedAtLabel="14 сентября 2026, 12:00"
    mobileMenuRef={createRef<HTMLElement>()}
    mobileMenuToggleRef={createRef<HTMLButtonElement>()}
    mobileProfile={<span>Войти</span>}
    sidebarProfile={<span>Профиль</span>}
    profileLabel="Войти в профиль"
    onNavigate={noop}
    onNavigateLogin={noop}
    onWarm={noop}
    onToggleMobileMenu={noop}
    onCloseMobileMenu={noop}
    onToggleMobileNavGroup={noop}
    onToggleSidebarNavGroup={noop}
  />,
);

assert.match(html, /aria-label="Мобильная навигация"/);
assert.match(html, /aria-label="Основная навигация"/);
assert.match(html, /HearthPulse/);
assert.match(html, /src="\/hearthpulse-logo\.webp"/);
assert.match(html, /arena-(?:mobile-menu|sidebar)-link-icon/);
assert.match(html, /aria-current="page"/);
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

console.log('public navigation shell assertions passed');
