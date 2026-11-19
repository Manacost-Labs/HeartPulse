# Fun decks page

`/standard/fun-decks/` presents selected Standard and Wild decks with format,
class, type and search filters and four sorts. Its HTML title, description and
canonical URL are public. The server reads `/api/fun-decks` anonymously
(`apps/public-web/lib/publicFunDecksPreview.ts`) and renders only the guest
preview: the summary and the three newest decks, ordered by the same
`orderFunDecks()` the page uses. The complete selection never enters the
HTML. The browser still loads `/api/fun-decks` after hydration, behind the
preview and without a loader, because filters and subscribers need the
whole list; if that read fails, a guest keeps the preview. The endpoint is
public and returns the full normalized dataset. The page displays a
three-deck preview until the `standard` entitlement or administrator role is
verified, and shows the subscription prompt only after that check. That
preview is a product presentation rule, not an API access boundary.

The Next page uses the existing feature and public API. It remounts the feature
when the account or entitlement changes so a previous account's expanded view
does not remain on screen. The public Nginx owner is Next.js after direct-port
and browser checks.

## What a card says

The API's concept-v7 rows carry the reasons a deck was selected
(`reasons`), the nearest meta archetype, and the 95% Wilson interval of the
win rate (`win_rate_ci_low`, `win_rate_ci_high`). `server/adminFunDecksRoutes.ts`
normalizes them: the interval is kept whole or dropped (one bound, reversed
or out-of-range bounds become `null`), and `/api/fun-decks` adds
`nearestArchetypeLabel`, the nearest archetype in the site's Russian archetype
translations (without it the English name stays). A dataset from before
concept-v7 has none of these fields and renders as it did.

The reasons are computed on the server (`server/funDeckWhy.ts`, called by
`normalizeFunDeckRow`), so the dictionary stays out of the page's bundle:
`/api/fun-decks` rows carry `why`, every Russian reason in order of interest
(package `Пакет: <название>`, `Хайлендер`, `XL-колода`, `Концепт`, `Мем`,
`Сыр`, `Редкий архетип`, `Далеко от меты`, `Мало общего с метой`), and `tags`,
the filter tags the deck carries, found in every reason code it has. The API's
internal codes (score arithmetic, rejection reasons) and any unknown code
produce nothing. A response without `why` and `tags` shows no reasons and has
no tag matches.

`src/features/funDecksPreview.ts` holds the pure rules of the page:

- **Reasons.** `funDeckWhy()` shows the first three of `why`; a tag the reader
  filters by comes first. The line "Ближе всего к: <архетип> · сходство N%"
  follows.
- **Win rate.** "54% (47–61%)" (the bounds rounded to whole percent) when the
  interval is present; the note
  "мало игр" when `games < 100`.
- **Filters and sorts.** A class (icons, any of the selected) and a type
  (Хайлендер, XL, Мем, Сыр, Концепт, Офф-мета; any of the selected, matched
  against the deck's `tags`) narrow the list together with format and search.
  Pinned decks (`pinned: true`) lead under every sort. Sorts: `newest`
  (default), `fun`, `reliable` (the lower bound of the
  interval, then the win rate; a deck without it goes last), `distant` (least
  like the meta first). Each key breaks ties by the next; decks equal on all
  of them keep the API's order.
- **Guests.** The format and the sort pick the decks open to a guest (the first
  three); class, type and search only narrow those. No filter opens a deck
  beyond the three, and an empty result says so under the same subscription
  offer.

`src/features/funDecksQuery.ts` keeps the state in the address:
`?format=wild&class=priest,mage&tag=highlander&sort=reliable`. Defaults and
unknown values are left out, other parameters stay, the search text is not
kept. The page reads the address after hydration (the server renders the
defaults) and shows the loader instead of a guest preview while the complete
list, which a filtered view needs, is on its way.

## Off-meta and moderation

The API's concept-v8 rows carry `kind`: `brew` or `off_meta` (a forgotten
archetype). `normalizeFunDeckRow` passes it on; a missing or unknown `kind`
(an older API) is `brew`. `kind === 'off_meta'` adds the `offmeta` tag (filter
"Офф-мета", kept in the address as `tag=offmeta`) and the card's reason chip
"Офф-мета", which comes first. The new reasons are labelled `unique_list` →
"Уникальный список" and `far_from_ladder` → "Далеко от меты". The server HTML's
field allowlist (`publicFunDecksPreviewData.ts`) carries `kind` and `pinned`.

