import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fc from 'fast-check';
import {
  DEFAULT_FUN_DECKS_VIEW,
  FUN_DECK_CLASSES,
  FUN_DECK_TAGS,
  FUN_DECKS_FREE_PREVIEW_COUNT,
  FUN_DECKS_SORTS,
  funDeckHasFewGames,
  funDeckInterval,
  funDeckWhy,
  funDecksGuestPreview,
  orderFunDecks,
  selectFunDecks,
  type FunDeckRow,
  type FunDecksView,
} from '../src/features/funDecksPreview';
import { readFunDecksQuery, writeFunDecksQuery } from '../src/features/funDecksQuery';
import { assertProperty } from './helpers/propertyRuns';
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

const funDeck = (title: string, extra: Partial<FunDeckRow> = {}): FunDeckRow => ({
  title, deckCode: `CODE-${title}`, format: 'Standard', className: 'Mage', streamer: null, funScore: 0.6, maxMetaSimilarity: 0.3,
  nearestArchetype: null, winRate: 50, games: 120, reasons: [], url: null, firstSeenAt: '2026-10-01T00:00:00Z', lastSeenAt: null, ...extra,
});
// Five decks; the third has no interval, as in a dataset from before concept-v7.
const FUN_FIXTURE: FunDeckRow[] = [
  funDeck('Рено Жрец', { className: 'Priest', reasons: ['highlander_shape', 'pkg:reno_highlander', 'card_package', 'meta_core_outlier'],
    funScore: 0.8, maxMetaSimilarity: 0.12, winRate: 54, winRateCiLow: 47, winRateCiHigh: 61, games: 47, firstSeenAt: '2026-10-03T00:00:00Z',
    nearestArchetype: 'Mecha\'thun Priest', nearestArchetypeLabel: 'Меха-К\'тун Жрец' }),
  funDeck('Мем Маг', { className: 'Mage', format: 'Wild', reasons: ['meme_low_winrate', 'concept_title'], funScore: 0.9,
    maxMetaSimilarity: 0.4, winRate: 40, winRateCiLow: 28, winRateCiHigh: 53, games: 80, firstSeenAt: '2026-10-05T00:00:00Z' }),
  funDeck('Сырный Разбойник', { className: 'Rogue', reasons: ['cheese_high_winrate', 'xl_shape', 'meta_core_outlier', 'standard_balance_boost'],
    funScore: 0.7, maxMetaSimilarity: 0.2, winRate: 70, winRateCiLow: 55, winRateCiHigh: 82, games: 60, firstSeenAt: '2026-10-04T00:00:00Z' }),
  funDeck('Без интервала Друид', { className: 'Druid', format: 'Wild', reasons: ['low_meta_overlap'], funScore: 0.6,
    maxMetaSimilarity: 0.35, winRate: 90, games: 20, firstSeenAt: '2026-10-02T00:00:00Z' }),
  funDeck('Хайлендер Жрец', { className: 'Priest', format: 'Wild', reasons: ['highlander_shape', 'xl_shape', 'concept_title', 'pkg:reno_highlander', 'meta_core_outlier'],
    funScore: 0.85, maxMetaSimilarity: 0.05, winRate: 52, winRateCiLow: 45, winRateCiHigh: 59, games: 200, firstSeenAt: '2026-10-01T00:00:00Z' }),
];
const titles = (decks: FunDeckRow[]) => decks.map(deck => deck.title);

test('the four sorts order fun decks by their own key, and a deck without the key goes last', () => {
  assert.deepEqual(titles(orderFunDecks(FUN_FIXTURE, 'newest')),
    ['Мем Маг', 'Сырный Разбойник', 'Рено Жрец', 'Без интервала Друид', 'Хайлендер Жрец']);
  assert.deepEqual(titles(orderFunDecks(FUN_FIXTURE, 'fun')),
    ['Мем Маг', 'Хайлендер Жрец', 'Рено Жрец', 'Сырный Разбойник', 'Без интервала Друид']);
  assert.deepEqual(titles(orderFunDecks(FUN_FIXTURE, 'reliable')),
    ['Сырный Разбойник', 'Рено Жрец', 'Хайлендер Жрец', 'Мем Маг', 'Без интервала Друид']);
  assert.deepEqual(titles(orderFunDecks(FUN_FIXTURE, 'distant')),
    ['Хайлендер Жрец', 'Рено Жрец', 'Сырный Разбойник', 'Без интервала Друид', 'Мем Маг']);
  assert.deepEqual(FUN_DECKS_SORTS.map(sort => sort.label), ['Свежие', 'Индекс фана', 'Надёжный винрейт', 'Дальше от меты']);
});

