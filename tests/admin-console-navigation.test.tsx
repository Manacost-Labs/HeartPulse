import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverviewAlerts, OverviewKpis } from '../src/modules/adminCrm/ui/AdminOverviewSections.js';
import {
  ADMIN_NAV_ITEMS,
  CONTEST_ADMIN_NAV_ITEMS,
  adminSectionFromSearch,
  isAdminSection,
} from '../src/features/adminConsole/adminNavigation.js';

const noop = () => {};

// Every section appears once, and each group is one contiguous block, so the sidebar shows each heading once.
assert.equal(new Set(ADMIN_NAV_ITEMS.map(item => item.id)).size, ADMIN_NAV_ITEMS.length);
const groupOrder = ADMIN_NAV_ITEMS.map(item => item.group).filter((group, index, all) => group !== all[index - 1]);
assert.equal(new Set(groupOrder).size, groupOrder.length, `groups must not repeat: ${groupOrder.join(' → ')}`);
assert.equal(ADMIN_NAV_ITEMS[0].id, 'dashboard');
assert.deepEqual(CONTEST_ADMIN_NAV_ITEMS.map(item => item.id), ['contests']);
assert.ok(ADMIN_NAV_ITEMS.every(item => item.caption.length > 0 && item.label.length > 0));

assert.equal(adminSectionFromSearch('?section=boosty', 'dashboard'), 'boosty');
assert.equal(adminSectionFromSearch('?section=list', 'dashboard'), 'articles', 'the legacy list link opens articles');
assert.equal(adminSectionFromSearch('?contest=abc', 'dashboard'), 'contests');
assert.equal(adminSectionFromSearch('?section=unknown', 'dashboard'), 'dashboard');
assert.equal(adminSectionFromSearch('', 'contests'), 'contests');
assert.equal(isAdminSection('api-keys'), true);
assert.equal(isAdminSection('__proto__'), false);

const overview = {
  generatedAt: '2026-09-29T12:00:00.000Z',
  alerts: [{
    id: 'telegram-chat:-5077378176', severity: 'critical' as const,
    title: 'Бот не видит VIP-группу Telegram -5077378176',
    detail: '4 из 4 проверок за 2 часа: chat not found.',
    action: { section: 'telegram', label: 'Открыть Telegram' },
  }],
  kpis: { totalUsers: 8412, payingNow: 1284, payingProvider: 1243, manualAccess: 41, newUsers30d: 537, newUsersPrevious30d: 560, lapsed30d: 63, expiringSoon: 14 },
  series: { days: ['2026-09-28', '2026-09-29'], newUsers: [10, 12], paying: [1280, 1284] },
  activity: [],
};
const overviewHtml = renderToStaticMarkup(
  <>
    <OverviewAlerts alerts={overview.alerts} onNavigate={noop} onOpenSegment={noop} />
    <OverviewKpis overview={overview} onOpenSegment={noop} />
  </>,
);
assert.match(overviewHtml, /Срочно: <\/span>Бот не видит VIP-группу Telegram -5077378176/);
assert.match(overviewHtml, /Открыть Telegram/);
assert.match(overviewHtml, /1\s284/);
assert.match(overviewHtml, /Истекает за 7 дней/);
assert.match(overviewHtml, /-4%/);
assert.equal((overviewHtml.match(/<li><button type="button"/g) ?? []).length, 4);
assert.match(renderToStaticMarkup(<OverviewAlerts alerts={[]} onNavigate={noop} onOpenSegment={noop} />), /role="status"[^>]*>.*Всё спокойно/);

console.log('admin console navigation and overview assertions passed');
