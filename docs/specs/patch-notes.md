# Patch notes page

`/standard/patches/` shows the card changes of the two newest Hearthstone
patches that have parsed changes, newest first
(`src/features/PatchNotesView.tsx` and `src/features/patchNotes/`, parchment
styles of the site). `?version=36.6.3` opens one patch of the archive in the
same layout; the cards of other pages and the Radar link to it. The page is
public: no entitlement, no paywall and no viewer data. It has no search,
filters, table of contents, version switcher, highlights, archetype flow or
per-card menus: a patch is its modes, a mode is its cards.

## Source

hs-data-api stores one row per patch in `hearthstone_patches`, refreshed daily
by `hs-data-api-docker-refresh-patches.timer`
(`scripts/seed_hs_manacost_patches.py --all`). A matched row carries the
Russian hs-manacost.ru article as `content_text` and its headings as
`sections`. Express reads `GET /api/patches?limit=500&include_content=1`
(about 4 MB) once per 30 minutes and parses every article
(`server/modules/patchNotes`). An expired copy is served at once while one
background refresh runs; a failed refresh is retried after a minute, not per
request.

Each successful refresh is stored in
`DATA_DIR/patch-notes-v1/last-good.json` (replaced atomically; an archive
without any patch with changes is not stored). Once the before/after pictures
of the two newest patches are read, the copy is stored again with them. After
a restart the API answers at once from this copy while the archive is rebuilt
in the background (stale-while-revalidate): `/standard/patches/` does not
fall to `503` while hs-data-api is slow to send the archive. Every answer
from the copy (the archive list included) is `public, max-age=10`, a version
the copy lacks is `404` with `no-store`, and no card history is read until the
rebuild succeeds. Once a build starts being stored, pictures still on their way
for an older build are never written over it. A copy whose patches miss a
field of the `PatchNotesDetail` contract is reported and not served. Without a
copy (first start, or a damaged file) the first read waits for the archive as
before; if it fails, the API answers `502`.

### Official article supplements

A newly released patch can be supplied by a reviewed Russian transcription of
Blizzard's official notes in `server/modules/patchNotes/data/`. The server
composition passes these articles as `officialArticles`; the ordinary parser,
card lookup, history and meta enrichment apply unchanged. A supplement is used
only while the upstream archive has no parsed changes for that version. A
matched upstream article with changes takes priority, without duplicate archive
entries. Official supplements have no hs-manacost source link; their source
link and footer point to Blizzard. No database schema or scrape schedule changes.

Patch 37.0.2 is transcribed from
<https://hearthstone.blizzard.com/en-us/news/24307311>, published 3 November
2026. Exact before/after changes, Arena and pool notes, refund exceptions and
general rules are preserved; developer commentary is summarized in Russian.

Patch 37.2.0 is transcribed from Blizzard's early look article
<https://hearthstone.blizzard.com/en-gb/news/24316976/an-early-look-at-patch-372-battlegrounds-season-15-2v2-tavern-brawl-and-more>,
published 23 November 2026 (`server/modules/patchNotes/data/official372/`). In
addition to all 69 before/after card changes and the Arena draft update, it
carries optional `poolChanges` (removed, newly added and returning Battlegrounds
minions, tavern spells, minor/major Timewarp cards and trinkets, resolved
against the live Battlegrounds catalog for Russian names and card previews) and
optional `sections` (new mechanics, heroes, functionality update, 40-level
rewards track, 2v2 Tavern Brawl, events, cosmetics and 33 bug fixes). Both
fields are optional on `PatchNotesDetail` and preserved by `last-good.json`.
On the page, `PatchPoolExplorer` renders pool rotations with accessible tab and
status buttons (`Удалены`, `Новые`, `Возвращаются`) and card tooltips/sheets,
and `PatchContentSections` renders overview cards, structured lists and tables
(with button toggles for long lists/tables, without `<details>`, `<select>`,
`<input>` or `<nav>` inside `.hp-patch`).