test('decks equal on every sort key keep the order the API sent', () => {
  const twins = [funDeck('Второй по списку'), funDeck('Первый по списку')];
  for (const { id } of FUN_DECKS_SORTS) assert.deepEqual(titles(orderFunDecks(twins, id)), ['Второй по списку', 'Первый по списку'], id);
});

test('every deck carries up to three Russian reasons and never an internal code', () => {
  const why = (index: number, pinned: Parameters<typeof funDeckWhy>[1] = []) => funDeckWhy(FUN_FIXTURE[index], pinned);
  assert.deepEqual(why(0), ['Пакет: Рено', 'Хайлендер', 'Далеко от меты']);
  assert.deepEqual(why(1), ['Концепт', 'Мем']);
  assert.deepEqual(why(2), ['XL-колода', 'Сыр', 'Далеко от меты'], 'the score arithmetic code standard_balance_boost is not shown');
  assert.deepEqual(why(3), ['Мало общего с метой']);
  assert.deepEqual(why(4), ['Пакет: Рено', 'Хайлендер', 'XL-колода'], 'five reasons, three shown');
  assert.deepEqual(why(4, ['concept']), ['Концепт', 'Пакет: Рено', 'Хайлендер'], 'a tag the reader filters by is always on the card');
  const reasons = (...codes: string[]) => funDeckWhy({ reasons: codes });
  assert.deepEqual(reasons('card_package', 'pkg:a_package_from_the_future'), ['Пакет карт']);
  assert.deepEqual(reasons('card_package', 'pkg:odd_even', 'rare_archetype_name'), ['Пакет: Чёт/нечёт', 'Редкий архетип']);
  assert.deepEqual(reasons('title_mismatch_vs_nearest', 'standard_balance_boost', 'wild_concept_boost', 'xl_hl_diversity_tax',
    'neutral_package', 'pkg:quest_package', 'pkg:xl_package', 'a_code_from_the_future'), []);
  assert.deepEqual(funDeckWhy({ reasons: [] }), []);
  assert.deepEqual(reasons('valueOf', 'constructor', 'pkg:toString', 'pkg:constructor'), [], 'a code named like an Object method is not a reason');
});

test('the win rate interval and the few-games note appear only when the data supports them', () => {
  assert.deepEqual(funDeckInterval(FUN_FIXTURE[0]), { low: 47, high: 61 });
  assert.equal(funDeckInterval(FUN_FIXTURE[3]), null, 'a dataset from before concept-v7 has no interval');
  assert.equal(funDeckInterval({ winRateCiLow: 70, winRateCiHigh: 60 }), null);
  assert.equal(funDeckInterval({ winRateCiLow: 50, winRateCiHigh: null }), null);
  assert.deepEqual([99, 100, 120, null].map(games => funDeckHasFewGames({ games })), [true, false, false, false]);
});

test('class and tag filters work together with format and search, and a sort still applies', () => {
  const pick = (patch: Partial<FunDecksView>, access = true) => titles(selectFunDecks(FUN_FIXTURE, { ...DEFAULT_FUN_DECKS_VIEW, ...patch }, access));
  assert.deepEqual(pick({ classes: ['priest'], tags: ['highlander'], sort: 'reliable' }), ['Рено Жрец', 'Хайлендер Жрец']);
  assert.deepEqual(pick({ classes: ['priest'], tags: ['highlander'], sort: 'reliable', format: 'wild' }), ['Хайлендер Жрец']);
  assert.deepEqual(pick({ classes: ['priest'], tags: ['meme'] }), [], 'no priest is a meme: an empty result, not an error');
  assert.deepEqual(pick({ classes: ['priest', 'rogue'], sort: 'distant' }), ['Хайлендер Жрец', 'Рено Жрец', 'Сырный Разбойник'], 'a class filter takes any of its classes');
  assert.deepEqual(pick({ tags: ['meme', 'cheese'] }), ['Мем Маг', 'Сырный Разбойник'], 'a tag filter takes any of its tags, found in every reason code of the deck');
  assert.deepEqual(pick({ tags: ['xl'], sort: 'fun' }), ['Хайлендер Жрец', 'Сырный Разбойник']);
  assert.deepEqual(pick({ query: 'меха' }), ['Рено Жрец'], 'the search finds the Russian name of the nearest archetype');
  assert.deepEqual(pick({ query: 'жрец', classes: ['priest'], format: 'standard' }), ['Рено Жрец']);
});

