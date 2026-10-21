# Patch notes page

`/standard/patches/` shows the card changes of one Hearthstone patch with the
VaryloUI `gaming/patch-notes` component, restyled to parchment through
`src/shared/ui/varyloParchment.css`. Without a query it opens the newest patch
that has card changes; `?version=36.6.3` opens one patch of the archive. The
archive lists every patch with at least one parsed change. The page is public:
no entitlement, no paywall and no viewer data.

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
- A Constructed or Arena name is matched to a collectible card by its exact
  Russian name (HearthstoneJSON `ruRU`). A name shared by cards of different
  classes stays unmatched. Matched cards show `/api/card-image/<id>/thumb.webp`
  and are grouped by class, which is the class filter. Battlegrounds names are
  not matched: the article has no card ids and the collectible list has no
  Battlegrounds minions, so those entries show initials.
- Lines in images or collapsed blocks of the article are not in
  `content_text`; such changes are absent and the page links the full article.

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
