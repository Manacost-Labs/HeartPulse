# JSON-LD of hearthpulse.net: one organization, no offers, honest lists

Slice S8 of the SEO epic (#367, issue #381). It fixes what every page's JSON-LD
says about the site itself. Page-specific rules (what a `Dataset` may claim,
paid markup, archetypes) stay in `seo-entity-indexing.md` and `seo-foundation.md`.

## Commands and entry points

- `node --import tsx --test tests/seo-structured-data.test.ts` builds the graphs
  and checks them without a server.
- `node --import tsx tests/seo-registry.test.ts` checks the archetype graph.
- `node --test tests/next-seo-page-metadata.test.mjs` reads the JSON-LD from the
  HTML of the built app (`npm run build:next` first).

## Where the markup is built

- `shared/seoOrganization.ts` is the only definition of the `Organization` node.
  It is a TypeScript module, not the registry JSON, because the server-rendered
  copies of the pages (`server/*SeoRoutes.ts`) are compiled with `NodeNext` and
  cannot import JSON from `config/`.
- `config/public-seo-structured-data.json` holds the nodes of registry pages
  (`src/seo/structuredData.ts` finishes them); `shared/entitySeoStructuredData.ts`
  builds the graphs of cards, heroes, the library, listings and cosmetics;
  `apps/public-web/lib/publicGuideTeaserStructuredData.ts` builds guides;
  `src/seo/archetypeStructuredData.ts` builds archetypes (through
  `seoStructuredDataGraphOf`). All markup is server-side; no client code.

## Rules

- **One organization.** Every indexable page that prints JSON-LD prints exactly
  one `Organization` node with `@id` `https://hearthpulse.net/#org`:
  `name` HearthPulse, `url`, `logo`, `sameAs` (the footer's Telegram and Boosty
  channels) and `parentOrganization` Manacost. The content is byte-identical on
  every template. A page that is not indexable prints no graph at all.
- **References resolve in the page.** Every `{"@id": ".../#org"}` is defined in
  the same document, because Google does not resolve an `@id` from another page.
  The same holds for `#website`: the home page declares the `WebSite`; the entity
  and archetype graphs write a `WebSite` object (`@type`, `@id`, name, address)
  where they say `isPartOf`, which is a definition, not a bare reference. A page
  that declares no site (the two Battlegrounds tools) has no `isPartOf`.
- **No `Offer`, no `WebApplication`.** The owner named no subscription price, and
  an application node without price and ratings is shown by validators as an
  element with errors. Tool pages are `WebPage` (name, description, url).
- **`Dataset`.** `isBasedOn` names the sources; `publisher` is `#org`; there is
  no `creator` (the site does not call itself the author of other people's data)
  and no `license` (the site terms are not a licence for the data). The paid
  markup (`WebPageElement` with `cssSelector`, `isAccessibleForFree: false`,
  `hasPart` of a guide) is unchanged.
- **`ItemList`.** Only on a listing page whose entries are in the anonymous
  server HTML, with `ListItem` (`position`, `name`, `url`) for entries the HTML
  prints, at most 100, `numberOfItems` equal to the entries listed, no URL twice,
  no closed field (grades, winrates). The page passes the entries to
  `SeoStructuredData` (`items`); a canonical listing only: a filtered or
  paginated copy lists nothing. Today: `/cosmetics/`,
  `/cosmetics/heroes|coins|pets/` and the card catalog. Listings whose
  entries are loaded in the browser, link to non-canonical addresses, or have no
  page of their own get none.
- **Cosmetics.** A detail page is a graph of `WebPage`, `CreativeWork`,
  `BreadcrumbList` (Главная → Косметика → раздел → предмет, absolute addresses,
  the last one is the canonical address) and `Organization`
  (`buildCosmeticStructuredData`; the Next page and the server copy share it).
  No `Person`: the artist of a card is not named.
