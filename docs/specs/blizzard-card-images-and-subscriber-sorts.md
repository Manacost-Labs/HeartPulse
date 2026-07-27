# Blizzard card images and subscriber sort labels

## Objective

Replace HearthstoneJSON as the primary source of localized card renders and
remove paid-access decoration from statistical sort options when the server has
confirmed that the current user can access constructed statistics.

## Runtime and boundaries

- The browser continues to request same-origin WebP assets from
  `/api/card-image/:cardId/:variant.webp`.
- The server uses Blizzard's Hearthstone Game Data API with the existing
  client-credentials configuration. Credentials and access tokens never reach
  the browser.
- Blizzard's localized `image` field is the preferred upstream. The existing
  HearthstoneJSON render remains a resilience fallback only.
- The cache key is versioned so previously cached broken images cannot survive
  the source migration.
- Statistical values and sorting remain protected by the existing
  server-authoritative `statsAccess` response. This change only makes the
  visible labels match that entitlement.

## Implementation

1. Resolve the Blizzard numeric card ID from a numeric image request or the
   existing Russian card metadata.
2. Ask the existing Blizzard client for the `ru_RU` image, validate the remote
   content type, download it server-side and convert it to the existing WebP
   variants.
3. Fall back to HearthstoneJSON only when Blizzard is unavailable or does not
   have the requested card.
4. Prefer the numeric Blizzard card ID in constructed catalog image URLs and
   bump both browser and server cache versions.
5. Generate statistical sort options from `statsAccess`: clean labels for
   subscribers and locked Diamond labels for visitors without access.

## Acceptance criteria

- A constructed card with a Blizzard numeric ID is served with
  `X-Card-Image-Source: blizzard`.
- Blizzard OAuth and card metadata stay server-side, use the existing token
  cache and reject non-image upstream responses.
- The four reported catalog cards no longer reuse the old fallback cache.
- With `statsAccess=true`, the three statistical sort labels contain neither a
  lock nor `Алмаз`; with `statsAccess=false`, they remain disabled and clearly
  identify the required plan.
- Targeted tests, production build, changed-file security checks and real
  browser QA pass.

## Rollback

- Activate the previous immutable production release.
- The previous HearthstoneJSON source remains available as fallback and the
  versioned cache files are independent, so rollback does not require deleting
  shared image data.
