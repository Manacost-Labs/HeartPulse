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
| `route` | a template such as `/standard/cards/[format]/[cardId]/`, `other`, `unknown` | The Next.js page the visitor loaded. `other` matched no template. A missing entity under a known template (`/heroes/999999/`) still counts under that template (`/heroes/[dbfId]/`), so 404s are split between `other` and the templates. `unknown` comes from a tab opened before this field existed. |
| `device` | `mobile`, `desktop`, `unknown` | The layout rendered: `desktop` from 1024 px wide (sidebar shell), `mobile` below it (top-bar shell, including tablets). |
| `navigation_type` | `navigate`, `reload`, `back-forward`, `back-forward-cache`, `prerender`, `restore` | How the page was reached, from the `web-vitals` library. |
| `lcp_target` | `img.article-image-shell`, `h1`, `none`, `unknown` (LCP only) | The LCP element's tag and one component class. `none`: no element, either after a back-forward cache restore or because the element was removed from the page before the idle reporter started. `unknown`: an older tab. |
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
- A rise in `other` means more visits to paths without a template, such as
  stale links, or a new page whose template is missing from
  `shared/webVitalsDimensions.ts`; the unit test
  `tests/web-vitals-dimensions.test.ts` fails for the latter before merge. A high
  `unknown` share that lasts more than a few days points at stale cached
  JavaScript.

## Privacy and validation

The browser derives every value from the URL path, the viewport width and the
LCP element's own tag and class names; it never reads element text, URLs, ids
or attributes. The API answers `400` and records nothing when a report
carries a `route` outside the template list (a raw path, an id or a query
string) or a device other than `mobile` or `desktop`, so those two attributes
have a fixed set of values.

`lcp_target` is checked by shape only: an allowlisted tag plus one class name
of lower-case letters, digits and BEM separators, at most 48 characters,
without three consecutive digits and not a Tailwind utility. A forged report
can therefore still store any word of that shape, such as `p.leeroy-jenkins`.
The values are bounded in length and form, not enumerated, and the endpoint
shares the general `/api/` limit of 120 requests per minute per client.
Judge `lcp_target` by values with real sample counts and ignore rare ones.

The Sentry metric filter keeps only the attribute keys in the table above;
`sendDefaultPii` stays off.

## Local checks

```sh
npx tsx tests/web-vitals-dimensions.test.ts
npm run test:sentry
node --test tests/next-runtime-config-browser.test.mjs
```

The browser test needs `npm run build:static` and `npm run build:next` first.