Both show pictures rather than plain lists (`PatchCardGallery`): pool cards are
library renders through the image proxy, and every new card resolves too, so it
gains its catalog render as soon as the catalog lists it. Until then the
official card library supplies the Russian name, text and render
(`officialRenders.ts`, proxied as the `blizzard` public-resource source); a card
without any picture is drawn as a parchment card. A section may carry a `banner`
and its items `images` (illustrations stored under
`public/assets/patch-notes/37-2/`, with their pixel size; the `ru-*` ones are
the Manacost Telegram overviews with translated card text) and `cards` (heroes
by id as round portraits, hero skins by their kolodahs static render, other
cards resolved by name). Names follow the Russian client: Timewarp is
«малая/ключевая хрономалия», Resilient «Стойкость», Mission «Цель»; hero powers
and skins use their HearthstoneJSON ruRU names. Illustrations open full size in
the site's `MediaLightbox`.

## Parsing contract

- A change is a card name line followed by `До изменения: …` and `После: …`.
  `[Стоимость N]`, `[N-й уровень]` and `A атаки, H здоровья` are read as
  numbers; the rest of the statement is the rule text, diffed word by word.
- A `После:` line without a `До изменения:` line is shown with only the new
  value and counted in `missingBefore`; the page says so. Its kind is a
  rework ("Переработка"), never "Новое", because the article does not state that.
- Battlegrounds trinket cost lists (`Name: a → b` under a "СТОИМОСТИ … АКСЕССУАРОВ"
  heading) and the hero armor table (`Герой Обычная игра Дуэты …`) become
  cost and armor changes.
- Direction (buff or nerf) comes only from numbers: lower cost, higher
  attack, health and armor are better. A tavern-tier move and a text change
  carry no direction, so an entry with only those is a rework
  ("Переработка", ↻; "изменения" is kept for the count of all changes).
- `До изменений:` is read like `До изменения:`. A `(Имя)` line under a card
  name names the hero whose power it is and becomes the subtitle. A
  `Новая стоимость: N` line is a cost change without a before value.
- Headings switch the mode: Полей сражений / Поля сражений → Battlegrounds,
  Арена → Arena, Дуэли, Твист and Наемники → `other` (the entry subtitle
  starts with the mode name), Hearthstone, Стандарт, Вольный, карт →
  Constructed. Other headings keep the current mode.
- A Constructed, Arena or side-mode name is matched to a collectible card by
  its exact Russian name (HearthstoneJSON `ruRU`). A name shared by cards of
  different classes stays unmatched.
- A Battlegrounds name is matched by its Russian or English spelling against
  the kolodahs Battlegrounds catalog (`/api/v1/cards`, `trinkets`, `heroes`,
  `dark-gifts`, `anomalies`, `quests`, `rewards`, `darkmoon-prizes`,
  `timewarped-cards`, read page by page and kept for six hours; a failed
  reload keeps the last good copy). The list heading picks the lesser or
  greater trinket of one name, the armor table picks heroes, and a regular
  card wins over its Timewarped copy. The entry then carries the catalog's
  Russian `name`, the article's spelling in `sourceName` (trinket lists are in
  English), `cardType` and the catalog render in `renderUrl`. A catalog
  render (here and in the full card catalog) is kept only when the site's
  image proxy serves its host and path (`renderUrl.ts`, a subset of
  `shared/publicResourceUrl.ts`, checked by a test);
  any other URL is `null`, and the page shows the HearthstoneJSON render.
- A change heading (`Изменения …`) with no text under it before the next
  heading is reported in `pictureSections`: the article shows those changes
  only as pictures, so the page names them and links the article instead of
  inventing values. Sentences under `Общие изменения` / `Другие изменения`
  are returned as `generalChanges`. Reading stops at the community-link
  footer.