test('a guest\'s filters narrow the three open decks and never open another', () => {
  const guest = (patch: Partial<FunDecksView>) => titles(selectFunDecks(FUN_FIXTURE, { ...DEFAULT_FUN_DECKS_VIEW, ...patch }, false));
  assert.deepEqual(guest({}), ['Мем Маг', 'Сырный Разбойник', 'Рено Жрец']);
  assert.deepEqual(guest({ classes: ['priest'] }), ['Рено Жрец'], 'the second priest deck stays behind the subscription');
  assert.deepEqual(guest({ classes: ['priest'], tags: ['xl'] }), [], 'the xl priest deck is not among the open three');
  assert.deepEqual(guest({ sort: 'reliable', classes: ['priest'] }), ['Рено Жрец', 'Хайлендер Жрец'],
    'a sort chooses which three are open, as the fun sort always did: the three most reliable here');
  assert.deepEqual(guest({ sort: 'reliable', classes: ['mage'] }), [], 'and a filter narrows only those three');
});

test('the filters and the sort live in the address as a shareable link', () => {
  assert.deepEqual(readFunDecksQuery('?class=priest,mage&tag=highlander&sort=reliable&format=wild'),
    { format: 'wild', classes: ['priest', 'mage'], tags: ['highlander'], query: '', sort: 'reliable' });
  assert.deepEqual(readFunDecksQuery(''), DEFAULT_FUN_DECKS_VIEW);
  assert.deepEqual(readFunDecksQuery('?class=goblin&tag=&sort=banana&format=arena'), DEFAULT_FUN_DECKS_VIEW, 'unknown values are ignored');
  assert.equal(writeFunDecksQuery('?id=story&page=fun-decks', { ...DEFAULT_FUN_DECKS_VIEW, classes: ['priest'], tags: ['highlander', 'xl'], sort: 'reliable', query: 'искомое' }),
    '?id=story&page=fun-decks&class=priest&tag=highlander,xl&sort=reliable', 'foreign parameters stay, the search text is not kept');
  assert.equal(writeFunDecksQuery('?class=priest&sort=fun&format=wild', DEFAULT_FUN_DECKS_VIEW), '', 'defaults leave the address clean');
});

// Property tests: the selection logic holds for any decks, not only the fixture above.
const CLASS_IDS = FUN_DECK_CLASSES.map(item => item.id);
const REASON_CODES = ['meta_core_outlier', 'low_meta_overlap', 'concept_title', 'card_package', 'pkg:odd_even', 'pkg:xl_package', 'neutral_package',
  'rare_archetype_name', 'highlander_shape', 'xl_shape', 'meme_low_winrate', 'cheese_high_winrate', 'title_mismatch_vs_nearest', 'standard_balance_boost'];
const maybe = <T>(arbitrary: fc.Arbitrary<T>) => fc.option(arbitrary, { nil: null });
const deckArbitrary = fc.record({
  code: fc.string({ minLength: 1, maxLength: 6 }),
  format: fc.constantFrom('Standard', 'Wild'),
  className: fc.constantFrom(...CLASS_IDS, 'DEATHKNIGHT', '—'),
  funScore: maybe(fc.double({ min: 0, max: 1, noNaN: true })),
  similarity: maybe(fc.double({ min: 0, max: 1, noNaN: true })),
  ciLow: maybe(fc.integer({ min: 0, max: 100 })),
  winRate: maybe(fc.integer({ min: 0, max: 100 })),
  day: fc.integer({ min: 1, max: 5 }),
  reasons: fc.array(fc.constantFrom(...REASON_CODES), { maxLength: 6 }),
}).map(({ code, format, className, funScore, similarity, ciLow, winRate, day, reasons }) => funDeck(`${format}-${code}`, {
  deckCode: code, format, className, funScore, maxMetaSimilarity: similarity, winRate, reasons,
  winRateCiLow: ciLow, winRateCiHigh: ciLow === null ? null : 100, firstSeenAt: `2026-10-0${day}T00:00:00Z`,
}));
// Decks with distinct identities.
const uniqueDecks = fc.uniqueArray(deckArbitrary, { selector: deck => `${deck.format}:${deck.deckCode}`, maxLength: 12 });
const sortArbitrary = fc.constantFrom(...FUN_DECKS_SORTS.map(sort => sort.id));
const viewArbitrary = fc.record({
  format: fc.constantFrom('all', 'standard', 'wild') as fc.Arbitrary<FunDecksView['format']>,
  classes: fc.subarray(CLASS_IDS), tags: fc.subarray(FUN_DECK_TAGS.map(tag => tag.id)),
  query: fc.constantFrom('', 'a', 'жрец', 'wild'), sort: sortArbitrary,
});
const identities = (decks: FunDeckRow[]) => decks.map(deck => `${deck.format}:${deck.deckCode}`);

