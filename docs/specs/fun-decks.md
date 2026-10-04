# Fun decks page

`/standard/fun-decks/` presents selected Standard and Wild decks with format,
search and sort controls. Its HTML title, description and canonical URL are
public. The server reads `/api/fun-decks` anonymously
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
