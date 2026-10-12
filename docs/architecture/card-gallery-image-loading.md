# Card gallery image loading

The existing `client.constructedCards` module owns thumbnail selection and the
observer controller. `model/galleryImageLoading.ts` contains pure breakpoint
and activation policies. `galleryImageObserver.ts` starts proximity loading and
returns cleanup; its caller disconnects on unmount or catalog replacement.

The declared `public/index.ts` entry exposes the controller and model separately
from the presentation/hooks barrel at `public.ts`. `public.css` exposes styles.
`src/features/ConstructedCardGalleryImage.tsx` remains a small React composition
with identical server/client markup and the existing platform CDN fallback.
The legacy policy file re-exports the module contract and retains the old
priority-count helper. The adaptive renderer does not use that helper, so it
stays outside the module contract.
No server, cache, route or permission boundary changes.

Two thumbnails have an unconditional real source and high priority. The next
four use `picture` sources at 641, 901 and 1241 pixels. The browser chooses these
before hydration; other sources remain placeholders until 320-pixel proximity.
There is no render-time viewport read or second client-only tree.

The adapter synchronizes origin retries with the deferred URL and picture
source, preventing a failed CDN candidate from being selected again on observer
activation or resize. Mount also retries already failed preloads whose error
arrived before hydration attached its listener.

React refs/effects stay in the existing composition. Exporting a new image
component or hook through the mixed server/client module barrel also included
it in unrelated archetype bundles. Even imperative image exports enlarged the
common presentation chunk. The narrow gallery entry avoids sharing those exports
with the archetype page and adds no React client entry. Existing JavaScript and
CSS ceilings remain the acceptance gate.
Origin retry is a stateless module-level function, avoiding one callback hook
per image. The observer consumes its NodeList without copying it to an array.

The catalog stylesheet imports `public.css`, so this extraction adds no CSS
request. [The image contract](../specs/card-catalog-image-loading.md) owns quality
and network priority; [the runbook](../runbooks/card-catalog-performance.md) owns
measurement and verification.
