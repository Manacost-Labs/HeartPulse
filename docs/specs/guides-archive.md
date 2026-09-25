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
