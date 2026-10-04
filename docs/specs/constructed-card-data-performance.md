# Constructed card data performance

## Purpose

The constructed-card catalog combines frequently refreshed statistics with
comparatively stable card descriptions, Wiki relationships, tokens, patches
and deck membership. These two data classes must not share one short cache
lifetime: otherwise opening a card periodically rebuilds the stable detail
from several upstream services even when only statistics changed.

## Cache contract

- Catalog and statistics use the bounded dataset cache lifetime (normally a
  few minutes).
- Successfully enriched card details remain in process for six hours by
  default, with a hard maximum of 24 hours.
- Each response still composes the cached detail with the current statistics,
  entitlement and dataset status. Statistics are therefore never frozen for
  the lifetime of the detail document.
- Parser publication and the existing constructed-card invalidation path clear
  both caches immediately.
- Failed or partial enrichments are not stored as fresh details. The last good
  value may only be used as an explicitly stale fallback.

## Current patch label

The statistics period continues to request HSReplay with
`TimeRange=CURRENT_PATCH`. Its user-facing version is resolved from the local
patch catalog exposed by `api.hs-manacost.ru`, not from a version hardcoded in
the route. Hearthstone client builds such as `36.2.0.248348` are normalized to
the public patch name `36.2.0`. The cached fallback label is only used while the
first catalog request is loading; successful list and detail responses carry
the discovered patch for every period so all filter instances stay aligned.

## Performance evidence

The production baseline on 2026-08-04 showed a cold detail request taking up
to 3.6 seconds while warmed requests completed in roughly 50–110 ms from the
European edge. Catalog responses showed the same cold/warm pattern but already
had durable catalog prewarming. Separating the detail lifetime removes repeated
multi-upstream rebuilds during ordinary statistics refreshes.

## Verification

`npm run test:constructed-card-routes` proves that:

- statistics can refresh while the enriched detail remains warm;
- the detail upstream is not called during that refresh;
- short test lifetimes still exercise stale and outage fallbacks;
- entitlement redaction and partial-state semantics remain unchanged.

## Navigation warming

The main navigation warms both the lazy cards module and the exact first
catalog request (`standard`, `1d`, `legend`, 60 cards) on pointer enter, focus,
or pointer down. The catalog page consumes the same bounded in-flight request,
so a normal navigation does not create a duplicate API call. Public and
subscriber payloads remain isolated by the existing entitlement-aware cache
key, and a failed warm request is evicted so the visible page can retry.

## Catalog filter warming

The catalog does not warm neighbouring slices while idle. Catalog responses
are `no-store` and the warm cache (`constructedCardListPrefetch.ts`, 16
entries, 90 seconds) lives only in the current document, so the previous idle
warm of three adjacent slices cost every visit about 68 KB of Brotli JSON and
up to a second of API time, for the few visitors who then changed a filter.
Now the rank and period menus warm the option the pointer or keyboard rests
on for 150 ms (`onOptionIntent` of `ConstructedCardFilterSelect`,
`useCatalogIntentWarm` of the card module); choosing it reuses the in-flight
request. Save-Data and 2G connections warm nothing, and a format change is
never warmed: it loads a new document whose catalog the server renders.

## Catalog interactions

- Card links warm only the full render (`preloadImage`), 120 ms after the
  pointer enters or at once on focus and pointer down. A card page is a new
  document and its API response is `no-store`, so the catalog no longer
  requests card details that the card page could never reuse.
- Gallery cards are memoized: hovering one moves the tooltip, not the 60
  cards. Their hover transitions animate only `transform` and `opacity`.
- The Table/Gallery switch marks the pressed button at once and renders the
  other view from `useDeferredValue`, so the click paints before the table's
  1,800 nodes mount. The HSReplay deck renderer and its stylesheet load with
  the first table view (`hsReplayDeckViewRuntime.ts`); until then a row shows
  the card name.
