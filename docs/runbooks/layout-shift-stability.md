# Layout shift stability

Status: implemented in `claude/cls-brand-fixes-20261007`, awaiting the owner's
integration decision. Base: `7233d3272b21d2b5247a28d4acf1997dd0d6d8aa`.

## Baseline, 2026-10-07

A production lab sample (Chromium 141 through Playwright, guest, two cold
loads per page; phone 390×844, DPR 3, CPU ×4) found four public pages above
the CLS "good" threshold of 0.1. The browser ran in a cloud sandbox outside
Russia behind an HTTPS proxy that adds about 0.7 s per connection, so its
TTFB and LCP are pessimistic; layout shifts do not depend on that offset.

| Page | Device | CLS | Source |
| --- | --- | ---: | --- |
| `/standard/cards/<format>/<card>/` | phone | 0.29 | unsized card art |
| `/legendaries/` | desktop / phone | 0.20 / 0.12 | late subscription gate |
| `/terms/`, `/privacy/` | phone | 0.18–0.20 | web font swap |
| `/battlegrounds/tier-list/` | phone | 0.08 | access-check placeholder |

The same sample showed 104 of 104 loads with HTTP 200, no failed requests
and no application console errors, and 88 client transitions without a
document reload, menu re-creation, content fade or layout shift.

## Card art

A phone stacks the art above the variants and facts. The `<img>` had a width
but no height or ratio, so its box was 0 px until the bytes arrived and then
grew to about 430 px; the variant switcher moved from y=264 to y=694.

The art now keeps `--card-render-aspect-ratio` (404 / 558, the measured size
of every production render) from the first frame. `object-fit: contain`
keeps golden, signature and diamond renders of other proportions inside the
same box, so changing the variant does not resize it either.

`tests/next-cards-browser.test.mjs` holds the art request on a 390 px phone,
asserts that the box is already taller than 200 px, that it keeps its height
when the image arrives and that the layout shift stays below 0.01. It fails
on the base commit with a 0 px box.

## Subscription gate

`PaywallGate` returns its children unchanged while access is unknown or
granted, and wraps them in `.arena-paywall` once a guest is confirmed. On
`/legendaries/` the children are plain `div`s, so React reconciled the
toolbar `div` into the gate wrapper and its children into the preview and
overlay. The browser scored those recycled nodes as moved content (CLS 0.20
desktop, 0.12 phone); `/classes/` passes a component child and was not
affected. The wrapper now has a stable `key`, so the gate always mounts new
nodes. Geometry, the phone layout without a preview and the production
observer's `.arena-paywall` contract are unchanged.

`tests/next-arena-guest-paywall-browser.test.mjs` loads `/classes/`,
`/tierlist/` and `/legendaries/` as a guest at 1440 px and 390 px and
requires a total layout shift below 0.02 after the gate appears. It fails
on the base commit with 0.2002 for `/legendaries/` at 1440 px.

`tests/soft-paywall-browser.test.mjs` fails on the base commit in this
cloud sandbox as well: Storybook logs `Error loading story index: Failed to
fetch` when the test navigates away from a story while `index.json` is still
loading. The gate change does not affect it.

## Repeat the checks

```sh
npm run build:static
npm run build:next
CHROMIUM_PATH=/path/to/chromium node --test --test-concurrency=1 \
  tests/next-cards-browser.test.mjs \
  tests/next-arena-guest-paywall-browser.test.mjs
```

Production review: open the page on a 390 px phone with CPU ×4, observe
`layout-shift` entries with a `PerformanceObserver`, and compare the sources.
Field data by route and device is in Sentry (`web.vital.cls`); see
`docs/runbooks/web-vitals-field-data.md` for the sample-size rule.
