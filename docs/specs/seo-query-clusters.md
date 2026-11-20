# SEO query clusters: Arena, Battlegrounds and HSGuru

## Objective

Strengthen existing canonical HearthPulse pages for Russian search intent around
Arena tier lists, Battlegrounds tier lists and strategies, and HSGuru-powered
constructed statistics. The implementation must improve search clarity without
creating doorway pages, duplicating content, or implying affiliation with a
third-party data source.

## Search intent ownership

- `/tierlist` owns `тир-лист Арены Hearthstone`, supported by card-tier and
  best-card intent. It does not target Battlegrounds tiers.
- `/battlegrounds/tier-list` owns `тир-лист Полей сражений Hearthstone`,
  supported by composition, minion, spell and trinket tiers. It does not target
  the builder and does not use the word «герои» (that query belongs to
  `/heroes`).
- `/battlegrounds/strategies` owns `конструктор стратегий Полей сражений`,
  supported by composing and visualising a plan. It does not rank strategies.
- `/heroes` owns `герои Полей сражений`, supported by hero powers and tiers.
  The two pages link to each other in their HTML; there is no redirect.
- `/standard/meta` owns `мета Hearthstone` and `мета хартстоун` with the month of
  the data, supported by deck tiers, win rate and popularity. HSGuru is named
  only as the source in the description and on the page, never at the start of
  the title; it does not target HSGuru navigation or imply affiliation.
- `/standard/archetypes` owns the Hearthstone archetype catalogue, supported by
  archetype pages and HSGuru-sourced win rates. Deck codes are paid and the
  snippet does not promise them. It does not own the broad meta tier-list
  intent.
- `/standard/matchups` owns the Hearthstone matchup matrix, supported by HSGuru
  statistics. It does not own the broad meta tier-list intent.

Query spelling variants such as `тир лист`, `тирлист`, `Battlegrounds`
and `стратеги` are natural-language variants. The site writes «Поля сражений»
in full (second word in lower case); «БГ» is not used in titles,
descriptions, headings or labels. They belong in readable Russian
copy where useful, not in repeated keyword blocks.

## Query to page

Title is at most 60 characters in any month; description is 70–160; no two
pages of the registry share a title, a description or an H1
(`tests/next-seo-page-metadata.test.mjs`).

- Query «мета Hearthstone»: `/` (H1 «Мета Hearthstone на сегодня») and
  `/standard/meta` (H1 «Мета Hearthstone: колоды и винрейты», title
  `Мета Hearthstone, {month}: колоды и винрейты`, no brand when it does not
  fit).
- «винрейт классов Арены»: `/classes`, H1 «Винрейт классов на Арене».
- «тир-лист Арены»: `/tierlist`, H1 «Тир-лист карт Арены Hearthstone».
- «легендарки Арены»: `/legendaries`, H1 «Легендарки Арены Hearthstone».
- «герои Полей сражений»: `/heroes`, H1 «Герои Полей сражений», title
  `Герои Полей сражений Hearthstone: способности и тиры`.
- «тир-лист Полей сражений»: `/battlegrounds/tier-list`, H1 «Тир-лист Полей
  сражений», title `Тир-лист Полей сражений Hearthstone, {year} | HearthPulse`.
- «конструктор стратегий»: `/battlegrounds/strategies`, H1 «Конструктор
  стратегий Полей сражений».
- «косметика Hearthstone»: `/cosmetics`, H1 «Косметика Hearthstone»;
  «скины героев»: `/cosmetics/heroes`, H1 «Скины героев».
- «карты Hearthstone»: `/standard/cards` (H1 «Карты Hearthstone»),
  `/standard/cards/standard` («…: Стандарт»), `/standard/cards/wild`
  («…: Вольный формат»), each with its own title and description.

## Detail page titles

One builder (`shared/entityPageTitles.ts`) serves Express, Next and the
browser. A title is a ladder of variants: the first one up to 60 characters
wins, the brand goes first, then the filler words; what makes the page unique
(the set of a card and «Вольный» on its Wild page, the ID of a hero skin) stays
in every variant. A name too long for every variant keeps the shortest one.

- Card: `<Название> — карта Hearthstone (<набор>) | HearthPulse`, on the Wild
  page `(Вольный, <набор>)`. A name repeats across reprints but not together
  with its set inside one format (whole catalog checked 2026-11-20); a card
  without a set falls back to `(<формат>, <ID>)`. The description leads with
  the facts: `<Название> — карта <класса>: <тип> <атака>/<здоровье> за <N>
  маны, <редкость>, набор «<набор>». <текст правил>`; the Wild page adds
  `(Вольный формат)` after the name.
- Hero skin: `<Название> — скин героя (<класс>, <ID>) | HearthPulse`.
- Coin, pet: `<Название> — монета Hearthstone | HearthPulse`, `… — питомец …`.
- Battlegrounds card: `<Название> — существо Полей сражений | HearthPulse`,
  `(архив)` after «Полей сражений» for the archive.
- Archetype, guide: the name; the brand and the month go first when it is
  too long.

## Page contract

Each primary landing page must provide:

- a unique, concise title and description aligned with its owned intent;
- exactly one descriptive H1 in prerendered HTML and one H1 after hydration;
- a compact heading; data-source context belongs beside the relevant controls or
  statistics, without repeated introductory paragraphs;
- ordinary crawlable navigation links; repeated related-section link blocks are
  not required;
- structured data that describes only content visible on that page;
- one self-canonical URL without query-string variants in the sitemap.

HSGuru is identified only as a data source. HearthPulse must not use HSGuru's
brand as its own site or claim partnership, endorsement, or ownership.

## Testing strategy

1. Assert intent ownership and title uniqueness in the SEO registry test.
2. Assert primary H1, navigation links and matching
   structured data in generated HTML.
3. Build and run the repository release checks.
4. Verify desktop and mobile rendering, heading structure, console and network
   health in a real Chromium session.

Compact search-intent headings are owned by the focused
`src/modules/searchLanding` frontend module. Legacy route hosts consume only
its public entrypoint so headings do not add more responsibilities to the
ratcheted Arena and Battlegrounds monoliths.

## Safety and rollback

- Existing routes, canonical paths, access rules and data APIs remain unchanged.
- No new indexable URL is introduced.
- Dynamic statistics keep their current access and freshness behavior.
- Rollback is a normal commit revert; there is no data or schema migration.

## Success criteria

- The four primary landing pages clearly own distinct search intents.
- Arena and Battlegrounds pages expose aligned title and H1 without repeated
  keyword introductions.
- `/standard/meta` identifies HSGuru in its heading as the statistics source.
- Prerender and runtime content agree and do not create duplicate H1 elements.
- Focused tests, full quality/security gates and browser review pass.
