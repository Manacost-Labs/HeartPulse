# Fun-deck render previews

## Problem

The fun-decks catalogue currently asks Deckview for a full 2048 px JPEG for
every visible card. A warm render-cache hit is fast, but transferring and
decoding many megabyte-sized images keeps cards in the loading state and makes
the page feel unfinished.

## Contract

`POST /api/deck/render` remains backward compatible and keeps `imageUrl` as the
full-size parchment render. It additionally returns `previewImageUrl` when the
Deckview API supplies a preview derivative.

The Deckview render API adds these optional fields:

- `preview_filename`
- `preview_image_path`
- `preview_image_url`

Preview files are versioned derivatives of the immutable render-cache key.
They are WebP images no wider than 720 px. A missing or corrupt derivative is a
cache miss for the preview only and must never invalidate the full render.

## Browser behaviour

- Catalogue cards load `previewImageUrl`, falling back to `imageUrl` for an
  older Deckview deployment.
- The full-size `imageUrl` is requested only when the user opens the image.
- Identical render requests remain coalesced in memory.
- At most three cold render requests may be in flight in one browser tab.
- The first visible row is eager; following rows use the existing observer.

## Acceptance checks

1. Existing consumers that only read `imageUrl` still pass their contract
   tests.
2. Preview generation is atomic, fail-open, and safe under concurrent writers.
3. A valid warm preview is not decoded or regenerated again.
4. A corrupt preview is rebuilt without re-rendering the deck.
5. The preview is at most 720 px on its longest side and materially smaller
   than the full JPEG fixture.
6. The full image, not the preview, is used by the lightbox.
7. Browser QA shows no layout shift or long-lived loading placeholders for
   warm catalogue entries.
