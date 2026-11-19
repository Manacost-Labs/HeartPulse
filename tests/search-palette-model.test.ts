import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archetypeEntry, matchPages, normalizeSearchText, paletteGroups, readRecentEntries, rememberRecentEntry, type PaletteEntry,
} from '../src/components/globalSearch/searchPaletteModel.js';

const pathOf = (entry: PaletteEntry) => (entry.kind === 'article' ? entry.article.url : entry.path);

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test('pages match every word of the query in their name or mode, ignoring case and «ё»', () => {
  assert.equal(normalizeSearchText('  Тир-ЛИСТ  Ёлка '), 'тир-лист елка');
  const tierLists = matchPages('тир-лист', false).map(pathOf);
  assert.deepEqual(tierLists, ['/tierlist/', '/battlegrounds/tier-list/', '/battlegrounds/tier-builder/']);
  assert.deepEqual(matchPages('тир поля', false).map(pathOf), ['/battlegrounds/tier-list/', '/battlegrounds/tier-builder/']);
  assert.ok(matchPages('', false).length > 15, 'an empty query offers every section');
  assert.ok(matchPages('', false).every(entry => pathOf(entry).split('?')[0].endsWith('/')), 'section links carry the canonical slash');
  assert.equal(matchPages('админ', false).length, 0, 'admin pages stay hidden from readers');
  const metas = Object.fromEntries(matchPages('', false).map(entry => [pathOf(entry), entry.meta]));
  assert.equal(metas['/standard/patches/'], '', 'a unique section name needs no mode');
  assert.equal(metas['/standard/meta/'], 'Стандарт', 'a Standard page that has a Wild twin carries its mode');
  assert.equal(metas['/standard/meta/?format=wild'], 'Вольный', 'the Wild twin is found and labelled with its mode');
  assert.equal(metas['/standard/cards/wild/'], 'Вольный');
  assert.deepEqual(matchPages('матчапы вольный', false).map(pathOf), ['/standard/matchups/?format=wild']);
  assert.equal(matchPages('', false).filter(entry => entry.label === 'Патчноуты').length, 1, 'patch notes are one page, not one per mode');
  assert.equal(matchPages('', false).filter(entry => entry.label === 'VS Gold').length, 1, 'VS Gold has no Wild page');
  assert.equal(metas['/tierlist/'], 'Арена', 'a repeated name carries its mode');
  assert.equal(matchPages('админ', true).length, 1);
  // The palette names the groups as the menu does.
  assert.ok(matchPages('сообщество', false).map(pathOf).includes('/leaderboards/'));
  assert.ok(matchPages('стандарт', false).map(pathOf).includes('/standard/deck-builder/'));
  assert.ok(matchPages('вольный', false).map(pathOf).includes('/standard/deck-builder/?format=wild'));
  assert.equal(matchPages('разное', false).length, 0, 'the old «Разное» group is gone');
});

test('archetypes link to their own pages by format', () => {
  const entry = archetypeEntry({ slug: 'summoner-mage', archetypeLabel: 'Манашторм Маг', archetype: 'Summoner Mage', classKey: 'mage', format: 'wild' });
  assert.deepEqual(entry, { kind: 'archetype', id: 'archetype:wild:summoner-mage', label: 'Манашторм Маг', meta: 'Вольный',
    path: '/standard/archetypes/wild/summoner-mage/', classKey: 'mage' });
});

test('recent picks are newest first, unique, bounded and only same-site', () => {
  const storage = memoryStorage();
  const page = (id: string): PaletteEntry => ({ kind: 'page', id, label: id, meta: '', path: `/${id}/` });
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) rememberRecentEntry(storage, page(id));
  assert.deepEqual(readRecentEntries(storage).map(entry => entry.id), ['b', 'f', 'e', 'd', 'c']);
  const hostile = memoryStorage({ 'hp:search:recent': JSON.stringify([
    { kind: 'page', id: 'x', label: 'x', meta: '', path: '//evil.example/' },
    { kind: 'card', id: 'y', label: 'y', meta: '', path: 'https://evil.example/' },
    { kind: 'page', id: 'ok', label: 'ok', meta: '', path: '/ok/' },
  ]) });
  assert.deepEqual(readRecentEntries(hostile).map(entry => entry.id), ['ok']);
  assert.deepEqual(readRecentEntries(memoryStorage({ 'hp:search:recent': '{broken' })), []);
  assert.deepEqual(readRecentEntries(null), []);
});

test('the palette shows recents for an empty query and remote groups only for a query', () => {
  const recent: PaletteEntry[] = [{ kind: 'page', id: 'page:tierlist', label: 'Тир-лист', meta: 'Арена', path: '/tierlist/' }];
  const remote = {
    archetypes: [{ slug: 'evenlock', archetypeLabel: 'Чётный чернокнижник', archetype: 'Even Warlock', classKey: 'warlock', format: 'standard' as const }],
    cards: [], articles: [],
  };
  assert.deepEqual(paletteGroups({ query: '', admin: false, recent, ...remote }).map(group => group.id), ['recent', 'pages']);
  assert.deepEqual(paletteGroups({ query: 'чёт', admin: false, recent, ...remote }).map(group => group.id), ['archetypes']);
  assert.deepEqual(paletteGroups({ query: 'мета', admin: false, recent, ...remote }).map(group => group.id), ['pages', 'archetypes']);
});