test('property: a sort only reorders the decks', () => {
  assertProperty(fc.property(uniqueDecks, sortArbitrary, (decks, sort) => {
    const ordered = orderFunDecks(decks, sort);
    assert.deepEqual(identities(ordered).sort(), identities(decks).sort(), 'no deck lost, none added');
    assert.deepEqual(identities(orderFunDecks(ordered, sort)), identities(ordered), 'sorting again changes nothing');
  }));
});

test('property: each sort puts the larger (or, for distance, the smaller) key first and a missing key last', () => {
  // A deck without a fun index counts as 0, as it always did.
  const keyOf = { fun: (deck: FunDeckRow) => deck.funScore ?? 0, reliable: (deck: FunDeckRow) => deck.winRateCiLow ?? null,
    distant: (deck: FunDeckRow) => deck.maxMetaSimilarity } as const;
  assertProperty(fc.property(uniqueDecks, fc.constantFrom('fun', 'reliable', 'distant'), (decks, sort) => {
    const keys = orderFunDecks(decks, sort).map(keyOf[sort]);
    keys.forEach((key, index) => {
      const next = keys[index + 1];
      if (next === undefined) return;
      if (key === null) assert.equal(next, null, 'a missing key is never followed by a present one');
      else if (next !== null) assert.ok(sort === 'distant' ? key <= next : key >= next, `${sort}: ${key} before ${next}`);
    });
  }));
});

test('property: a filter never adds a deck, and a guest never sees more than the free three', () => {
  assertProperty(fc.property(uniqueDecks, viewArbitrary, (decks, view) => {
    const everything = { ...DEFAULT_FUN_DECKS_VIEW, format: view.format, sort: view.sort };
    const subscriber = identities(selectFunDecks(decks, view, true));
    const open = identities(selectFunDecks(decks, everything, true));
    assert.ok(subscriber.every(identity => open.includes(identity)), 'class, tag and search only narrow the format\'s decks');

    const guest = identities(selectFunDecks(decks, view, false));
    const guestOpen = identities(selectFunDecks(decks, everything, false));
    assert.ok(guest.length <= FUN_DECKS_FREE_PREVIEW_COUNT);
    assert.ok(guest.every(identity => guestOpen.includes(identity)), 'no filter opens a deck beyond the guest\'s open three');
  }));
});

test('property: the reasons on a card are at most three, from the dictionary, and never a code', () => {
  assertProperty(fc.property(fc.array(fc.oneof(fc.constantFrom(...REASON_CODES), fc.string()), { maxLength: 8 }),
    fc.subarray(FUN_DECK_TAGS.map(tag => tag.id)), (reasons, pinned) => {
      const why = funDeckWhy({ reasons }, pinned);
      assert.ok(why.length <= 3);
      assert.equal(new Set(why).size, why.length, 'no reason twice');
      for (const label of why) assert.doesNotMatch(label, /[A-Za-z]{3,}|_/, `"${label}" looks like an internal code`);
    }));
});

test('property: a view survives the trip through the address', () => {
  assertProperty(fc.property(viewArbitrary, view => {
    const back = readFunDecksQuery(writeFunDecksQuery('?id=story', view));
    assert.deepEqual([...back.classes].sort(), [...view.classes].sort());
    assert.deepEqual([...back.tags].sort(), [...view.tags].sort());
    assert.deepEqual([back.format, back.sort, back.query], [view.format, view.sort, '']);
  }));
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
