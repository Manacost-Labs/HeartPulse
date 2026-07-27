# Titan companion refresh and favicon

## Objective

Restore the complete companion-card data for constructed Titans, beginning
with `TTN_737`, and replace the Arena browser icon with the three Hearthstone
assets supplied by the user.

## Runtime and boundaries

- Arena remains a React 19 and Vite 6 application with Node server-side SEO
  documents.
- Companion cards continue to come from the existing `db.kolodahs.ru` Wiki
  ingestion boundary. Arena does not scrape Hearthstone Wiki at request time.
- The parser recognizes Wiki companion sections such as `Choice cards` and
  `Related cards`; Russian card metadata and local card renders continue to
  come from HearthstoneJSON and the existing media cache.
- The scheduled constructed Wiki refresh must process the least recently
  fetched cards first so a fixed batch cannot starve older entries.
- User-provided favicon PNGs are authoritative. Derived ICO and touch icons
  must preserve the artwork and remain local static assets.

## Implementation

1. Refresh `TTN_737` through the existing Wiki metadata, related-card,
   localized render and full-art import pipeline.
2. Display `Choice cards` as `Способности Титана` and retain `Related cards`
   as `Сопутствующие карты`.
3. Route companion card renders through Arena's existing same-origin WebP
   cache while preserving uncropped Wiki full art as separate gallery media.
4. Change the rolling Wiki refresh to oldest-first selection and run it daily.
5. Publish 16, 32 and 96 px favicon PNGs in every HTML entry point, plus a
   multi-size ICO fallback and derived 180/192 px application icons.
6. Add a static contract test for image dimensions, ICO entries and HTML
   declarations.

## Acceptance criteria

- `/standard/cards/wild/TTN_737` shows three Russian Titan abilities and
  `Слуга Примаса`, with four successfully loaded local card images.
- The related-card groups are present in both the data API and the rendered
  production page, and the existing card lightbox still opens and closes.
- The production document advertises the supplied 16/32/96 favicon assets and
  each asset returns a successful response with the expected dimensions.
- The daily rolling timer is active and selects the oldest fetched metadata.
- Targeted tests, build, changed-file Semgrep, secret scan and real-browser
  production checks pass.

## Rollback

- Arena is rolled back by activating the previous immutable release.
- The previous favicon files and sync scripts are retained in timestamped
  server backups.
- The Wiki refresh timer can be restored from its previous unit backup without
  changing stored card data.
