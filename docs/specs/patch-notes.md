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

- The header states the version, date, the article lead, counts of changes by
  kind (усиления, ослабления, изменения) and by mode, and links the official
  Blizzard notes and the source article when they are known.
- Filters: mode tabs, kind, class (Constructed, Arena) or card type
  (Battlegrounds: list headings such as "Малый аксессуар" first, then catalog
  types), and a search over Russian and English names and change text.
- A change card shows `/api/card-image/<id>/thumb.webp` (a card render for
  Constructed, square art for Battlegrounds, a portrait for heroes) with
  fixed width and height, so lazy images do not shift the layout; the first
  four load eagerly. Hover or focus shows the full current card (the catalog
  render, else the HearthstoneJSON render); a tap opens it in a sheet.
  No source has card images from before a patch, so the "before" state is
  the struck-out value or the word diff of the old text.
- Number changes read `старое → новое` coloured by direction; text changes
  show "Было" and "Стало" with removed and added words marked.
- The archive is a sticky side list when the content column is at least
  960 px wide and a version select in the header otherwise; the layout uses a
  container query because the site rail takes part of the viewport.
