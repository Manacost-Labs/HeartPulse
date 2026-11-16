import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import type { SubscriptionMetrics as ServerMetrics } from '../server/modules/subscriptionAnalytics/contract.js';
import { normalizeSubscriptionMetrics } from '../server/modules/subscriptionAnalytics/public.js';
import type { SubscriptionMetrics } from '../src/modules/subscriptionAnalytics/model/types.js';
import {
  buildSubscriptionTiles,
  describeCodes,
  formatCount,
  formatDataAge,
  formatPercent,
  formatRub,
  formatSignedCount,
  isSubscriptionDataStale,
  limitationText,
  unavailableText,
} from '../src/modules/subscriptionAnalytics/public.js';
import { propertyRuns } from './helpers/propertyRuns.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/boosty-subscription-metrics-sample-20261111.json', import.meta.url), 'utf8')) as SubscriptionMetrics;
const NBSP = ' ';

describe('плитки на образце', () => {
  const tiles = Object.fromEntries(buildSubscriptionTiles(sample).map(tile => [tile.id, tile]));

  it('дают литеральные значения', () => {
    assert.equal(tiles.paidNow!.value, 414);
    assert.equal(tiles.netChange!.value, 123);
    assert.equal(tiles.netChange!.text, '+123');
    assert.equal(tiles.newStarts!.value, 280);
    assert.equal(tiles.returnedStarts!.value, 55);
    assert.equal(tiles.endsToFree!.value, 133);
    assert.equal(tiles.endsLeft!.value, 79);
    assert.equal(tiles.retention30!.value, 72.4);
    assert.equal(tiles.retention30!.text, `72,4${NBSP}%`);
    assert.equal(tiles.nominalValue!.value, 79942);
    assert.equal(tiles.nominalValue!.text, `79${NBSP}942${NBSP}₽`);
    assert.equal(tiles.averageTariff!.value, 193.1);
    assert.equal(tiles.averageTariff!.text, `193${NBSP}₽`);
  });

  it('отток берётся по последнему полному месяцу, а не по неполному текущему', () => {
    assert.equal(tiles.lastFullMonthChurn!.value, 17.1);
    assert.equal(tiles.lastFullMonthChurn!.label, 'Отток, октябрь 2026');
    assert.equal(tiles.lastFullMonthChurn!.hint, `Ушли 57 из 334 на начало месяца`);
  });

  it('без полного месяца и без удержания значения пустые, а не нулевые', () => {
    const bare: SubscriptionMetrics = { ...sample, months: sample.months.map(m => ({ ...m, partial: true })), retention: [] };
    const empty = Object.fromEntries(buildSubscriptionTiles(bare).map(tile => [tile.id, tile]));
    assert.equal(empty.lastFullMonthChurn!.value, null);
    assert.equal(empty.lastFullMonthChurn!.text, '—');
    assert.equal(empty.retention30!.value, null);
  });
});

describe('тексты кодов', () => {
  it('у каждого кода unavailable и limitations из образца есть свой русский текст', () => {
    for (const code of sample.unavailable) {
      assert.match(unavailableText(code), /[А-Яа-я]/, code);
      assert.notEqual(unavailableText(code), unavailableText('__unknown__'), code);
    }
    for (const code of sample.limitations) {
      assert.match(limitationText(code), /[А-Яа-я]/, code);
      assert.notEqual(limitationText(code), limitationText('__unknown__'), code);
    }
  });

  it('неизвестный код — запасной текст, не исключение; служебные имена объекта не ломают поиск', () => {
    for (const code of ['new_code', '', 'valueOf', 'constructor', '__proto__', 'toString']) {
      assert.equal(typeof limitationText(code), 'string');
      assert.equal(typeof unavailableText(code), 'string');
    }
    assert.equal(limitationText('valueOf'), limitationText('new_code'));
    assert.deepEqual(describeCodes(['poll_gaps', 'poll_gaps', 'new_code', ''], 'limitations').map(item => item.code), ['poll_gaps', 'new_code']);
  });
});

describe('форматирование', () => {
  it('неразрывные пробелы U+00A0, не U+202F', () => {
    assert.equal(formatCount(1234567), `1${NBSP}234${NBSP}567`);
    assert.equal(formatRub(1234.4), `1${NBSP}234${NBSP}₽`);
    assert.equal(formatPercent(100), `100${NBSP}%`);
    assert.equal(formatPercent(0), `0${NBSP}%`);
    assert.equal(formatSignedCount(-1500), `−1${NBSP}500`);
    assert.equal(formatSignedCount(0), '0');
  });

  it('property: в тексте нет U+202F и обычного пробела между цифрами и знаком', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), value => {
        for (const text of [formatCount(value), formatSignedCount(value), formatRub(value), formatPercent(value)]) {
          assert.doesNotMatch(text, /[  ]/);
        }
      }),
      propertyRuns,
    );
  });
});

describe('свежесть данных', () => {
  const polledAt = Date.parse(sample.coverage.lastAcceptedPollAt!);

  it('устарело, когда последний опрос Boosty старше 15 минут', () => {
    assert.equal(isSubscriptionDataStale(sample, polledAt + 14 * 60_000), false);
    assert.equal(isSubscriptionDataStale(sample, polledAt + 15 * 60_000), false);
    assert.equal(isSubscriptionDataStale(sample, polledAt + 15 * 60_000 + 1), true);
  });

  it('опросов нет или время нечитаемо — устарело', () => {
    const none = { ...sample, coverage: { ...sample.coverage, lastAcceptedPollAt: null } };
    assert.equal(isSubscriptionDataStale(none, polledAt), true);
  });

  it('возраст по-русски', () => {
    assert.equal(formatDataAge(null), null);
    assert.equal(formatDataAge(2_000), 'только что');
    assert.equal(formatDataAge(21_000), '21 секунду назад');
    assert.equal(formatDataAge(42_000), '42 секунды назад');
    assert.equal(formatDataAge(5 * 60_000), '5 минут назад');
    assert.equal(formatDataAge(2 * 3_600_000), '2 часа назад');
  });
});

describe('контракт клиента и сервера', () => {
  it('клиентские типы и серверный нормализатор описывают один и тот же ответ', () => {
    // Проверка типов делается в `npm run lint`: присваивание в обе стороны ломается, если копии разошлись.
    const fromServer: SubscriptionMetrics = normalizeSubscriptionMetrics(sample);
    const backToServer: ServerMetrics = fromServer;
    assert.deepEqual(backToServer, sample);
  });
});
