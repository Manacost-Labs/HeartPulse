import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayoutDashboard, Trophy } from 'lucide-react';
import { ContestAdminDashboard } from '../src/features/ContestAdminDashboard.js';
import { AdminWorkspaceShell } from '../src/modules/adminWorkspace/public.js';

const navigation = [
  {
    id: 'dashboard',
    label: 'Обзор',
    caption: 'Состояние проекта',
    status: 'Сводка проекта',
    group: 'Рабочий стол',
    icon: LayoutDashboard,
  },
  {
    id: 'contests',
    label: 'Конкурсы',
    caption: 'Заявки и победители',
    status: 'Сохранение по кнопке',
    group: 'Рост',
    icon: Trophy,
  },
] as const;

const noop = () => {};

const desktopHtml = renderToStaticMarkup(
  <AdminWorkspaceShell
    navigation={navigation}
    activeSection="dashboard"
    menuOpen={false}
    accessLabel="Полный доступ"
    userLabel="QA Administrator"
    userTitle="qa@example.com"
    message={null}
    onToggleMenu={noop}
    onCloseMenu={noop}
    onNavigate={noop}
    onDismissMessage={noop}
  >
    <p>Рабочее содержимое</p>
  </AdminWorkspaceShell>,
);

assert.match(desktopHtml, /class="contest-admin-page admin-workspace-page admin-tailadmin-shell"/);
assert.match(desktopHtml, /<header[^>]*class="admin-command-bar"[^>]*aria-label="Панель управления"/);
assert.doesNotMatch(desktopHtml, /admin-command-brand/,
  'the utility header must not repeat the product brand beside the left rail');
assert.match(desktopHtml, /aria-label="Открыть публичный сайт HearthPulse"/);
assert.doesNotMatch(desktopHtml, /Доступ подтверждён/);
assert.match(desktopHtml, /aria-label="Найти раздел админ-панели"/);
assert.match(desktopHtml, /name="admin-navigation-search"/);
assert.match(desktopHtml, /placeholder="Найти раздел…"/);
assert.match(desktopHtml, /id="admin-primary-navigation"/);
assert.match(desktopHtml, /aria-label="Разделы админ панели"/);
assert.match(desktopHtml, /aria-current="page"/);
assert.match(desktopHtml, /data-admin-nav-label="Обзор"/);
assert.match(desktopHtml, /Рабочий стол/);
assert.match(desktopHtml, /Рост/);
assert.match(desktopHtml, /id="admin-section-dashboard"/);
assert.match(desktopHtml, /aria-labelledby="admin-section-title"/);
assert.match(desktopHtml, /<h1 id="admin-section-title">Обзор<\/h1>/);
assert.match(desktopHtml, /Рабочее содержимое/);
assert.doesNotMatch(desktopHtml, /role="dialog"/);

const dashboardHtml = renderToStaticMarkup(
  <ContestAdminDashboard
    articleCount={184}
    galleryCount={42}
    boostyPaidCount={321}
    telegramAccessCount={288}
    contestCount={6}
    contestEntryCount={1284}
    referralCount={23}
    referralClickCount={8905}
    recentReferralClicks={[{
      id: 'click-1',
      referralId: 'ref-1',
      slug: 'launch',
      clickedAt: '2026-09-13T12:00:00Z',
      userAgent: '',
      referrer: '',
      landingPath: '/',
    }]}
    formatDate={() => '13 сентября, 12:00'}
    onNavigate={noop}
    onCreateContest={noop}
  />,
);
assert.match(dashboardHtml, /Пульс проекта/);
assert.match(dashboardHtml, /Данные и парсеры/);
assert.match(dashboardHtml, /184/);
assert.match(dashboardHtml, /\/r\/launch/);

const mobileHtml = renderToStaticMarkup(
  <AdminWorkspaceShell
    navigation={navigation.slice(1)}
    activeSection="contests"
    menuOpen
    accessLabel="Управление конкурсами"
    userLabel="Contest editor"
    message={{ type: 'err', text: 'Не удалось сохранить' }}
    onToggleMenu={noop}
    onCloseMenu={noop}
    onNavigate={noop}
    onDismissMessage={noop}
  >
    <p>Конкурсы</p>
  </AdminWorkspaceShell>,
);

