import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { funDecksGuestPreview, type FunDeckRow } from '../src/features/funDecksPreview';
import { buttons, elements, headings, importWithoutStyles, labelled, links, roles, visibleText } from './helpers/renderedMarkup';

const { default: PaywallGate } = await importWithoutStyles<typeof import('../src/components/PaywallGate')>(
  new URL('../src/components/PaywallGate', import.meta.url));
const { default: PaywallPending } = await importWithoutStyles<typeof import('../src/components/PaywallPending')>(
  new URL('../src/components/PaywallPending', import.meta.url));

type GateProps = import('../src/components/PaywallGate').PaywallGateProps;
const gate = (props: Partial<GateProps>) => renderToStaticMarkup(React.createElement(PaywallGate, {
  active: true, title: 'Мета традиционного режима', authUser: null, subscriptionStatus: null,
  subscriptionLoading: false, onRefreshSubscription: async () => undefined, ...props,
}));

test('a guest sees the meta teaser with what the subscription adds and where to buy it', () => {
  const html = gate({ presentation: 'inline', surface: 'meta' });
  assert.deepEqual(headings(html), ['h2 Мета традиционного режима']);
  assert.equal(labelled(html, 'Что входит в подписку')?.text,
    'Все архетипы и рейтинги Периоды патча и дополнения Готовые сборки и коды колод');
  assert.deepEqual(links(html), [
    { name: 'Открыть всю мету', href: 'https://boosty.to/kolodahearthstone' },
    { name: 'Оформить через Telegram', href: 'https://web.tribute.tg/s/xz9' },
    { name: 'Уже подписаны? Войти', href: '/?login' },
  ]);
});

test('the archetype teaser sells archetype statistics', () => {
  const html = gate({ presentation: 'inline', surface: 'archetype', title: 'Пират-воин' });
  assert.equal(labelled(html, 'Что входит в подписку')?.text,
    'Все сборки и коды колод Матчапы на ранге Легенда Муллиган и история показателей');
  assert.equal(links(html)[0].name, 'Открыть статистику архетипа');
});

test('with provider buttons the guest picks Boosty or Telegram', () => {
  const html = gate({ presentation: 'inline', providerButtons: true });
  assert.ok(visibleText(html).includes('Выберите способ подписки'));
  assert.deepEqual(links(html), [
    { name: 'Boosty Открыть через Boosty', href: 'https://boosty.to/kolodahearthstone' },
    { name: 'Telegram Открыть через Telegram', href: 'https://web.tribute.tg/s/xz9' },
    { name: 'Уже подписаны? Войти', href: '/?login' },
  ]);
});

test('a signed-in reader without access refreshes it instead of signing in', () => {
  const html = gate({ presentation: 'inline', authUser: { id: 'reader' }, subscriptionStatus: { message: 'Подписка не найдена' } });
  assert.deepEqual(buttons(html), [{ name: 'Обновить доступ', disabled: false }]);
  assert.ok(!links(html).some(link => link.href === '/?login'));
  assert.deepEqual(roles(html), ['status: Подписка не найдена']);
  const checking = gate({ presentation: 'inline', authUser: { id: 'reader' }, subscriptionLoading: true });
  assert.deepEqual(buttons(checking), [{ name: 'Проверяем доступ…', disabled: true }]);
});

test('a failed access check offers a retry, with no lock and no pitch', () => {
  const html = gate({ presentation: 'inline', subscriptionStatus: { unavailable: true, message: 'Сервер подписок не ответил' } });
  assert.deepEqual(roles(html), ['alert: Сервер подписок не ответил Повторить проверку']);
  assert.deepEqual(buttons(html), [{ name: 'Повторить проверку', disabled: false }]);
  assert.deepEqual(links(html), []);
});

test('an open gate shows the page itself', () => {
  assert.equal(gate({ active: false, children: React.createElement('table', { 'aria-label': 'Мета' }) }),
    '<table aria-label="Мета"></table>');
});

test('the full-page gate hides its blurred preview from readers and keyboards', () => {
  const html = gate({ variant: 'standard' });
  assert.match(html, /<div aria-hidden="true" inert="" class="arena-paywall__preview"/);
  assert.deepEqual(headings(html), ['h1 Мета традиционного режима']);
  assert.ok(visibleText(html).includes('Тариф «Алмаз» открывает статистику традиционного режима'));
  assert.deepEqual(links(html).filter(link => link.href === '/?login'), [{ name: 'Войти в профиль', href: '/?login' }]);
});

test('while access is checked the placeholder announces it and shows no paid data', () => {
  const html = renderToStaticMarkup(React.createElement(PaywallPending, null, 'Проверяем доступ…'));
  assert.deepEqual(roles(html), ['status: Проверяем доступ…']);
  assert.ok(elements(html).some(element => element.attrs['aria-busy'] === 'true' && element.text === 'Проверяем доступ…'));
});