- When builds of different versions share one article (hs-data-api matched
  pre-release builds such as `2.3.0.8108` to the 28.2.3 article), the article
  belongs to the version its title names, else to the highest version; the
  other builds are dropped from the archive.

## Meta impact and history

The API still serves `archetypes` and `history` of each entry; the page of
2026-11-19 no longer shows them (no archetype flow, no earlier-patch links).

- Archetypes belong to the day before the patch, never to today.
  Express keeps a snapshot of the site's archetype catalogs
  (`v1/hsguru/archetypes`, the same cache as the archetype pages) for
  Standard and Wild per Moscow day of their data (the source's
  `fetched_at`): slug, Russian name, class, popularity, win rate, games and
  every listed build as decoded dbf ids
  (`server/modules/patchNotes/archetypeSnapshots.ts`, SQLite in
  `<SERVER_DATA_DIR>/patch-archetype-snapshots-v1/snapshots.sqlite`). Every
  patch refresh and an hourly server job (`BACKGROUND_JOBS_ENABLED`) record
  the day; a later read of a day replaces an earlier one, an older copy
  never does. Daily rows are kept 45 days.
- A patch's day D is the Moscow date of its publication (a timestamp
  without an offset is Moscow time). Once D has come, the snapshots of D−1
  are pinned to the patch version and never change; a format of D−1
  recorded later joins the pin. Pins are never pruned. A patch without a
  D−1 snapshot (every patch before snapshots began) has `meta: null` and
  no archetypes at all; today's catalog is never shown in their place.
- `meta` names the pinned day (`day`, `YYYY-MM-DD`), its HSGuru `period`,
  `updatedAt` (when the source fetched it), the formats it has and the
  `missing` ones, which the page names.
- `archetypes` of a Constructed entry lists the pinned archetypes whose
  listed builds contain any print of the card (original and reprint dbf ids
  from HearthstoneJSON `ruRU`): `decks` of `totalDecks` builds, sorted by
  that share, then by popularity, at most eight.
- "Изменённые карты → затронутые архетипы" closes "Главное в патче": a
  Sankey diagram (Valyro Pro `SankeyChart`, vendored in
  `src/vendor/valyro-ui`) from changed Constructed cards, coloured by buff,
  nerf or rework, to the ten most popular archetypes that play them. A
  flow is the number of the archetype's listed builds with the card
  (`decks`), so an archetype's bar counts card appearances, not distinct
  builds. A card node opens the card page (else its change on this page),
  an archetype node its archetype page; on touch the first tap shows the
  tooltip. The plot is one block 200–360 px tall (30 px per row of the
  taller column). With fewer than three cards, and below 640 px of content,
  the same links are a list: one row per card (its kind mark and name),
  then its archetypes with their class icon and number of builds. It is
  shown only with at least two links. Under its title it says «Архетипы на
  момент выхода патча (данные за 30 сентября 2026 г.)»; a format without a
  snapshot of that day is named in its note.
- A card's archetypes ("В архетипах на момент выхода патча", at most four
  and a count of the rest; builds with the card in the link title) wait
  behind the card's "…" with the rest of its details.
- `history` lists earlier patches of the archive that changed the same card
  (same card id, else the same name and subtitle in the mode), newest first,
  at most six; the page links each to `?version=…#card-<entry id>` from the
  card's "…" ("Менялась в патчах").

## Card art

- `artwork` of a Constructed, Arena or side-mode entry is the Hearthstone Wiki
  full illustration of the resolved card from the site's card catalog
  (`loadPublicCards('wild')`, `images.art` with `art_metadata` width and
  height; `null` when unstated). An id also finds the art of its `CORE_`
  reprint or original. Battlegrounds entries have none. Only `http(s)` URLs
  are kept; the page no longer shows them.
- The art catalog never delays a snapshot: the patches are parsed with the
  last art lookup (none after a restart); the catalog is read only after the
  snapshot is built, because reading it alongside the archive slowed the
  first answer, and its art is merged into the current snapshot on arrival.