assert.match(mobileHtml, /role="dialog"/);
assert.match(mobileHtml, /aria-modal="true"/);
assert.match(mobileHtml, /aria-expanded="true"/);
assert.match(mobileHtml, /role="alert"/);
assert.match(mobileHtml, /aria-label="Закрыть уведомление"/);
assert.match(mobileHtml, /class="admin-nav-close"/);
assert.doesNotMatch(mobileHtml, />Обзор</);
assert.match(desktopHtml, /class="admin-section-frame"/);

const shellCss = readFileSync(
  new URL('../src/modules/adminWorkspace/adminWorkspace.css', import.meta.url),
  'utf8',
);
assert.match(shellCss, /\.admin-tailadmin-shell \.admin-section-frame \{[\s\S]*?animation: admin-section-enter 180ms cubic-bezier\(0\.16, 1, 0\.3, 1\) both;/);
assert.match(shellCss, /@keyframes admin-section-enter \{[\s\S]*?from \{ opacity: 0\.01; transform: translateY\(5px\); \}/);
assert.match(shellCss, /\.admin-tailadmin-shell \.admin-workspace-nav-list button\.is-active \{[\s\S]*?color: #f7fbff;[\s\S]*?background: #253446;/);
assert.match(shellCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.admin-tailadmin-shell \.admin-section-frame[\s\S]*?animation: none;/);
assert.match(shellCss, /--admin-bar-h:\s*56px;/);
assert.match(shellCss, /--admin-bar-h:\s*84px;/);
assert.match(shellCss, /--admin-nav-w:\s*72px;/);
assert.match(shellCss, /background:\s*#080b10;/);
assert.match(shellCss, /box-shadow:\s*6px 6px 0 rgba\(56, 64, 75, 0\.72\);/);
assert.match(shellCss, /\.admin-tailadmin-shell \.admin-command-logo \{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;/);
const drawerBreakpointStart = shellCss.indexOf('@media (max-width: 1023px)');
const drawerBreakpointEnd = shellCss.indexOf('@media (max-width: 640px)', drawerBreakpointStart);
const drawerBreakpoint = shellCss.slice(drawerBreakpointStart, drawerBreakpointEnd);
const referenceSystem = shellCss.slice(shellCss.indexOf('/* Admin reference system:'));

assert.notEqual(drawerBreakpointStart, -1);
assert.notEqual(drawerBreakpointEnd, -1);
const backdropRule = drawerBreakpoint.match(/\.admin-tailadmin-shell \.admin-nav-backdrop \{([\s\S]*?)\}/)?.[1] ?? '';
const drawerCloseRule = drawerBreakpoint.match(/\.admin-tailadmin-shell \.admin-nav-close \{([\s\S]*?)\}/)?.[1] ?? '';
const toastCloseRules = Array.from(
  drawerBreakpoint.matchAll(/\.admin-tailadmin-shell \.admin-toast button \{([\s\S]*?)\}/g),
  match => match[1],
);
const externalLinkTouchRule = drawerBreakpoint.match(
  /\.admin-tailadmin-shell \.admin-command-brand,[\s\S]*?\.admin-tailadmin-shell \.admin-command-actions > a,[\s\S]*?\.admin-tailadmin-shell \.admin-toast button \{([\s\S]*?)\}/,
)?.[1] ?? '';
const workflowTouchRule = drawerBreakpoint.match(
  /\.admin-tailadmin-shell \.admin-pagination button \{([\s\S]*?)\}/,
)?.[1] ?? '';

assert.match(backdropRule, /display:\s*block;/);
assert.match(backdropRule, /position:\s*fixed;/);
assert.match(backdropRule, /z-index:\s*105;/);
assert.match(drawerCloseRule, /display:\s*grid;/);
assert.ok(toastCloseRules.some(rule => /width:\s*44px;/.test(rule)));
assert.ok(toastCloseRules.some(rule => /height:\s*44px;/.test(rule)));
assert.match(externalLinkTouchRule, /min-height:\s*44px;/);
assert.match(workflowTouchRule, /min-height:\s*44px;/);
assert.match(referenceSystem, /\.admin-tailadmin-shell \.admin-workspace-nav \{[\s\S]*?transition:\s*width 220ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\), padding 220ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);/,
  'the desktop rail must expand smoothly rather than jump between compact and open states');
assert.match(referenceSystem, /\.admin-tailadmin-shell \.admin-workspace-nav\.is-open \.admin-workspace-nav-list button > span \{[\s\S]*?opacity:\s*1;/,
  'navigation labels must fade in with the expanded rail');

console.log('admin workspace shell render assertions passed');