An administrator moderates the selection in the admin card "Фановые колоды":
`POST /api/admin/fun-decks/moderation` `{format: standard|wild, deckCode,
action: hide|pin|clear, note?}`, behind the admin guard (401 without a
session, 403 for a non-admin; every action goes to the admin audit log as
`fun-deck.<action>`). The decision is stored in HeartPulse's own SQLite table
`fun_deck_moderation`, keyed by format and deck code, with a snapshot of the
deck row, so it survives a new dataset and a restart. `hide` and `pin` for a
deck that is not in the current dataset are 404 unless a decision already
exists for it; `clear` is idempotent.

- Public `GET /api/fun-decks`: hidden decks are left out (and `stats` follow);
  a pinned deck carries `pinned: true`, leads its format, and, if the dataset
  no longer has it, comes from its snapshot. A failure to read the decisions
  is reported and the unmoderated dataset is served. The response is cached
  up to 5 minutes, so a decision reaches the page within that time. The guest
  sees pinned decks first like everyone; no public "pinned" badge.
- Admin `GET /api/admin/fun-decks`: every deck with `moderation`
  (`hide`/`pin`/`null`), plus `hidden`, the hidden decks from their snapshots
  with the note, the actor and the time. The card shows the kind and the
  decision, the buttons "Скрыть", "Закрепить", "Вернуть", and a block "Скрытые".

## Card art, preview and the full list

The «Плитки» tile and the «Строки» portrait are the site's own images
`/api/card-image/<id>/row.webp` and `portrait.webp` (`server/deckArtImages.ts`).
The fallback (mana gem or cost, name, count or star, rarity edge) is always
drawn, in the same 5:1 box, and the picture lies over it once loaded. A failed
image is requested once more after 4 s with a new `<img>` (the route answers a
failed generation with 502 / `no-store`); a second failure keeps the fallback.

The source failure window depends on the cause: a missing card or tile (404)
blocks the card for 10 minutes (`failureTtlMs`), a timeout, network error, 429
or 5xx for 60 seconds (`transientFailureTtlMs`).

`server/funDeckArtPrewarmer.ts` (wired by `server/app/createFunDeckArtWarming.ts`
and the preview coordinator) generates `row` and `portrait` for every card of
every published deck, sideboards and their key cards included, found with
`resolveDeckPayload`. It runs after every `GET /api/fun-decks` and, with
background jobs on, one minute after start and every 30 minutes. One image at
a time, with a pause after each; cached files cost nothing. A complete deck is
not queued again for the warm TTL; a deck with a failed card is retried after
10 minutes. Environment (all optional):
`FUN_DECK_PREWARM_ART_DELAY_MS` (250), `FUN_DECK_PREWARM_ART_TTL_MS` (6 h),
`FUN_DECK_PREWARM_ART_INTERVAL_MS` (30 min), `FUN_DECK_PREWARM_ART_START_MS`
(60 s). The existing Deckview preview prewarm keeps
`FUN_DECK_PREWARM_CONCURRENCY` (2) and `FUN_DECK_PREWARM_DELAY_MS` (2 s).

With a mouse (`(hover: hover) and (pointer: fine)`) a tile or portrait shows the
full card through `CardPreviewTooltip`, on hover and on keyboard focus; leaving,
blur, Escape, scroll and resize close it. One tooltip serves the whole list and
its code is loaded on the first hover. On touch a tap opens the card page
(`/standard/cards/{format}/{id}/`); tokens have no page and no link, but the
hover preview works for them too.

A subscriber sees every deck of the filter; there is no «Показать ещё». The
guest still gets the three-deck preview and the paywall. Each card requests its
deck (`/api/deck/resolve`) when it comes within about one screen of the
viewport; the first card does it at once.

The «Как читаются оценки» block follows the detector in the dataset. The
numbers come from `methodology` (from the dataset's `filters`:
`min_fun_score`, `ladder_member_sim`); a field the dataset does not publish is
`null` and shows as «—», nothing is substituted, so the block keeps one height
while the data loads. concept-v8 text: a deck is left out when it shares
cards with a ladder archetype's lists, is named like one, or has a generic
name (Aggro, Dude, Mech); «Бру» has a concept in the name, a spicy card package
or a unique list; «Офф-мета» is a forgotten, unpopular archetype.

The card preview is the card render alone (no plate), 360 px wide at most,
placed beside the tile; the page-scoped `bare` variant of
`AnchoredImagePreview`. The tile count zone (×N) is a solid gradient, so a
long name ends before the number in the fallback and over the picture.
