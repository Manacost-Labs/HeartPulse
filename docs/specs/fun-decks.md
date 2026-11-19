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
