# Public deck builder

## Objective and acceptance

`/standard/deck-builder/` is available anonymously from the Constructors menu.
Users choose one of the eleven classes and Standard or Wild, browse the same
public catalog as `/standard/cards/`, and add cards to a sticky deck on the right.
Search, mana, rarity, class/neutral, expansion, type, mechanic, minion type and
spell-school filters paginate the catalog in batches of 24. Mana shortcuts
show 0–10+; clicking the selected shortcut clears it. Extra tag filters are
collapsed initially. Reset clears collection filters without changing the deck.
Sorting supports mana, expansion, name, attack, health, class and mechanics,
with ascending/descending order. Changing format also clears the expansion. On phones,
Cards and Deck switch the visible panel without losing either panel's state.

The deck is sorted by mana and name. Each row uses the catalog's Koloda
`images.tile` / `tile_image_url` through the existing public-resource proxy,
at the full width of the list, with readable fallback text if unavailable.
The collection uses the existing wooden rail asset; the selected deck combines
the rail, gold game frame and an inset blue glow. Full-height card renders are
contained in a larger gallery (two columns on phones), never cropped. Desktop
row controls appear on hover, keyboard focus or a tap on the tile. They overlay
the tile instead of consuming an extra row. At least three full normal tiles
remain visible at the checked widths. Rows expose add/remove controls and copy
counts. Code opens in a bounded native dialog with selection, copy and Escape;
it never changes the height of the list. Legendary cards allow one copy,
other cards two.
The existing constructed-deck size rule determines the 30/40-card limit.
Changing class or format with a nonempty deck requires an explicit reset.
The workspace is noindex/nofollow, outside the sitemap and has no canonical.
The editor validates the supported deckbuilding rules below. It is not a
complete game simulator or validator for every Fabled, start-of-game or
card-specific effect.

Save Image renders the nonempty current deck through the existing anonymous
`POST /api/deck/render` integration with Deckview-TG and downloads the returned
image. Loading and failure states permit retry. Copy Code exports the game's
deckstring. Editing during rendering cannot replace the current deck or name;
the downloaded file belongs to the snapshot submitted when Save was pressed.

## Ownership and contracts

- `src/modules/deckBuilder/public.ts`: public editor, catalog adapter, selection
  model and hook. Domain UI performs no raw network calls.
- Next composition injects existing deckstring encoding, deck-size policy and
  Deckview rendering and the existing Russian collection labels.
  Administrative `/deck-builder/` remains separate.
- Facets and mechanic translations come from the same catalog response; codes
  are deduplicated case-insensitively before they enter the controls.
- Catalog: anonymous `GET /api/constructed-cards`, `deckClass` restricts the
  pool to the selected class and neutral cards; `format` controls rotation.
- Only validated identities, integer costs/DBFs and allowlisted image paths
  enter the editor. Third-party image URLs are not fetched directly.
- No schema, credential, authentication, publishing or dependency changes.

