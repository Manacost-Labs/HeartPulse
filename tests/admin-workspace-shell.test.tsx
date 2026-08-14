import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayoutDashboard, Trophy } from 'lucide-react';
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
assert.match(desktopHtml, /id="admin-primary-navigation"/);
assert.match(desktopHtml, /aria-label="Разделы админ панели"/);
assert.match(desktopHtml, /aria-current="page"/);
assert.match(desktopHtml, /Рабочий стол/);
assert.match(desktopHtml, /Рост/);
assert.match(desktopHtml, /id="admin-section-dashboard"/);
assert.match(desktopHtml, /aria-labelledby="admin-section-title"/);
assert.match(desktopHtml, /<h1 id="admin-section-title">Обзор<\/h1>/);
assert.match(desktopHtml, /Рабочее содержимое/);
assert.doesNotMatch(desktopHtml, /role="dialog"/);

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

const shellCss = readFileSync(
  new URL('../src/modules/adminWorkspace/adminWorkspace.css', import.meta.url),
  'utf8',
);
const drawerBreakpointStart = shellCss.indexOf('@media (max-width: 1023px)');
const drawerBreakpointEnd = shellCss.indexOf('@media (max-width: 640px)', drawerBreakpointStart);
const drawerBreakpoint = shellCss.slice(drawerBreakpointStart, drawerBreakpointEnd);
const compactBreakpoint = shellCss.slice(shellCss.indexOf('@media (max-width: 390px)'));

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
assert.match(compactBreakpoint, /\.admin-tailadmin-shell \.admin-command-brand \{[\s\S]*?min-width:\s*44px;/);

console.log('admin workspace shell render assertions passed');
