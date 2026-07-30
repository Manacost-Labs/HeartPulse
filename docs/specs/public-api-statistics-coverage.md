# Матрица полноты статистики Public API

Дата ревизии: 2026-07-30. Версия контракта: `1.6.0`.

Эта матрица не считает «полнотой» слепое копирование JSON провайдера. Полнота
означает: каждое известное серверу статистическое значение имеет стабильное
поле API, единицу измерения, nullable-семантику и OpenAPI-схему.

## Constructed

- `/card-statistics`, `/cards/{cardId}/statistics` и
  `/cards/{cardId}/statistics/history`: все сохранённые карточные снимки по
  режиму, рангу и периоду.
- `/meta-statistics`, `/archetypes/{slug}/statistics`,
  `/archetypes/{slug}/statistics/history` и
  `/archetypes/{slug}/analysis`: архетипы, матрица матчапов, история и анализ.
- `/deck-statistics` и `/decks/{deckId}/statistics`: нормализованные агрегаты
  колод и их карточный состав.

## Arena

- `/arena/statistics/classes`: win rate, games, wins, losses, pick rate и доля
  забегов с семью и более победами.
- `/arena/statistics/cards`: все win, pick, inclusion, offer, discard и kept
  показатели, games, score, copies и ArenaSmith.
- `/arena/statistics/legendaries`: группа, key card, все related cards и
  метрики по классам.
- `/arena/statistics/matchups`: направленный win rate и games.

## Battlegrounds

- `/battlegrounds/statistics/heroes`: solo/duos, MMR, период, pick, placement,
  adjusted placement, distribution и composition.
- `/battlegrounds/statistics/heroes/{heroId}`: tavern-up, hero power, combat,
  compositions, lineup, final forms и timestamps.
- `/battlegrounds/statistics/minions`: impact, combat, popularity, games и
  placement с существом и без него.
- `/battlegrounds/statistics/minions/{dbfId}/history`: вся сохранённая история
  или окно до 3650 дней.
- `/battlegrounds/statistics/spells`: games, placement с заклинанием и без него,
  impact и общий sample.
- `/battlegrounds/statistics/tier-lists/{kind}`: heroes, minions, spells,
  trinkets, strategies и все их известные агрегаты.

## Что означает `null`

Поле со значением `null` означает, что выбранный источник или срез его не
публикует. Это отличается от `0`: ноль — реальное измеренное значение.

## Намеренно исключённые классы данных

- API-ключи, cookies и provider tokens: секреты.
- Upstream/media URL: инфраструктурные данные, а не статистика.
- Raw scrape/card JSON, HTML и CSS: нестабильный и потенциально чувствительный
  payload.
- Run/snapshot/database ids: внутренняя реализация хранилища.
- Parser/cache/queue state: операционное состояние.
- Неизвестные новые ключи: требуют определения семантики и версии контракта.

Изображения и карточные данные доступны через отдельные card/image endpoints и
не дублируются в статистических ответах.

## Правило расширения

Когда источник начинает отдавать новый статистический показатель, изменение
считается законченным только после одновременного добавления:

1. нормализации и allowlist-сериализации;
2. unit/contract теста с проверкой redaction;
3. OpenAPI-схемы с единицей измерения и nullable-семантикой;
4. строки в этой матрице или профильной спецификации.
