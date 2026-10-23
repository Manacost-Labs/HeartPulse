# Patch notes page

`/standard/patches/` shows the card changes of one Hearthstone patch
(`src/features/PatchNotesView.tsx`, parchment styles of the site). Without a
query it opens the newest patch that has card changes; `?version=36.6.3` opens
one patch of the archive. The archive lists every patch with at least one
parsed change. The page is public: no entitlement, no paywall and no viewer
data.

## Source

hs-data-api stores one row per patch in `hearthstone_patches`, refreshed daily
by `hs-data-api-docker-refresh-patches.timer`
(`scripts/seed_hs_manacost_patches.py --all`). A matched row carries the
Russian hs-manacost.ru article as `content_text` and its headings as
`sections`. Express reads `GET /api/patches?limit=500&include_content=1`
(about 4 MB) once per 30 minutes and parses every article
(`server/modules/patchNotes`). An expired copy is served at once while one
background refresh runs; a failed refresh is retried after a minute, not per
request. Only the first read after a restart waits; if it fails, the API
answers `502`.

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
  English), `cardType` and the catalog render in `renderUrl`.
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

- `meta` describes where meta impact comes from: the site's archetype
  catalogs (`v1/hsguru/archetypes`, the same cache as the archetype pages)
  of today's period for Standard and Wild. A format whose catalog failed is
  listed in `meta.missing` and the page says so; `meta` is `null` when no
  catalog is wired.
- `archetypes` of a Constructed entry lists today's archetypes whose listed
  builds contain any print of the card (original and reprint dbf ids from
  HearthstoneJSON `ruRU`): `decks` of `totalDecks` builds, sorted by that
  share, then by popularity, at most eight. It is today's meta, also for old
  patches, and the page labels it "Играют сейчас".
- "Изменённые карты → затронутые архетипы" closes "Главное в патче": a
  Sankey diagram (Valyro Pro `SankeyChart`, vendored in
  `src/vendor/valyro-ui`) from changed Constructed cards, coloured by buff,
  nerf or rework, to the ten most popular archetypes that play them. A
  flow is the number of the archetype's listed builds with the card
  (`decks`), so an archetype's bar counts card appearances, not distinct
  builds. A card node opens the card page (else its change on this page),
  an archetype node its archetype page; on touch the first tap shows the
  tooltip. The plot is one block 200–360 px tall (30 px per row of the
  taller column). Below 640 px of content the same links are a list. It is
  shown only with at least two links; a format whose catalog failed is named
  in its note.
- A card's archetypes ("В архетипах текущей меты", at most four and a count
  of the rest; builds with the card in the link title) wait behind the
  card's "…" with the rest of its details.
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
  are kept; the page loads them through the image proxy at 320 and 512 px.
- The art catalog never delays a snapshot: the patches are parsed with the
  last art lookup (none after a restart); the catalog is read only after the
  snapshot is built, because reading it alongside the archive slowed the
  first answer, and its art is merged into the current snapshot on arrival.

## Navigation

One way to do each thing:

- The version switcher lives in the patch header: older and newer arrows
  around a select of every archived version, and "Все патчи", which opens
  the archive timeline in a modal side drawer (a native `<dialog>`). The
  drawer is rendered with the page, so the links to every patch are in the
  server HTML.
- One bar under the header carries the section links (when the patch has
  more than one section), the class/card-type select (grouped by section),
  the search and the kind filter (Все / ↑ / ↓ / ↻; the header counts each
  kind with the same marks, so the toggles repeat no number and carry their
  names as labels). On content at
  least 760 px wide the whole bar sticks under the site header; narrower,
  only the search and kind row sticks and the rest scrolls away. The layout
  uses container queries because the site rail takes part of the viewport.
- Every card in a section has the id `card-<entry id>`; its "…" holds a
  copy-link button. `:target` marks the linked card, and a patch loaded in
  the browser scrolls to it. Cards, groups and sections keep
  `scroll-margin-top` below the sticky bar.
- Sections fade in when opened, without motion under
  `prefers-reduced-motion`. The empty filter state offers a reset; the
  loading state is the shared skeleton.

## API

<!-- markdownlint-disable MD013 -->
| Route | Response |
| --- | --- |
| `GET /api/patch-notes` | `{ patches: PatchNotesSummary[], updatedAt }`, patches with changes, newest first |
| `GET /api/patch-notes/latest` | `PatchNotesDetail` of the newest patch with changes |
| `GET /api/patch-notes/:version` | `PatchNotesDetail`; `400` for a malformed version, `404` for an unknown one |
<!-- markdownlint-enable MD013 -->

Responses are `public, max-age=600, stale-while-revalidate=1800`. The newest
build of a version wins when hs-data-api stores two builds of one article.

## Rendering

