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
- `/standard/meta` owns `HSGuru мета Hearthstone на русском`, supported by deck
  tiers, win rate and popularity. It does not target HSGuru navigation or imply
  affiliation.
- `/standard/archetypes` owns the Hearthstone archetype catalogue, supported by
  archetype pages and HSGuru-sourced deck lists. It does not own the broad meta
  tier-list intent.
- `/standard/matchups` owns the Hearthstone matchup matrix, supported by HSGuru
  statistics. It does not own the broad meta tier-list intent.

Query spelling variants such as `тир лист`, `тирлист`, `БГ`, `Battlegrounds`
and `стратеги` are natural-language variants. They belong in readable Russian
copy where useful, not in repeated keyword blocks.

## Page contract

Each primary landing page must provide:

- a unique, concise title and description aligned with its owned intent;
- exactly one descriptive H1 in prerendered HTML and one H1 after hydration;
- visible introductory copy that explains the page's purpose and data source;
- ordinary crawlable links with descriptive anchors to complementary pages;
- structured data that describes only content visible on that page;
- one self-canonical URL without query-string variants in the sitemap.

HSGuru is identified only as a data source. HearthPulse must not use HSGuru's
brand as its own site or claim partnership, endorsement, or ownership.

## Testing strategy

1. Assert intent ownership and title uniqueness in the SEO registry test.
2. Assert primary H1, visible explanatory copy, internal links and matching
   structured data in generated HTML.
3. Build and run the repository release checks.
4. Verify desktop and mobile rendering, heading structure, console and network
   health in a real Chromium session.

Visible search-intent introductions are owned by the focused
`src/modules/searchLanding` frontend module. Legacy route hosts consume only
its public entrypoint so SEO copy does not add more responsibilities to the
ratcheted Arena and Battlegrounds monoliths.

## Safety and rollback

- Existing routes, canonical paths, access rules and data APIs remain unchanged.
- No new indexable URL is introduced.
- Dynamic statistics keep their current access and freshness behavior.
- Rollback is a normal commit revert; there is no data or schema migration.

## Success criteria

- The four primary landing pages clearly own distinct search intents.
- Arena and Battlegrounds pages expose aligned title, H1 and useful copy.
- `/standard/meta` transparently describes HSGuru as its statistics source.
- Prerender and runtime content agree and do not create duplicate H1 elements.
- Focused tests, full quality/security gates and browser review pass.
