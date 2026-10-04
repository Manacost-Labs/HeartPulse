# Read field Web Vitals by page

Real visitors report LCP, INP, CLS, FCP and TTFB to
`POST /api/telemetry/web-vitals`. When the server-only `SENTRY_DSN` is set,
the origin records each value as a Sentry distribution metric:
`web.vital.lcp`, `web.vital.inp`, `web.vital.cls`, `web.vital.fcp` and
`web.vital.ttfb`. Every metric carries the deployment `release`
(`RELEASE_SHA`) and the bounded attributes below. Use them to check whether a
change moved the page it was meant to move.

## Attributes

<!-- markdownlint-disable MD013 -->
| Attribute | Values | Meaning |
| --- | --- | --- |
| `route` | a template such as `/standard/cards/[format]/[cardId]/`, `other`, `unknown` | The Next.js page the visitor loaded. `other` matched no page (mostly 404 traffic). `unknown` comes from a tab opened before this field existed. |
| `device` | `mobile`, `desktop`, `unknown` | The layout rendered: `desktop` from 1024 px wide (sidebar shell), `mobile` below it (top-bar shell, including tablets). |
| `navigation_type` | `navigate`, `reload`, `back-forward`, `back-forward-cache`, `prerender`, `restore` | How the page was reached, from the `web-vitals` library. |
| `lcp_target` | `img.article-image-shell`, `h1`, `none`, `unknown` (LCP only) | The LCP element's tag and one component class. `none`: no element, as after a back-forward cache restore. `unknown`: an older tab. |
| `rating` | `good`, `needs-improvement`, `poor` | The library's rating against the Core Web Vitals thresholds. |
| `edge_region`, `client_region` | see `docs/specs/regional-performance-telemetry.md` | The serving edge and the coarse visitor region. |
<!-- markdownlint-enable MD013 -->

Every metric of a page load belongs to the page the browser loaded, as in
CrUX. INP and CLS cover the whole visit, including later client-side
navigations, so they describe the landing page's session, not only that
page.

The class in `lcp_target` is the element's own component class, or the class
of its nearest ancestor within three levels when the element has only
Tailwind utilities (common for images inside a wrapper). Find it in the code
with `rg -n 'article-image-shell' src apps`.

## Compare a page before and after a release

In Sentry's metrics explorer:

1. Choose the metric, for example `web.vital.lcp`, aggregated as p75. Add
   `count` beside it; a percentile without its sample count is not evidence.
2. Filter `navigation_type:navigate`. Prerendered and cached loads report
   LCP near zero and would hide a regression; read them separately.
3. Group by `route` and `device`, or filter one route.
4. Compare two windows of equal length and weekday mix, for example the seven
   days before the deploy and the seven days after it, or group by
   `release`.

Treat a change as real only when both windows hold at least 100 samples for
that route and device and the p75 moves by more than about 10%. Smaller
moves are within the day-to-day noise of a site this size.

To see which element was the LCP, group `web.vital.lcp` by `lcp_target` for
one route and device. A shift from `img.*` to `h1.*` after a release means
the hero image stopped being the largest paint, which changes what to
optimize.

To see how many visits are prerendered or restored from the back-forward
cache, count `web.vital.ttfb` grouped by `navigation_type` for a route. Every
page load reports TTFB once.

## Gaps

- Pages prerendered at build time (`/faq/`, `/privacy/`, `/terms/`) inline
  `webVitals: { enabled: false }` and never report; see
  `docs/specs/global-static-asset-delivery.md`.
- `NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE` below `1` reduces counts, not
  percentiles. Scale counts back before comparing two periods with different
  rates.
- Browsers without the Event Timing or LCP APIs report only the metrics they
  support, so INP and LCP counts are lower than TTFB counts.
- A high `other` share after a release usually means a new page whose
  template is missing from `shared/webVitalsDimensions.ts`; the unit test
  `tests/web-vitals-dimensions.test.ts` fails for that before merge. A high
  `unknown` share that lasts more than a few days points at stale cached
  JavaScript.

## Privacy and validation

The browser sends only the derived values. The API answers `400` and records
nothing when a report carries a raw path, an id, a query string, a device
other than `mobile` or `desktop`, or an LCP descriptor that is not a known
tag with one lower-case class of at most 48 characters; class names with
three or more consecutive digits are rejected as possible ids. The Sentry
metric filter keeps only the attribute keys in the table above;
`sendDefaultPii` stays off. Element text, URLs, ids and attributes are never
read.

## Local checks

```sh
npx tsx tests/web-vitals-dimensions.test.ts
npm run test:sentry
node --test tests/next-runtime-config-browser.test.mjs
```

The browser test needs `npm run build:static` and `npm run build:next` first.
