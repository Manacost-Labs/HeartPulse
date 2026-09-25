# Fun decks page

`/standard/fun-decks/` presents selected Standard and Wild decks with format,
search and sort controls. Its HTML title, description and canonical URL are
public. The browser loads `/api/fun-decks` after hydration; this endpoint is
public and returns the full normalized dataset. The page displays a three-deck
preview until the `standard` entitlement or administrator role is verified.
That preview is a product presentation rule, not an API access boundary.

The Next page uses the existing feature and public API. It remounts the feature
when the account or entitlement changes so a previous account's expanded view
does not remain on screen. The public Nginx owner is Next.js after direct-port
and browser checks.
