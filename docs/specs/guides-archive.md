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
text, keywords or the old source URL; the one exception is the open part
described below. The Next server explicitly selects those fields again before
serializing them into HTML. The existing protected API
continues to supply full content after `guidesArchive` entitlement or
administrator access is verified.

Missing guide IDs/slugs return an actual 404. Numeric legacy IDs remain valid
deep links and use the resolved slug as canonical. Guest HTML is indexable and
contains the public title, description, contents and the open part of the text
(see below), but no more of the article. Nginx
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

## Open part, contents and structured data

Every visitor, robots included, gets the same server HTML: the title, date,
the author line "Автор: HearthPulse", the contents of the whole guide and the
first 150-200 words of the text. Everything else is paid. The access check
never changes what the server rendered: for a guest the closed block
(`.guide-archive-paid`) holds a lock «Продолжение гайда — по подписке»
(`PaidLockButton`, `paywalled-guides`) that opens the subscription offer; a
subscriber gets the same page (one component, no remount, no gate) and the
full text replaces the open text and the lock. If the full text does not
arrive, the open text stays with a visible message and «Повторить».

## Archive list

`/guides-archive/` is open to everyone and is one component: the first page
(18 cards) is read by the server from `GET /api/guides-archive/public/list`
(`server/guidesArchiveList.ts`; card fields only, `oldUrl` always `null`,
covered by the scrape guard as an open `public` path) and rendered for
robots, guests and subscribers alike; filters, search and paging load in
the browser. A guest's search covers title, description and keywords but not
`body_text`, so it cannot tell whether a word stands in the paid text; a
subscriber's search (`GET /api/guides-archive`, access-guarded) keeps the
full-text search. The open list never selects `body_text`/`body_html` for its
cards; a guide without its own description (20 of 621 today) is described by
the start of its open part (the same cut the guide page shows), never by the
start of the whole body. When the database fails, the open list answers from the
last good copy of the same request, else `503` with `Retry-After: 60`.

A restart of Express (a deploy) must not turn a guide page into a 500:
`loadPublicGuideTeaser` retries once with a short deadline, then uses the
last good copy of that guide, else the page says «Гайд временно недоступен»
(`noindex, nofollow`).

### What the projection carries

`GET /api/guides-archive/teaser/:slug` adds `excerptHtml`, `toc`, `hasPaid`,
`indexable` and `updatedAt` (the archive is frozen, so it equals
`publishedAt`). The cut is made by the Express server in
`server/guides/excerpt.ts` on the same sanitized text the full route builds
(`free_html` + `body_html`, else `short_html`). The paid text is not sent to
the page at all: not in HTML, not in the RSC payload, not in JSON-LD (no
`articleBody`, no `wordCount`). Nothing that measures the closed part is
public either: no length, reading time, picture or deck counts, deck codes or
full HTML. Open on purpose: the contents (h2/h3 texts of the whole guide), the
boolean `hasPaid` and `indexable`. `description` is unchanged (first 220
characters).

### How the cut is made

- Words are whitespace-separated tokens with a letter or digit. The cut is
  at the first block end (paragraph, list item, table, wrapper) that has
  reached 150 words and does not exceed 200; a heading is never the last
  element.
- A block that would go past 200 words is cut at a sentence end so that the
  total stays in 150-200. If no sentence end fits, the cut is at the 200th
  word and marked with an ellipsis.
- Open wrappers are closed, so the HTML stays valid; it is the sanitizer's
  output, and the Next server rejects anything the sanitizer cannot emit.
- Deck pictures and deck codes are never in the open part; so are `figure`
  elements and every picture except the small inline icons. They count as the
  closed part.

### Contents anchors

Every h2/h3 gets an id in the full text (`guide-section-…` from the source,
else `guide-heading-N`); `toc` carries the same ids, so a subscriber's links
work. For a guest, headings that are not in the open part get an empty anchor
at the top of the closed block, so a contents link lands on the paywall and
not nowhere.

The contents never take text from paid elements: a deck code button inside
a heading (a `code` element after sanitizing) or a figure is skipped, the same
element list the open part leaves out, and attributes such as `alt` or `title`
are never read. A heading left without text (only a picture or a code) is not
in the contents; a guide with no headings simply has no contents block. The
outline is capped at 300 entries (the longest guide today has 63); the Next
server shortens a longer one instead of failing the page.

### Links to cut pictures

Pictures are removed from the open part, and a link left without content
(`<a href="…jpg"></a>`) is removed with it, together with its address: a
screen reader gets no nameless link and the address of a picture that may be a
deck image does not leave the server. Links with text, and anchors that only
carry an `id`, stay.

### Guide that fits the open part

If the whole text is at most 200 words and nothing is left out (no deck
picture or code), there is no closed part: the page has no
`.guide-archive-paid` block and no paywall, and JSON-LD says
`isAccessibleForFree: true` without `hasPart`. A deck picture alone makes the
closed block exist, so `hasPart` is present exactly when the block is.

### Indexing threshold

A guide whose open part has fewer than 150 words (today only
`skidki-noviy-god`) stays `noindex, follow`, carries no JSON-LD and is not in
`/sitemaps/guides-archive.xml`. One predicate, `isGuideArchiveIndexable`, serves
both: the projection exposes it as `indexable`, the page sets robots from that
flag, and `loadGuideArchiveSitemapRows` filters with it.

### JSON-LD

An indexable guide carries one inline `application/ld+json` graph:
`Article` (headline, description, image, `datePublished`, `dateModified`,
`author` and `publisher` as `{"@id": "https://hearthpulse.net/#org"}`,
`isAccessibleForFree: false`, `hasPart` → `WebPageElement` with
`isAccessibleForFree: false` and `cssSelector: ".guide-archive-paid"`) and
`BreadcrumbList` (Главная → Архив гайдов → the guide). The organization node
itself is declared elsewhere on the site; this page does not define one.