## Before and after

Each entry carries `beforeRenderUrl` and `afterRenderUrl`: absolute URLs of
archived renders of the card in the card history of the data API
(`server/modules/patchNotes/cardVersions.ts`). Both or neither.

- Source: `GET <KOLODAHS_API_BASE_URL>/card-history/constructed_card/<id>`
  (`media.image_url.archive_url`) for Constructed, Arena and side-mode cards,
  `/card-history/card/<id>` (`media.card_image.archive_url`) for Battlegrounds.
  The local image paths of the history jump without a change of the card and
  are never used; neither is a picture whose status is not archived.
- Pair rule: "before" is the last archived picture whose `observed_at` (UTC)
  is older than the patch's `publishedAt`; "after" is the first archived
  picture from `publishedAt` up to the release of the next newer patch of the
  archive whose picture (sha256) differs from "before". Without both, the
  card has no pair and nothing is drawn or guessed. The history starts on
  2026-10-11, so 37.0.2 and 37.0.0 have pairs (about 20 of 22 Standard
  and 28 of 66 Battlegrounds cards in 37.0.2; trinkets have none) and
  36.6.3 and older have none.
- Cost: one request per entry, at most four at a time, six seconds each at
  most. The two newest patches are read as soon as the archive is; another
  patch is read on its first request. A request waits up to four seconds for
  a patch not read yet and serves the pairs found so far; the rest arrive
  with later answers. A finished patch is kept six hours, one whose reads
  failed is read again after five minutes, at most 16 patches are kept. A
  failed or unknown (`404`) card has no pair; the route never fails for it.
- Plates from versions: the `snapshot` of the two versions of a pair says
  what changed (`versionChanges.ts`): Constructed `mana_cost`, `attack`,
  `health`, `durability`, `armor` and `text_ru`; Battlegrounds `tavern_tier`,
  `attack`, `health` (no text). These numbers replace the article's own for
  the same labels (the article's text change survives for Battlegrounds,
  and a Constructed «Текст» only where `text_ru` really differs, ignoring
  markup); changes a snapshot cannot state (a trinket's gold, hero armor)
  stay as the article gives them. A pair whose versions differ in nothing a
  plate shows keeps the article's changes. A card without a pair keeps the
  article's changes.
- The archive hosts are `api.kolodahearthstone.com/uploads/`, which the image
  proxy (`/api/public-resource/db/`) already allows; the page never loads the
  archive host directly.

## Page

- Reading order: the page `h1`, then each patch: its `h2` ("Патч 37.0.2") with
  the date and quiet links to the article and the official notes (no change
  count, no lead line); then each mode as an `h3` ("Стандарт", "Вольный",
  "Стандарт и Вольный", "Арена", "Поля сражений", "Другие режимы") on a strip
  of that mode's own art with the gold emblem of the site menu
  (`PatchModeHeading.tsx`), its general changes as a list, then its cards. A
  mode's general changes sit under its first section; a mode with only
  general changes gets a section of its own. A patch without line-by-line
  changes says so.
- General changes (`generalMentions.ts`): the server finds card names in each
  line and ships them as `marks` (`line`, `start`, `end`, `cardId`, `name`,
  `renderUrl`). Words match their card's name word by word with Russian case
  endings tolerated («Живых азеритов» is «Живой азерит»); a single word
  counts only when it is long and written like a name. Battlegrounds modes
  search the Battlegrounds catalog, the others the collectible dictionary.
  A mark is a button: tooltip on hover and focus (`CardPreviewTooltip`), the
  full card in `CardPreviewSheet` on a press. Both receive a picture only as
  an `/api/public-resource/` path, else `null` and the HSJSON fallback. A line
  without a mark is text.
- A pair card: the name (a link to the card page for Constructed cards of a
  known format), the picture "До", an arrow with the plates of the change, the
  picture "После", and the developers' comment as one line. A plate is the
  game's word and the values: «Мана 9 → 10» (a Battlegrounds cost is
  «Золото»), «Тир 4 → 5», «Атака 5 → 6», «Здоровье», «Броня…»; the new value
  is coloured by direction (green better, red worse for the player) and the
  direction is also said to assistive technology. A rule-text change is the
  plate «Текст»: the text itself is on the pictures.
