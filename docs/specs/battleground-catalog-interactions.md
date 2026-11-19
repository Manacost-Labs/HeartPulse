# Battlegrounds catalog interactions

The subscriber hero and library catalogs must keep the selected mode, MMR,
section and pool separate. A failed Top 1%, 5% or 20% request shows an error;
only the default solo Top 50% may use the labelled legacy snapshot. Hero data
is requested for the active filter, with optional warming on filter intent,
never all eight combinations when the page opens.

Library catalogs reuse successful reads for five minutes in browser memory,
partitioned by the viewer scope provided by the Next composition. Switching
viewers discards the previous scope; late responses cannot repopulate it.
The permission gate remains responsible for access. No data is persisted to
browser storage or serialized into anonymous HTML. Failed reads can retry.

The library keeps one parchment canvas. The results have no second texture,
and card names sit directly below the artwork. Existing timber, tavern and
tribe assets provide the game identity. The advanced panel aligns mechanic,
group and Duo controls, shows its active count, and keeps selected filters
removable when collapsed. Multi-selection within tavern/tribe is inclusive;
separate filter families combine. Search indexes names, IDs and mechanics once
per catalog and defers result rendering while typing.

The first batch contains 36 cards. Normal artwork uses asynchronous decoding;
golden artwork is requested only on pointer intent or keyboard focus.
The existing Show more control reveals further batches of 36 cards.

The advanced-filter toggle keeps identical padding, border and dimensions when
open or closed. Its counter reserves a fixed slot, and its chevron changes
direction without motion. No leading ornament or open-state separator is used.

The hero table uses an ivory surface, a dark brown header, restrained bronze
and green metrics, and neutral tier gutters. The site's tier mark (`TierBadge`,
painted images in `public/tier-marks/`) distinguishes S, A, B, C and D with
gold, copper, amethyst, emerald and sapphire inlay in smooth gold with a
thin dark rim; its `alt` («Тир S») keeps
the rank identifiable without color. Distribution interaction
does not resize bars. Grouped and sorted rows retain keyboard sorting, hero
links, placement labels and readable layouts at 320–1440 px.

The marks are WebP files in three sizes (40, 80 and 160 px) with a
width-descriptor `srcset`; the earlier `public/bg-tier-emblem-*-v1.svg` shields
are gone.

## Implementation and verification

The client module owns request reuse and controls; legacy adapters supply
normalization and transport. Keep new domain policy in
`src/modules/battlegrounds`, tests in `tests/`, stories beside their components.
Follow the existing injected loader and native button/select patterns.

Verify hero fallback isolation and library expiry, failures, deduplication and
viewer switching with clock-controlled tests. Exercise mechanic selection,
reset, empty results, rapid hero changes, error recovery and golden-image intent
in Storybook/browser tests. Review 320, 390, 768 and 1440 px with DevTools MCP,
including network, console, accessibility and screenshots.

Commands: `npm run test:battleground-hero-cache`,
`node_modules/.bin/tsx tests/battleground-library-resource.test.ts`,
`npm run test:registry`, `npm run lint`, `npm run lint:next`,
`npm run lint:architecture`, `npm run test:storybook`,
`npm run build-storybook`, `npm run build:next`, `npm run security:semgrep`.
Do not add dependencies or change upstream providers, authorization, production
configuration, or release state in this task.
