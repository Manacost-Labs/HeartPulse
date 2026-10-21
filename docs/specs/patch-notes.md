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
  value and counted in `missingBefore`; the page says so. Its badge is
  "Изменение", never "Новое", because the article does not state that.
- Battlegrounds trinket cost lists (`Name: a → b` under a "СТОИМОСТИ … АКСЕССУАРОВ"
  heading) and the hero armor table (`Герой Обычная игра Дуэты …`) become
  cost and armor changes.
- Direction (buff or nerf) comes only from numbers: lower cost, higher
  attack, health and armor are better. A tavern-tier move and a text change
  carry no direction, so an entry with only those is "Изменение".
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
- "Затронутые архетипы" opens "Главное в патче": archetypes playing any
  changed card, most popular first, with buff/nerf/rework counts and the
  card names; six are shown, the rest behind a button. Chips link to
  `/standard/archetypes/<format>/<slug>/`.
- `history` lists earlier patches of the archive that changed the same card
  (same card id, else the same name and subtitle in the mode), newest first,
  at most six; the page links each to `?version=…#card-<entry id>`.

## Navigation

- Every card in a section has the id `card-<entry id>` and a copy-link
  button; `:target` marks the linked card, and a patch loaded in the browser
  scrolls to it. Cards keep `scroll-margin-top` below the sticky toolbar.
- A strip of classes and card types with buff/nerf/rework counts filters to
  one group (a second click clears it); on narrow screens it is one
  swipeable row. The toolbar with the version, search and kind filter
  sticks under the site header while reading.
- "Предыдущий патч / Следующий патч" close the page. Sections fade in when
  opened, without motion under `prefers-reduced-motion`. The empty filter
  state offers a reset; the loading state is the shared skeleton.

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

- Reading order: the version switcher (above the patch on narrow screens),
  the header (version, date, article lead, counts by kind, links to the
  official Blizzard notes and the source article), "Главное в патче", the
  contents, the filters and the sections.
- The page heading (`h1` "Патчноуты Hearthstone") sits in the patch card
  instead of the tall route banner, which only the missing, failed and
  loading states still show.
- "Главное в патче" picks up to six changes with a picture from sections
  longer than three cards (a shorter section is read whole below, so it is
  not repeated): Standard first, then the largest number moves; a stated buff
  or nerf outranks a rework and one section fills at most half the list
  while others have candidates. Constructed cards of a known format link to
  their card page (`/standard/cards/<format>/<id>/`), which lists decks with
  the card; patch data has no card-to-archetype link, so there is no direct
  archetype link.
- Sections are Стандарт, Вольный, Стандарт и Вольный (cards of unknown
  format), Арена, Поля сражений and Другие режимы, each a `<details>` open by
  default with its count. Constructed entries carry `format`: `standard` when
  today's Standard catalog (`loadPublicCards('standard')`) lists the card or
  its `CORE_` reprint, else `wild`; `null` without a match or a catalog.
  Groups are classes (Constructed, Arena) or card types (Battlegrounds: list
  headings such as "Малый аксессуар" first, then catalog types).
- Filters: search over Russian and English names and change text, "Только
  бафы / нерфы / изменения", and class or card type. Filtering hides the
  highlights and section notes.
- A change with only cost, stat or armor moves (no text, no developer
  note) uses the compact card: three columns on wide content, the card about
  as tall as its picture. Cards with text or notes keep the full layout.
- A change card shows one picture in a fixed card-shaped box: the
  Constructed render `/api/card-image/<id>/thumb.webp`, the Battlegrounds
  catalog render resized through `/api/public-resource` (else the proxy's
  square art). Images have width and height, the first four load eagerly.
  A zoom mark on the picture says it opens: hover or focus shows the full
  current card, a tap or click opens it in a sheet. No
  source has card images from before a patch, so there is no before/after
  render toggle: the before state is the struck-out value or the word diff.
- Number changes read `старое → новое` coloured by direction; text changes
  show "Было" and "Стало" with removed and added words marked. The badge is
  coloured and carries an arrow or a rework icon.
- On content at least 960 px wide the version switcher (newer, select,
  older) and the contents with section and group links stay in a sticky
  side column; otherwise both sit above the patch and the cards form one
  column. The layout uses a container query because the site rail takes part
  of the viewport.
