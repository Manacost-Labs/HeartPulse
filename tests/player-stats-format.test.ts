import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLASS_LABELS,
  MODE_LABELS,
  PERIOD_OPTIONS,
  cardImageUrl,
  classIconUrl,
  comparison,
  formatDuration,
  formatGameDate,
  formatNumber,
  formatPercent,
  formatSigned,
  rankLabel,
} from '../src/modules/playerStats/model/format.js';

// Russian number formatting groups thousands with a no-break space.
const NBSP = ' ';

test('statistics numbers read the Russian way, and a missing value is a dash', () => {
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(12_345), `12${NBSP}345`);
  assert.equal(formatNumber(3.14159, 2), '3,14');
  assert.equal(formatNumber(2, 1), '2,0');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(54.27), '54,3%');
  assert.equal(formatPercent(50), '50%');
});

test('a change shows its sign, and no change shows none', () => {
  assert.equal(formatSigned(null), '—');
  assert.equal(formatSigned(0), '0');
  assert.equal(formatSigned(1.5, 1), '+1,5');
  assert.equal(formatSigned(-1_234), `−1${NBSP}234`);
});

test('play time is shown in minutes, then hours and minutes, then whole hours', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(59 * 60 + 29), '59 мин');
  assert.equal(formatDuration(3_600), '1 ч');
  assert.equal(formatDuration(2 * 3_600), '2 ч');
  assert.equal(formatDuration(9 * 3_600 + 59 * 60), '9 ч 59 мин');
  assert.equal(formatDuration(10 * 3_600 + 40 * 60), '10 ч');
  assert.equal(formatDuration(12_000 * 3_600), `12${NBSP}000 ч`);
});

test('a game date shows the day, short month and time', () => {
  const zone = process.env.TZ;
  process.env.TZ = 'Europe/Moscow';
  try {
    assert.equal(formatGameDate(Date.UTC(2026, 9, 5, 11, 7)), '5 окт., 14:07');
  } finally {
    process.env.TZ = zone;
  }
});

test('every ladder league has its name and star rank', () => {
  assert.equal(rankLabel({ starLevel: 10, stars: 0, legendRank: null }), 'Бронза 1');
  assert.equal(rankLabel({ starLevel: 11, stars: 0, legendRank: null }), 'Серебро 10');
  assert.equal(rankLabel({ starLevel: 21, stars: 0, legendRank: null }), 'Золото 10');
  assert.equal(rankLabel({ starLevel: 35, stars: 0, legendRank: null }), 'Платина 6');
  assert.equal(rankLabel({ starLevel: 41, stars: 0, legendRank: null }), 'Алмаз 10');
  assert.equal(rankLabel({ starLevel: 51, stars: 0, legendRank: 12_345 }), `Легенда №12${NBSP}345`);
});

test('the period, mode and class filters carry their Russian labels', () => {
  assert.deepEqual(PERIOD_OPTIONS, [
    { value: 'all', label: 'Всё время' },
    { value: 'season', label: 'Сезон' },
    { value: '90', label: '90 дней' },
    { value: '30', label: '30 дней' },
    { value: '7', label: '7 дней' },
  ]);
  assert.deepEqual(MODE_LABELS, { battlegrounds: 'Поля сражений', standard: 'Стандарт', wild: 'Вольный', arena: 'Арена' });
  assert.deepEqual(CLASS_LABELS, {
    DEATHKNIGHT: 'Рыцарь смерти',
    DEMONHUNTER: 'Охотник на демонов',
    DRUID: 'Друид',
    HUNTER: 'Охотник',
    MAGE: 'Маг',
    PALADIN: 'Паладин',
    PRIEST: 'Жрец',
    ROGUE: 'Разбойник',
    SHAMAN: 'Шаман',
    WARLOCK: 'Чернокнижник',
    WARRIOR: 'Воин',
  });
});

test('class icons and card renders come from the site', () => {
  assert.equal(classIconUrl('DEMONHUNTER'), '/class_icon/ui/demonhunter-64.webp');
  assert.equal(cardImageUrl('BG24_HERO 100'), '/api/card-image/BG24_HERO%20100/thumb.webp');
});

test('the personal number is compared with the global one in the player’s favour', () => {
  assert.equal(comparison(null, 4), null);
  assert.equal(comparison(4, null), null);
  assert.equal(comparison(4.2, 3.8, true)?.tone, 'worse');
  assert.equal(comparison(3.8, 4.2, true)?.tone, 'better');
  assert.deepEqual(comparison(50, 50), { delta: 0, tone: 'even' });
  assert.deepEqual(comparison(4, 4, true), { delta: 0, tone: 'even' });
  // 50.1 + 0.2 in floating point: a rounding difference is no difference.
  assert.equal(comparison(50.300000000000004, 50.3)?.tone, 'even');
});
