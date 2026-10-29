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
- `/battlegrounds/tier-list` owns `тир-лист БГ Hearthstone`, supported by
  strategy, minion, spell and trinket tiers. It does not target the builder.
- `/battlegrounds/strategies` owns `конструктор стратегий БГ`, supported by
  composing and visualising a plan. It does not rank strategies.
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

Query spelling variants such as `тир лист`, `тирлист`, `БГ`, `Battlegrounds`
and `стратеги` are natural-language variants. They belong in readable Russian
copy where useful, not in repeated keyword blocks.

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
