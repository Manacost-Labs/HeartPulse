import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  constructedCardDataNotice,
  constructedCardRequestError,
} from '../src/features/constructedCardRequestState.js';

assert.deepEqual(constructedCardRequestError('detail', 404, ''), {
  title: 'Карта не найдена',
  message: 'Проверьте адрес карты или вернитесь в библиотеку.',
  retry: false,
  notFound: true,
});
assert.deepEqual(constructedCardRequestError('detail', 503, 'upstream private exception'), {
  title: 'Данные карты временно недоступны',
  message: 'Сервис обновляется. Повторите попытку через минуту.',
  retry: true,
  notFound: false,
});
assert.equal(constructedCardRequestError('list', 503, '').title, 'Библиотека карт временно недоступна');
assert.equal(constructedCardRequestError('list', 503, '').retry, true);
assert.doesNotMatch(constructedCardRequestError('detail', 503, 'QA_PRIVATE_ERROR').message, /QA_PRIVATE/,
  'browser copy must not echo internal upstream errors');

assert.equal(
  constructedCardDataNotice({ dataStatus: 'stale', partial: false }),
  'Показываем последнюю сохранённую версию данных. Новое обновление уже запрашивается.',
);
assert.equal(
  constructedCardDataNotice({ dataStatus: 'stale', partial: true }),
  'Часть подробной информации временно недоступна. Основные данные карты восстановлены из библиотеки.',
);
assert.equal(constructedCardDataNotice({ dataStatus: 'fresh', partial: false }), null);
assert.equal(
  constructedCardDataNotice({
    dataStatus: 'fresh',
    partial: false,
    warning: 'Статистика карт временно недоступна.',
  }),
  'Статистика карт временно недоступна.',
  'a fresh raw catalog must still surface a simultaneous statistics outage',
);
assert.match(
  constructedCardDataNotice({
    dataStatus: 'stale',
    partial: false,
    warning: 'Статистика карт временно недоступна.',
  }) || '',
  /сохранённую версию[\s\S]*Статистика карт временно недоступна/,
  'the stale notice must not suppress a simultaneous statistics warning',
);

const standardCardsSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
const cardHistorySource = readFileSync(new URL('../src/features/useConstructedCardHistory.ts', import.meta.url), 'utf8');
assert.match(standardCardsSource, /warning:\s*typeof payload\.warning/,
  'the detail component must pass the server warning into its visible data-state notice');
assert.match(standardCardsSource, /label="Период"/,
  'the catalog must expose the statistics period as a primary visible filter');
assert.match(standardCardsSource, /new URLSearchParams\(\{ format, period,/,
  'the selected period must be sent to the constructed-card API');
assert.match(standardCardsSource, /navigateWithConstructedCardPeriod/,
  'card and back navigation must retain the selected statistics period');
assert.match(cardHistorySource, /\/history\?\$\{params\}/,
  'an entitled card detail must request its persisted statistics history');
assert.match(standardCardsSource, /serverStatsAccess && \(\s*<ConstructedCardHistoryChart/,
  'the history chart must follow the server-side statistics entitlement');

console.log('constructed-card Russian unavailable/stale UI contracts passed');
