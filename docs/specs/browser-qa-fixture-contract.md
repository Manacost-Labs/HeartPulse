# Browser QA fixture contract

## Purpose

The production browser audit uses deterministic API fixtures. These fixtures
must model the current access and rendering contracts; otherwise an outdated
test can either hide a real regression or block a safe release.

## Access fixtures

- An anonymous session always receives `hasAccess: false` and no entitlements.
- An authenticated subscriber receives the complete Standard entitlement.
- Standard Meta uses a public teaser plus `.arena-inline-paywall`; hard-locked
  pages continue to use the inert `.arena-paywall` overlay.
- The constructed archetype catalog is public teaser content and becomes ready
  when its `.archetypes-ledger` data surface is rendered.
- Responsive fixtures may accept either paywall presentation, but a public
  content fixture must reject both.

## Server-rendering fixtures

- The fixtures live in `scripts/qa/fixtures.mjs`, and `scripts/qa/mockApi.mjs`
  answers `/api` requests from them. Browser QA intercepts page requests with
  that handler. Next.js server loaders reach it through the QA backend
  (`scripts/qa/backend.mjs`), so server HTML and hydrated state describe the
  same data.
- A fixture must match the Express response shape that the Next.js validators
  in `apps/public-web/lib/` check. Examples are the top-level access flags of
  `/api/auth/me`, provider sources, catalog `period` and `dataStatus`, and the
  anonymous card, archetype, hero and library projections.
- Authenticated QA pages send `manacost_auth_token=qa-subscriber` or
  `qa-admin` on each request. The backend resolves the fixture account from
  that cookie, just as Express resolves a session.
- A backend request without a fixture gets `404 {"error":"Not found"}` and is
  logged once as `[qa-backend] no fixture for …`. Unknown pages get the Next.js
  not-found document, like the production nginx fallback.

## Interaction fixtures

- Constructed-card filters are accessible listboxes, not native `select`
  elements. QA selects options by their visible Russian label and verifies the
  selected value after browser history navigation.
- Archetype and card-deck images are rendered through `POST /api/deck/render`.
  The fixture returns a same-origin image and the audit verifies the rendered
  state, copy action, lightbox and responsive containment.
- Deck renders below the viewport remain lazy. A scenario must scroll its deck
  section into the observation margin before requiring a ready preview.

## Runtime errors

All same-origin API and asset failures remain release-blocking. The only
ignored request failure is `net::ERR_ABORTED` for the best-effort
`/api/telemetry/web-vitals` beacon while Chromium replaces or closes a page.
Other telemetry errors and all product request failures are still reported.

## Verification

Run `npm run qa:ci` before release. It builds the production bundle, prerenders
public routes and runs desktop, mobile, guest, subscriber, administrator,
keyboard, lightbox and accessibility scenarios.
