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

`src/features/funDecksPreview.ts` holds the pure rules:

- **Reasons.** `funDeckWhy()` shows up to three Russian tags in the order
  package (`Пакет: <название>`), `Хайлендер`, `XL-колода`, `Концепт`, `Мем`,
  `Сыр`, `Редкий архетип`, `Далеко от меты`, `Мало общего с метой`. A tag the
  reader filters by comes first. The API's internal codes (score arithmetic,
  rejection reasons) and any unknown code are never shown. The line
  "Ближе всего к: <архетип> · сходство N%" follows.
- **Win rate.** "54% (47–61%)" when the interval is present; the note
  "мало игр" when `games < 100`.
- **Filters and sorts.** A class (icons, any of the selected) and a type
  (Хайлендер, XL, Мем, Сыр, Концепт; any of the selected, matched against every
  reason code of the deck) narrow the list together with format and search.
  Sorts: `newest` (default), `fun`, `reliable` (the lower bound of the
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