The server component reads both routes within the shared 600 ms first-paint
budget (`apps/public-web/lib/publicPatchNotes.ts`); a part that misses it is
loaded by the browser. Dates render in Europe/Moscow before hydration and in
the viewer's zone after it.

- Reading order: the header, the bar, "Главное в патче" (highlight cards,
  then the Sankey), the sections and a one-paragraph source note. The Sankey
  draws its flows without the kit's dash animation, which Chrome leaves
  unpainted on this chart's wide flows.
- The page heading (`h1` "Патчноуты Hearthstone") sits in the patch header
  instead of the tall route banner, which only the missing, failed and
  loading states still show.
- The header is an art plate like the archetype header: the archetype class
  art of the class with most changed cards (`public/archetype-art/classes`),
  or the Battlegrounds plate when most changes are there, else the plate of
  the first section. It is preloaded (`fetchPriority: high`, `srcset`) and
  is the page's LCP image. The first card with wiki art at least 1000 px wide
  (highlights first) stands on the right. The header shows the version only
  through the switcher, the date, the expansion cycle of the version — every
  major client version opens one (35 → «Катаклизм», 37 → «Власть Темной
  империи»); majors the archive has no patch of are not mapped — with the
  set glyph of the card library in a small seal, the article title without
  its version prefix as the `h2` (`patchHeadline`: "Обновление 36.4.2 уже в
  игре: баланс…" → "Баланс…"; "Патч 36.4.2" when nothing else is left), one
  line of counts with Russian plural forms (changes, ↑ buffs, ↓ nerfs,
  ↻ reworks; the total is left out when only one kind is present, because it
  would repeat that number), and quiet links to the article and the official
  notes. On content under 480 px "Все патчи" keeps only its icon.
- Each number is said once: the header counts kinds, the section links count
  their section. Section summaries are banners with the mode plate and
  emblem and the title only. Groups are a line of type: the 96 px class icon
  (or card-type glyph) and the name; a section of one group of the section's
  own name has none.
- "Главное в патче" picks up to four changes with a picture from sections
  longer than three cards of a patch longer than eight changes (a shorter
  section or patch is read whole below, so it is not repeated): Standard
  first, then the largest number moves; a stated buff or nerf outranks a
  rework and one section fills at most half the list while others have
  candidates. Highlights are large cards without details, two by two (three
  in one row, one column on phones); when every highlight has wiki art at
  least 1000 px wide, the art runs across the top and the render is laid
  over its lower edge, otherwise no highlight has art, so they read as one
  kind of card.
- Sections are Стандарт, Вольный, Стандарт и Вольный (cards of unknown
  format), Арена, Поля сражений and Другие режимы, each a `<details>` open by
  default. Constructed entries carry `format`: `standard` when today's
  Standard catalog (`loadPublicCards('standard')`) lists the card or its
  `CORE_` reprint, else `wild`; `null` without a match or a catalog. Groups
  are classes (Constructed, Arena) or card types (Battlegrounds: list
  headings such as "Малый аксессуар" first, then catalog types).
- Filters: search over Russian and English names and change text, the kind
  (buffs, nerfs, reworks), and class or card type. Filtering hides the
  highlights and section notes.
- A change row shows only the render, the name with a ↑↓↻ mark (a small
  square badge, the only place the row's kind is shown) and the change.
  Rows sit on the parchment without a box, a hairline above each, in columns
  of about 24 rem (two on wide content, one on phones); only highlights are
  boxed cards. The row's "…" (a `<details>` in its corner) holds the
  type and the article's English name, the archetypes of today's meta, the
  earlier patches that changed it, "Карта и колоды с ней" for Constructed
  cards of a known format (`/standard/cards/<format>/<id>/`, which lists decks
  with the card) and the copy-link button.
- The picture sits in a fixed card-shaped box: the Constructed render
  `/api/card-image/<id>/thumb.webp`, the Battlegrounds catalog render resized
  through `/api/public-resource` (else the proxy's square art). Images have
  width and height, the first four load eagerly. Hover or focus shows the
  full current card, a tap or click opens it in a sheet. No source has card
  images from before a patch, so there is no before/after render toggle: the
  before state is the struck-out value or the word diff.
- Number changes read `старое → новое`; cost, attack and health are drawn on
  the game's mana crystal, attack and health icons, a tavern tier as its tier
  shield; a Battlegrounds cost is gold and armor has no game icon on the
  site, so both use an interface glyph. The old value is faded and struck
  through, the new one plain; the label and the direction stay for assistive
  technology. A rule-text change is one sentence: removed words muted and
  struck out, added words bold with a highlighter stroke ("было:"/"стало:"
  for assistive technology); its label is shown only when it is not "Текст".
- A patch without line-by-line changes says so in a panel that points to the
  header links. Picture-only article sections are one quiet line with the
  article link; "Общие изменения" is a short list.
