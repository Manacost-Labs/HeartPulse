# Meta Intelligence Lab — итог обсуждения

## Цель

Создать закрытый аналитический контур для Hearthstone Standard и Wild на API-сервисе. Он должен раньше массовой меты находить перспективные колоды, хранить доказательства изменений и помогать редакции выбирать темы для обзоров.

Первый MVP работает только через внутренний API-preview. Основной сайт, автопубликация и пользовательские уведомления в него не входят.

## Что уже собирает HSGuru-контур

- мета архетипов Standard и Wild: популярность, игры, винрейт, средние ходы, длительность и climbing speed;
- matchup-матрицы;
- готовые сборки: deck code, класс, список карт, игры, винрейт и URL;
- колоды стримеров;
- карточную аналитику: mulligan, drawn и kept impact;
- off-meta/fun decks, производные от streamer candidates.

Основной пробел — не первичные данные, а неизменяемая история снимков, проверяемая свежесть и движок доказательных сигналов.

## Бюджет HSGuru / Scrape.do

Фактические данные:

- около 15 000 HSGuru-запросов в месяц;
- около 382 000 Scrape.do credits;
- средняя цена успешного ответа — около 25,5 credits;
- средняя длительность ответа — около 20 секунд.

Утверждённая рамка:

| Назначение | Плановый расход в месяц |
| --- | ---: |
| Текущий базовый HSGuru-сбор | ~400 000 credits |
| Hot slices, глубокая аналитика и проверки | ~220 000–250 000 credits |
| Жёсткий лимит HSGuru | 700 000 credits |

Предохранители:

- soft alert: 560 000 credits;
- throttling дорогой глубокой аналитики: 620 000 credits;
- hard limit новых non-critical HSGuru jobs: 700 000 credits;
- базовые critical meta jobs не отключаются автоматически.

Нельзя учащать всю HSGuru matrix: она содержит много комбинаций форматов, рангов и периодов. Вместо этого нужен отдельный контур горячих срезов.

## Расписание MVP

| Данные | Режим |
| --- | --- |
| Полная Standard/Wild meta matrix | Сохранить дважды в сутки |
| Hot meta slices: Legend, Diamond 4–1, Top Legend обоих форматов | Раз в 4 часа |
| Hot matchups: Standard Legend и Wild Legend | Раз в 4 часа |
| Streamer decks | Сохранить текущий почасовой режим |
| Card analytics | Раз в сутки только для топ-40 приоритетных архетипов |
| Deck details | Только при новом или изменившемся варианте |
| Повторный сбор | Только для подтверждения сильного раннего сигнала |

## Основные сущности

### Snapshot

Неизменяемый валидный снимок данных:

- `source_id`, `format`, `rank`, `period`, `patch`;
- `fetched_at`, hash payload, версия парсера;
- стоимость и длительность получения;
- результат validation/completeness gates;
- coverage;
- данные архетипов, матчапов, сборок и streamer evidence.

### Freshness

Свежесть считается отдельно для каждого обязательного среза: `source_id + format + rank + period`.

Срез имеет статус `fresh` только когда:

1. его возраст укладывается в ожидаемый интервал;
2. validation успешна;
3. completeness успешна;
4. coverage выше минимального порога;
5. текущий источник не находится в hard-failure состоянии.

Кэшированный последний валидный результат может быть показан, но обязан иметь явную маркировку `stale` или `cached`, а не `fresh`.

### Signal

Структурированное событие меты:

- тип: `popularity_rise`, `popularity_drop`, `winrate_shift`, `matchup_shift`, `deck_variant_detected`, `streamer_burst`;
- состояние: `observing`, `early`, `confirmed`, `rejected`;
- формат, ранг, архетип и время обнаружения;
- confidence, версия правила и evidence;
- объяснение, основанное на числовых фактах.

## Принцип сигналов

Тренд ищет детерминированный статистический движок, а не LLM.

Например, «Дракон Воин растёт» может стать сигналом только после проверки:

- роста популярности одновременно в нескольких валидных снимках;
- достаточного числа игр;
- изменения винрейта с учётом статистической устойчивости;
- изменения матчапов;
- новых deck variants;
- независимого streamer/social evidence, если оно есть.

Одиночный streamer post или один снимок никогда не создаёт `confirmed` сигнал.

## Роль ИИ

ИИ используется только после появления структурированного события с доказательствами.

Он может:

- подготовить черновик заметки для редактора;
- объяснить тренд игроку простым языком;
- предложить угол обзора;
- перечислить ограничения и недостающие подтверждения.

ИИ не может:

- сам менять confidence;
- подтверждать силу колоды без данных;
- автоматически публиковать материал;
- запускать дорогие scraper jobs.

## Social Radar: X/Twitter и Reddit

X/Twitter и Reddit используют отдельные API и не расходуют Scrape.do budget.

Их роль — раннее обнаружение, а не подтверждение меты. Social evidence не смешивается с HSGuru streamer decks и хранится отдельно:

- платформа;
- автор/источник;
- время публикации;
- ссылка на оригинал;
- deck code и archetype hint;
- trust tier;
- provenance;
- deletion state.

Первый social MVP должен работать только с allowlist доверенных игроков, авторов и сообществ. Социальный сигнал получает подтверждение только после независимых HSGuru-данных.

Секреты API нельзя передавать в чат, коммитить или выводить в логи. Их нужно добавлять непосредственно в защищённое окружение сервиса.

## Первый технический инкремент

Новый модуль в data API:

```text
app/meta_intelligence/
  models.py
  snapshots.py
  freshness.py
  budget.py
  selectors.py
  signals.py
  service.py
  social.py
app/routers/meta_intelligence.py
tests/test_meta_intelligence_*.py
```

Первый инкремент включает:

1. credit ledger и budget limits;
2. append-only snapshot history;
3. детальный freshness contract;
4. hot-slice scheduler;
5. первые детерминированные signals;
6. закрытый read-only preview API.

Реальные X/Reddit calls и ИИ-генерация остаются вторым и третьим инкрементами.

## Preview API

```text
GET /v1/meta-intelligence/health
GET /v1/meta-intelligence/budget
GET /v1/meta-intelligence/signals
GET /v1/meta-intelligence/signals/{signal_id}
GET /v1/meta-intelligence/archetypes/{archetype}/timeline
```

API должно быть защищено существующим preview/admin access control. Никакого UI на основном сайте в MVP.

## Проверка качества

- unit tests на budget thresholds, freshness states и каждый signal rule;
- fixtures на типовые HSGuru payloads без live network;
- integration tests preview API и access control;
- invalid, partial или stale datasets не могут породить confirmed signal;
- shadow mode: сигналы считаются и отображаются только внутренне;
- после накопления истории измеряется точность: стал ли ранний сигнал трендом через 24 часа, 72 часа и неделю.

## Критерий успеха MVP

Редактор видит закрытую ленту сигналов с доказательствами, качеством данных, свежестью и стоимостью получения. Система помогает заметить тему для обзора раньше массовой меты, но не выдаёт неподтверждённые рекомендации игрокам.