Sources: [Deckview HTTP API](https://github.com/Manacost-Labs/Deckview-TG/blob/main/docs/API.md)
and [React effect cleanup](https://react.dev/reference/react/useEffect#fetching-data-with-effects).

## Configurable cards and legality

- Zilliax Deluxe 3000 (`TOY_330`, DBF 102983) requires two different functional
  modules and one cosmetic module. All eight functional modules and available
  cosmetic variants come from the existing localized card-detail relations.
  The first cosmetic variant is selected when a functional module is added;
  users may change it. The preview sums module cost, attack and health.
- E.T.C., Band Manager (`ETC_080`, DBF 90749) requires three band slots.
  The main deck and band share rarity-based copy limits, class and rune rules.
  The current exclusion pool comes from the existing card-detail projection;
  missing or malformed restrictions block selection until a successful retry.
- Boards live under their owner. Removing that owner removes its board.
  Opening E.T.C. clears the band search; closing restores the main filters.
  On phones Configure switches to the card panel automatically.
- Sideboards do not occupy main-deck slots. Next composition passes the owner
  DBF and selected card/count pairs to the existing deckstring encoder.
  Incomplete configurations block code export and image rendering.
- Tourists expose only the destination class's `ISLAND_VACATION` cards through
  the Guest Cards filter, with the expansion fixed. A second Tourist cannot
  be chained. Removing the Tourist keeps selected guest cards visible for
  repair and blocks export until they are removed.
- Death Knights, including a Death Knight Tourist destination, select three
  Blood/Frost/Unholy runes. Increasing one count reduces other counts to stay
  within three. Incompatible cards cannot be added, including inside E.T.C.
  Changing runes may invalidate selected cards; these remain removable and
  block export. Rune choices constrain selection; the game infers them from
  card requirements rather than a separate deckstring field.
- Rune costs and explicit Tourist keywords load lazily from the public
  [HearthstoneJSON card definitions](https://github.com/HearthSim/hearthstonejson-client/blob/main/index.d.ts).
  This same-origin proxy read uses `credentials: omit`, cancellation and a 30-second
  timeout. It occurs only for Death Knights or a selected Tourist. Failure
  offers retry and blocks affected exports rather than assuming legality.
- The 40-card size rule recognizes Prince Renathal, its Core version and
  Timethief Rafaam. Arch-Villain Rafaam does not change the deck size.
  Removing a size modifier from a deck above 30 blocks export until repaired.

The game contracts are described in Blizzard's
[Zilliax expansion overview](https://hearthstone.blizzard.com/en-gb/expansions-adventures/whizbangs-workshop),
[E.T.C. release notes](https://news.blizzard.com/en-gb/article/23921496/25-6-patch-notes)
and [Tourist overview](https://hearthstone.blizzard.com/en-us/expansions-adventures/perils-in-paradise).
Current exclusion data is consumed through the project's catalog projection.

## Verification contract

Unit tests cover copy/size limits, catalog identity and image boundaries,
sideboard limits, owner cleanup, complete module pools, exclusion metadata,
Tourist restrictions and rune compatibility. The guest browser checks actual
encoded sideboards, rendering and image bytes, configuration failure/retry,
mobile Configure, three visible tiles, code dialog bounds, 40-card repair and
Rune/Tourist transitions at 320–1440 px. Storybook covers 15 distinct states
with 10 interaction plays, including the code dialog and configuration errors.

Commands: `npm run lint`, `npm run lint:next`, `npm run lint:architecture`,
`npm run test:public-deck-builder`,
`node --test tests/next-public-deck-builder-browser.test.mjs`,
`npm run test:registry`, `npm run security:semgrep`,
`npm run test:storybook`, `npm run build-storybook`, `npm run build:next`.

Documentation impact: this specification, `docs/architecture/module-boundaries.md`
and `CHANGELOG.md`. The existing public route, permissions and server API
remain accurate; this change adds no endpoint or package dependency.

## Verification evidence

The focused selection/catalog tests and guest browser flow pass, including
cancelled searches, copy limits, confirmed resets, Deckview failure/retry,
downloaded image bytes and decoded deckstring contents. Existing administrative
deck-builder, route, gateway, SEO and Nginx regression checks pass. TypeScript,
architecture, registry, changed-file Semgrep and React checks pass; Next and
Storybook builds succeed.

The built workshop is reviewed at desktop and phone widths; changed
interaction plays must pass before publication. The shared Storybook development
setup returns 404 for `vite-inject-mocker-entry.js`, also reproducible in the
existing workshop; the built workshop has no such failure.

Chrome DevTools review of the local production build used the existing live
catalog and Deckview integration: Koloda tiles load and the generated JPEG
downloads successfully. No clipping or horizontal overflow at 320–1440 px;
the guest flow has no WCAG A/AA axe violations. An unthrottled local trace
reported CLS 0.00; this is lab evidence, not a production performance claim.
The existing Next shell still warns about an unused not-found CSS preload;
there are no new runtime errors or failed application requests.

The changed clean-code gate falls back to a full scan before task integration
and reports an existing, untouched `server/modules/publicApi/cards.ts` file
at 468 lines against a 464-line ceiling. After committing and rebasing onto
current `origin/main`, the gate uses
the actual task diff and passes; the historical fallback finding does
not belong to the deck-builder module.

Publication was authorized by the owner. Integration uses the checked task
branch and the normal immutable release workflow; the handoff records both
the final Git commit and the deployed Production SHA.

## Bundle budget review

A clean build of base `ba0c2b27428a2d472f0cfc084ce1a24af5934d4b`
already measures 165,181 gzip bytes of initial JavaScript for the Battlegrounds
tier list against its old 164,864-byte ceiling. The candidate measures 165,955
bytes: the extra public page changes shared webpack chunks by 774 bytes.
Upstream commit `2400621a78a17951bae39fadaa13a00d284c3a2c` already
recalibrates that ceiling to 168,960 bytes, which also covers the candidate.
This task retains the reviewed upstream ceiling.

The new builder measures 170,257 bytes of initial JavaScript and 32,534 bytes
of CSS. Its own route is now included in `config/next-bundle-budgets.json`,
including the existing protections against eager administrative bundles.

## Integration QA repair

The base commit's hosted browser observatory also fails because pending
feedback precedes the skip link and cumulative charts push the first
archetype build outside its preview intersection range. The shared QA
helper now checks keyboard order and scrolls the build into view before
waiting for the generated image; the product behavior stays as designed.

Catalog touch-target measurement uses instant scrolling so CSS smooth-scroll
cannot leave content-visibility rows off screen when their controls are measured.

Final local integration verification covers all 412 registered test files,
including rerun canonical-host and production smoke contracts after the map
repair. Server build/recovery smoke tests and the corrected authenticated/mobile
browser observatory pass. The representative responsive matrix also passes;
its independent keyboard assertion was then corrected and verified in the
final observatory run. Hosted release validation remains the deployment gate.

## Game-style collection update

Acceptance: existing wood/gold/mana assets, complete card and tile images,
responsive tagged collection controls, and unchanged selection/export behavior.
Focused checks cover query parameters, normalized facets, reset, tile width,
mobile overflow, accessibility and actual image download. Storybook includes
filter interactions and a full 30-card deck alongside existing load/error states.

The expanded filter controls and reused Russian label dictionaries measure
about 175 KiB of initial gzip JavaScript and 33 KiB of CSS in the locked
Next build. Only this route's JS ceiling is recalibrated to 182,272 bytes
(2% margin rounded to KiB); other route and CSS ceilings stay unchanged.

The final 30-card preview keeps Save Image within the desktop viewport.
Phone deck panels also bound the independently scrolling list, keeping the
actions close to the cards instead of below thirty full rows. Local Chrome
DevTools checks find no application errors,
failed images or overflow; the existing unused CSS preload warning remains.
An unthrottled local trace reported LCP 58 ms and CLS 0.00 (lab evidence only).
The browser regression awaits the cleared catalog response before selecting
a card after resetting filters, avoiding actions against the previous result.

## Configuration and layout regression verification

The configuration editors and rune/Tourist policy bring the builder route to
182,989 gzip bytes of initial JavaScript and 33,490 bytes of CSS. The reviewed
JS ceiling is 187,392 bytes (2% headroom rounded up to KiB); CSS and every
other route retain their existing ceilings. No new package is added.

Focused coverage includes 13 unit cases and three browser flows: the full
30/40-card list at five viewport widths, bounded native code dialog, metadata
failures and retries, rune/Tourist legality, module selection, three E.T.C.
cards, decoded exported sideboards and owner removal. Storybook covers all
15 authored states, including ten interaction scenarios.

Rune/Tourist definitions use the existing anonymous `hsjson-api` public
resource proxy, preserving its source allowlist, cache and credential stripping.
The browser direct-host contract and a dedicated cancellation/credential test
protect this boundary.

A live Deckview export accepts the encoded Zilliax board and shows its two
modules and cosmetic card using the renderer’s existing sideboard layout.
It does not synthesize a single combined card image; the exported code,
main-deck count and builder mana/stat preview use the selected configuration.

Final Chrome DevTools review uses the production Next build and real anonymous
card/render APIs. The native code dialog remains visible, centered and inside
the viewport at 1440, 1024, 768, 390 and 320 pixels, including a resize while
open. No horizontal overflow, broken images, console errors or failed fetches
were observed. A local unthrottled trace reports LCP 120 ms and CLS 0.00;
these are lab measurements, not field performance. The current 15-state
Storybook matrix passes all interaction scenarios at desktop and phone widths.
The two indirectly affected administrative fixtures also render without
overflow; the archetype-page fixture has its existing unmocked image 404s.
