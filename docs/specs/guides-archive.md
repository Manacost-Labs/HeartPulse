# Guides archive access

`/guides-archive/` publishes a title, description and canonical URL for every
visitor. The list of archived guides remains behind the existing
`guidesArchive` entitlement. Administrators can open the list without a
separate subscription, matching the Express API. The Next.js page checks the
current account before mounting the archive client, so a guest does not call
`/api/guides-archive` or receive guide data in server HTML.

The detail route `/guides-archive/:guideSlug/` is also staged in Next.js. Its
request-time HTML reads only `/api/guides-archive/teaser/:slug` without account
cookies. This public endpoint returns title, plain-text description, safe image
URL, publication date and category labels. It never returns guide HTML, body
text, keywords or the old source URL. The Next server explicitly selects those
fields again before serializing them into HTML. The existing protected API
continues to supply full content after `guidesArchive` entitlement or
administrator access is verified.

Missing guide IDs/slugs return an actual 404. Numeric legacy IDs remain valid
deep links and use the resolved slug as canonical. Guest HTML is indexable and
contains the public title and description, but no full article text. Nginx
serves both guide routes from Next.js after deployed browser verification.

## Complete article and reading layout

The protected detail response joins `free_html` (the introduction) and
`body_html` (the continuation), in that order, before sanitizing the complete
fragment. `short_html` is a fallback only when both parts are empty; it is an
announcement, not another article section. The archive database stays read-only.

`server/guides/sanitize.ts` uses the existing `sanitize-html` dependency with
an explicit tag, attribute and URL-scheme allowlist. Legacy scripts, inline
styles and layout attributes do not enter the reader. Decorative separators
and the old bolt/fire bullet images are removed. Content images stay inside
their original paragraphs instead of being wrapped in invalid nested figures.
Empty formatting wrappers are removed without deleting text or anchor targets.
Images and image links under the retired `kolodahearthstone.ru/design/` host
resolve against the configured archive host, where those assets are preserved.

Local section IDs and links share the `guide-section-` prefix and open in the
current page. Legacy image buttons containing a valid deck code become selectable
text. The reader uses a bounded text measure, responsive images without height
clipping, normal paragraph/list spacing and locally scrollable tables.

Regression coverage: `tests/guides-sanitize.test.ts`,
`tests/guides-archive-routes.test.ts`, `tests/next-guide-detail-browser.test.mjs`
and the `ReadingLayout` archive story.