test('a guest gets the three newest fun decks', () => {
  const deck = (title: string, firstSeenAt: string, funScore: number): FunDeckRow => ({
    title, deckCode: `AAE${title}`, format: 'standard', className: 'MAGE', streamer: null, funScore, maxMetaSimilarity: null,
    nearestArchetype: null, winRate: null, games: null, reasons: [], url: null, firstSeenAt, lastSeenAt: firstSeenAt,
  });
  const preview = funDecksGuestPreview({
    fetchedAt: null, stats: { total: 5, standard: 5, wild: 0 }, methodology: { detectorVersion: null, minFunScore: 0, maxMetaSimilarity: 1 },
    decks: [deck('Первая', '2026-10-01T00:00:00Z', 90), deck('Вторая', '2026-10-05T00:00:00Z', 10), deck('Третья', '2026-10-03T00:00:00Z', 30),
      deck('Четвёртая', '2026-10-04T00:00:00Z', 20), deck('Пятая', '2026-10-02T00:00:00Z', 80)],
  });
  assert.deepEqual(preview.decks.map(row => row.title), ['Вторая', 'Четвёртая', 'Третья']);
  assert.equal(preview.stats.total, 5, 'the summary still describes the whole selection');
});

// Which slice a page requests is covered by
// tests/next-soft-paywall-requests-browser.test.mjs. The rest is wiring inside
// client pages (props they pass after the access check), CSS that keeps a
// locked preview still, and the reserved gate height: no DOM or layout engine
// runs here, so these stay guarded by their source.
test('pages pass the access decision to their gates and reserve the gate height', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const metaSource = read('../src/features/StandardMeta.tsx');
  const archetypesSource = read('../src/features/ConstructedArchetypes.tsx');
  const funDecksSource = read('../src/features/FunDecksPage.tsx');
  const detailDataSource = read('../src/modules/constructedArchetypes/useArchetypeDetail.ts');
  const catalogDataSource = read('../src/modules/constructedArchetypes/useArchetypeCatalog.ts');
  assert.match(metaSource, /surface="meta"/);
  assert.match(metaSource, /filteredItems\.slice\(0,\s*3\)/);
  assert.match(detailDataSource, /hasFullAccess && !denied/);
  assert.match(detailDataSource, /hasFullAccess \? '' : '\/teaser'/);
  assert.match(catalogDataSource, /\/api\/constructed-archetypes\/teaser\?format=/);
  assert.doesNotMatch(catalogDataSource, /hasFullAccess|subscription/, 'public summaries do not depend on entitlements');
  assert.match(archetypesSource, /surface="archetype"/);
  assert.match(archetypesSource, /featuredBuild/);
  assert.match(funDecksSource, /FREE_PREVIEW_COUNT\s*=\s*FUN_DECKS_FREE_PREVIEW_COUNT/);
  assert.match(funDecksSource, /!hasFullAccess && !accessPending \? \(\s*<PaywallGate/);
  assert.match(funDecksSource, /providerButtons/);
  assert.match(funDecksSource, /data-tour-id=\{tourAnchor \? 'fun-decks-deck-list'/);

  for (const pageClient of ['StandardMetaPageClient', 'ConstructedArchetypesPageClient', 'FunDecksPageClient']) {
    const source = read(`../apps/public-web/ui/${pageClient}.tsx`);
    assert.match(source, /hasFullAccess=\{allowed\}/, `${pageClient} must pass the access decision to its page`);
    assert.doesNotMatch(source, /PaywallGate/, `${pageClient} must not replace the page with a full paywall`);
  }

  // Inside `@layer` the freeze would lose to the `@layer utilities` shimmer,
  // and inline animation styles would escape it.
  const paywallCss = read('../src/components/PaywallGate.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const freezeRule = /\.arena-paywall__preview :is\(\.skeleton, \[class\*='animate-'\]\) \{\s*animation: none;\s*\}/;
  assert.ok(freezeRule.test(paywallCss), 'PaywallGate.css must stop the loaders of a locked preview');
  const beforeFreeze = paywallCss.slice(0, paywallCss.search(freezeRule));
  assert.equal((beforeFreeze.match(/\{/g) ?? []).length, (beforeFreeze.match(/\}/g) ?? []).length,
    'the locked-preview rule must be a top-level rule');
  assert.ok(!paywallCss.includes('@layer'), 'PaywallGate.css must stay unlayered');
  assert.ok(!/animation: 'spin (?:1s|0\.7s) linear infinite/.test(read('../src/features/DeferredRoutes.tsx')),
    'the tier-list loader inside a locked preview must use classes, not inline animation styles');

  assert.match(read('../src/components/PaywallPending.tsx'), /import '\.\/PaywallGate\.css';/,
    'the placeholder brings its own reserved height');
  assert.ok(/\.arena-paywall-pending,\s*\.arena-paid-view \{\s*min-height: var\(--subscription-gate-min-height\);\s*\}/.test(paywallCss),
    'the placeholder and a mounting paid view must reserve the gate height token');
  assert.match(read('../src/styles/tokens.css'), /--subscription-gate-min-height: 760px;/);
  for (const pageClient of ['BattlegroundHeroesPageClient', 'BattlegroundHeroDetailPageClient', 'BattlegroundLibraryPageClient',
    'BattlegroundLibraryDetailPageClient', 'BattlegroundTierListPageClient', 'BattlegroundTierBuilderPageClient',
    'BattlegroundStrategiesPageClient', 'GuidesArchivePageClient', 'GuideArchiveDetailPageClient']) {
    const source = read(`../apps/public-web/ui/${pageClient}.tsx`);
    // `pending` (paidAccess) covers the check and a refusal the server has not confirmed yet.
    assert.match(source, /const \{ allowed, pending \} = paidAccess\(access, '\w+'\);/, `${pageClient} must decide with paidAccess`);
    assert.match(source, /pending\s*\?\s*<PaywallPending\b/, `${pageClient} must reserve the gate while access is pending`);
    assert.ok(!/<p[^>]*aria-busy/.test(source), `${pageClient} must not render a bare pending line`);
  }
});