- A card without a pair: one current picture ("Сейчас"; the Battlegrounds
  catalog render, a catalog render of a card outside the collection, else the
  game's latest render, which carries today's text) and its plates beside it.
  Where a picture shows the card, no "Было / Стало" text is printed. A card
  with no picture at all (a name no catalog knows) is one compact block: the
  name, its plates and its text once, the old words struck out and the new
  ones marked. There are no placeholders or apologies.
- Names the article spells with a qualifier resolve through it
  (`cardNames.ts`): «— Способность К’Туна» is cut off (it becomes the card's
  line), «(2-й уровень)» picks the Battlegrounds version of that tavern tier.
  A name the collectible dictionary lacks is looked up once in the catalog of
  the data API (`GET /card-catalog?q=`, `catalogCards.ts`), kept a day; the
  card is then outside both formats («Стандарт и Вольный»).
- Layout (container queries on the card, grid auto-fit on the list): two
  pairs in a row from about 1100 px of content, one pair per row below;
  at card width under 27 rem (phones) the two pictures sit side by side,
  each about 45 %, with the arrow between and the plates under them. Images
  have width and height (Constructed 404×558, Battlegrounds 512×776), the
  first four of the newest patch load eagerly, the rest lazily, all through
  `/api/public-resource` at 480 px (`webp`). Nothing scrolls sideways.
- Every card has the id `card-<entry id>`; a patch loaded in the browser
  scrolls to it. Dates render in Europe/Moscow before hydration and in the
  viewer's zone after it. While a patch loads in the browser the page shows
  `PatchNotesSkeleton`: the `h1` and two blocks from the shared
  `LoadingSurface`.

## API

<!-- markdownlint-disable MD013 -->
| Route | Response |
| --- | --- |
| `GET /api/patch-notes` | `{ patches: PatchNotesSummary[], updatedAt }`, patches with changes, newest first |
| `GET /api/patch-notes/latest` | `PatchNotesDetail` of the newest patch with changes |
| `GET /api/patch-notes/recent` | `{ patches: PatchNotesDetail[2], updatedAt }`, the page's two newest patches with before/after pictures |
| `GET /api/patch-notes/:version` | `PatchNotesDetail` with before/after pictures; `400` for a malformed version, `404` for an unknown one |
<!-- markdownlint-enable MD013 -->

Responses are `public, max-age=600, stale-while-revalidate=1800`. The newest
build of a version wins when hs-data-api stores two builds of one article.
`latest` and the archive list carry no before/after pairs: they are not
read for them.

## Rendering

The server component reads `/api/patch-notes/recent` (or the one version)
through a cache in the Next process
(`apps/public-web/lib/publicPatchNotesData.ts`): the last good answer of each
path is served at once and refreshed in the background once it is five
minutes old, so a slow Express no longer ships the page without the patches
(the regional edge keeps an anonymous document for a minute, bots included).
Only a path the process has never read waits: the proxy for up to two
seconds (and answers 503 without the patches), the page within the shared
600 ms first-paint budget; its read goes on for up to ten seconds and fills the
cache for the next request, and patches that missed the budget are loaded by
the browser. Failed, `404` and malformed answers are not kept; at most 48
paths are, the least recently served dropped first. After a deploy
`scripts/warm-prerendered-pages.mjs` requests the page on the local Next
origin to fill the cache. The HTML carries the patch headings and the card
names, so the page is indexable; `scripts/lib/post-deploy-data-pages.mjs`
waits for the marker `hp-release__title`.
