# Unified public page headers

## Contract

Public section pages use the heroes banner from the owner's visual reference:
burgundy material, the existing ornamental frame, tavern illustration on the
right and the page's primary title on the left. The home page retains its
original hero, combining its title, paladin, navigation actions and class summary
in one frame. Admin screens keep their workspace headers.

Visible headings use concise labels: «Мета», «Тир-лист карт» and «Тир-лист БГ».
The Fun decks banner omits its update date; the Vicious Syndicate Gold banner
omits its source/update line. Data freshness and provider contracts are unchanged.
Battlegrounds parchment typography must exclude banner descendants so its dark
heading colors do not replace the cream banner text. The card catalog keeps
its rank, period and access badges in the left copy column. Its module-owned
`ConstructedCardsBanner` is exported through `constructedCards/public.ts`;
`constructedCards/public.css` exposes only the banner presentation to the legacy
page composition.

Each page exposes one H1. The private account banner is «Личный кабинет»,
independent of the viewer's display name. Dynamic detail titles remain the
entity's name;
filters, subscription gates, facts, recovery actions and navigation remain
available outside the title area. Long titles wrap without clipping at 320px,
390px, 768px and 1440px. Artwork never covers text and carries no accessible
content. Reduced motion produces no banner animation.

Constructed card and archetype detail pages expose their entity H1 in the
existing identity/metrics header, without a second tavern banner. Archetype
names use the cream display typeface. The identity sits above six aligned
metrics: one row above 1120px, three columns below. The header is one plate:
the class art (`public/archetype-art/classes`, known from the public seed, so
guests see it too and it can lead LCP) spans the whole header, a gradient keeps
the left dense under the title and statistics, and the statistics bar is
semi-transparent with a backdrop blur. For subscribers the archetype's card
art sits on the right at no more than its own size, with masked edges: the
wiki full artwork of one of the five most mulliganed cards, else the
HearthstoneJSON original of the most mulliganed card, requested at 512px with
`trim=1`, which makes the image proxy cut the white square padding. Phones show
the class art only. For subscribers, the build gallery comes
first (from build #1, the largest sample), then history.

The mulligan table is the vendored VaryloUI DataTable on parchment tokens:
card (a decklist tile: rarity edge, a drawn mana gem, the full name as text,
two lines at most, and card art fading in from the right, cut from the trimmed
original at 256px, twice the art area) and one cell per phase (mulligan,
draw, kept) with the impact badge, a bar from the zero line and the sample
under it. Rows have one fixed height,
the table never scrolls sideways on desktop, and on phones (≤820px) each card
is one row with the sorted phase in front and all three phases on tap. A
toolbar sorts by any of the six metrics, explains each phase and exports the
shown rows as CSV with one column per metric. Phases measured on fewer than
100 games are dimmed to 72% and carry a «мало данных» marker; the whole row is
dimmed to 78% when the sorted phase is. The tile previews the full card on
hover or focus and opens it on click or tap.
Card previews and subscription boundaries stay intact.
The source URL was verified from the public Koloda card search for `CAP_105`:
[horizontal artwork](https://api.kolodahearthstone.com/uploads/horizontal-art/constructed_card/CAP_105.webp).

## Detail-page follow-up plan

1. Remove duplicate card/archetype banners and restore entity H1 semantics;
   verify card stories and the archetype browser regression.
2. Adjust dossier contrast/crop and move history before the main build;
   verify 320, 390, 768 and 1440px layouts and guest/subscriber access.
3. Use module-owned Koloda tile URLs with a bounded fallback; verify missing
   assets, sorting and previews in the existing browser test.

Commands: `npm run lint`, `npm run lint:next`, `npm run lint:architecture`,
`npm run test:storybook`, `npm run build-storybook`, `npm run build:next`,
`node tests/constructed-archetypes-browser.test.mjs` and
`node --test tests/next-archetype-details-browser.test.mjs`.
Existing JSX/CSS conventions apply; new image policy belongs in the
constructed-cards module. No dependencies, schema or authorization changes.
Documentation impact: this spec, `apps/public-web/README.md` and `CHANGELOG.md`.

Use the existing shared `SectionBanner` for simple titles and retain the
compatible banner classes for headings with metrics. Banner presentation is
owned by shared UI; route composition supplies titles and contextual content.
No new assets, dependencies or data calls are required. The profile access tour
highlights the status and refresh header so its mobile bottom sheet does not
cover an arbitrarily tall list of access details.

## Working plan and documentation impact

1. Restore the original home hero and shorten the requested section headings.
2. Remove requested banner metadata and isolate route typography;
   test subscriber skins.
3. Build both applications and Storybook, run focused contracts and Semgrep,
   then review public routes and stories in Chrome DevTools MCP.

Documentation impact: this specification, `CHANGELOG.md` and the banner
ownership/preload references in `apps/public-web/README.md`.

Selected skills: agent-resource-index, using-agent-skills, context-engineering,
codegraph, context7, spec-driven-development, planning-and-task-breakdown,
incremental-implementation, test-driven-development, frontend-design,
TypeUI fundamentals, browser-testing-with-devtools, react-best-practices,
frontend-testing-debugging, git-workflow-and-versioning,
documentation-and-adrs, code-review-and-quality, code-simplification and
shipping-and-launch and ci-cd-and-automation.

## Bundle budget evidence

The shared banner stylesheet and recovery headings are now present on every
public route. Reviewed CI gzip sizes exceed the previous ceilings by up to
1.7 KiB on affected routes. JavaScript entries that exceeded the limits use
the existing budget updater's 2% margin and 1 KiB rounding, accounting for
bundler/compression variation across installations. CSS ceilings retain their
256-byte rounding. Unaffected entries and the checks that keep administrator
and paid Battlegrounds assets lazy remain unchanged.

The combined detail-header and navigation release measures the Battlegrounds
tier-list JavaScript at 165,459 gzip bytes locally and 165,512 bytes in CI,
exceeding its previous 164,864-byte ceiling. Its reviewed ceiling is 168,960
bytes under the same 2% margin and 1 KiB rounding rule. No other route limits
or lazy-asset assertions change.

The catalog loading contract checks the blocking-loader guard (`loading &&
!data`), independent of the banner component: filter refreshes keep the current
catalog visible.

The home browser check waits up to ten seconds for the three declared owner
stylesheets after their streamed sections appear, then asserts the same owners
and reports the full state on failure.

## Release verification

Use the existing main-branch CI and immutable release pipeline, then verify
the health endpoint reports the task commit and review representative live
headers on desktop and mobile. On new clipping, navigation failures or client
errors, revert the task commit through the same pipeline. This change replaces
no asset bytes and needs no data migration.

## Archetype polish and Battleground detail follow-up

Goal: a compact archetype identity above six readable, aligned statistics;
clean provider artwork without white margins, and Koloda mulligan tiles for
original/Core card IDs. Exact card-ID and DBF matches take precedence over
Core aliases. Media enrichment never rewrites the statistics identity.
Missing or failed images retain a readable row and working card preview.

Hero and library detail pages omit the duplicate tavern banner. The entity
identity becomes the single H1 for subscribers and guests. Catalog banners,
back links, statistics, variant selection and access gates stay available.

Plan: (1) reproduce/fix media identity matching and add clean full-art URLs;
(2) align the archetype heading/metrics and crop, update its story;
(3) remove duplicate Battleground detail banners and promote identity H1;
(4) verify relevant contracts, Storybook and Chrome at 320/390/768/1440px;
(5) improve anonymous catalog response reuse and measure navigation again.
No new page transition effect or dependency is introduced.

Documentation impact: this spec, `apps/public-web/README.md`, `CHANGELOG.md`
and `docs/specs/public-card-catalog-response-cache.md`.
Work remains on `codex/archetype-polish-20261013` until review.
