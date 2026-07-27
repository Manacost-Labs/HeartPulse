import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classFilterOptions,
  numericFilterOptions,
  rarityFilterOptions,
  setFilterOptions,
  statisticSortOptions,
  textFilterOptions,
} from '../src/features/constructedCardFilterOptions.js';

const classOptions = classFilterOptions(['DEATHKNIGHT', 'MAGE']);
assert.deepEqual(classOptions.map(option => option.label), [
  'Все классы',
  'Рыцарь смерти',
  'Маг',
]);
assert.equal(classOptions[0].icon, '/class_icon/all1.png');
assert.equal(classOptions[1].icon, '/class_icon/ui/deathknight-64.webp');
assert.equal(classOptions[2].icon, '/class_icon/ui/mage-64.webp');
assert.doesNotMatch(classOptions.map(option => option.label).join(' '), /\(\d+\)/,
  'class filter options must not display facet counters');

const setOptions = setFilterOptions(['CATACLYSM', 'CORE', 'UNKNOWN_FUTURE_SET']);
assert.equal(setOptions[0].label, 'Все дополнения');
assert.equal(setOptions[1].icon, '/constructed-filter-icons/sets/cataclysm.webp');
assert.equal(setOptions[2].icon, '/constructed-filter-icons/sets/core.webp');
assert.equal(setOptions[3].label, 'Unknown Future Set');
assert.equal(setOptions[3].icon, undefined,
  'future sets must remain usable before a matching logo is synced');

const manaOptions = numericFilterOptions('Любая', '/assets/mana.png');
assert.equal(manaOptions.length, 12);
assert.deepEqual(manaOptions.slice(0, 3), [
  { value: '', label: 'Любая', icon: '/assets/mana.png', iconAlt: '' },
  { value: '0', label: '0', icon: '/assets/mana.png', iconAlt: '' },
  { value: '1', label: '1', icon: '/assets/mana.png', iconAlt: '' },
]);

const rarities = rarityFilterOptions(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']);
assert.deepEqual(rarities.map(option => option.icon), [
  undefined,
  '/assets/common.png',
  '/assets/rare.png',
  '/assets/epic.png',
  '/assets/legendary.png',
]);

const mechanics = textFilterOptions('Все механики', ['TAUNT', 'BATTLECRY'], value => value);
assert.ok(mechanics.every(option => option.icon === undefined),
  'mechanics and other textual filters must not receive decorative icons');

const entitledStatisticSorts = statisticSortOptions(true);
assert.deepEqual(entitledStatisticSorts.map(option => option.label), [
  'В % колод',
  'Победы колод',
  'Сыграно партий',
]);
assert.ok(entitledStatisticSorts.every(option => option.disabled === false));
assert.doesNotMatch(entitledStatisticSorts.map(option => option.label).join(' '), /🔒|Алмаз/,
  'subscribers must not see lock or plan decoration on available sort options');

const lockedStatisticSorts = statisticSortOptions(false);
assert.ok(lockedStatisticSorts.every(option => option.disabled === true));
assert.ok(lockedStatisticSorts.every(option => option.label.startsWith('🔒 ')));
assert.ok(lockedStatisticSorts.every(option => option.label.endsWith(' · Алмаз')));

const filterSource = readFileSync(
  new URL('../src/features/ConstructedCardFilterSelect.tsx', import.meta.url),
  'utf8',
);
assert.match(filterSource, /role="listbox"/);
assert.match(filterSource, /role="option"/);
assert.match(filterSource, /aria-activedescendant=/);
assert.match(filterSource, /event\.key === 'Escape'/);
assert.match(filterSource, /event\.key === 'ArrowDown'/);
assert.doesNotMatch(filterSource, /<select\b/,
  'the custom filter must not fall back to a browser-native select');

console.log('constructed-card filter option contracts passed');
