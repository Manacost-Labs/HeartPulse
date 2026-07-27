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
assert.match(standardCardsSource, /warning:\s*typeof payload\.warning/,
  'the detail component must pass the server warning into its visible data-state notice');
assert.match(standardCardsSource, /normalizeConstructedRelatedCardGroups\(card\)/,
  'the detail page must render the localized related-card contract instead of only the legacy wiki list');
assert.match(standardCardsSource, /Токены, награды и связанные карты/,
  'the related-card section must describe tokens, quest rewards, and other companion cards in Russian');
const relatedCardsComponent = standardCardsSource.slice(
  standardCardsSource.indexOf('function RelatedCardGroups'),
  standardCardsSource.indexOf('async function copyText'),
);
assert.match(relatedCardsComponent, /type="button"[\s\S]*constructed-card-detail__related-card-image/,
  'each related-card image must be a semantic lightbox button');
assert.match(relatedCardsComponent, /onOpen\(item\.cardImageUrl!?\)/,
  'the related-card image button must open the shared card lightbox');
assert.doesNotMatch(relatedCardsComponent, /item\.manaCost|<dt>Мана<\/dt>/,
  'related cards must not repeat the mana cost beside the card image');
assert.doesNotMatch(relatedCardsComponent, /item\.wikiUrl|Hearthstone Wiki/,
  'related-card tiles must not include a redundant wiki link');

console.log('constructed-card Russian unavailable/stale UI contracts passed');
