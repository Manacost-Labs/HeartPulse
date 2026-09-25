# Guides archive access

`/guides-archive/` publishes a title, description and canonical URL for every
visitor. The list of archived guides remains behind the existing
`guidesArchive` entitlement. Administrators can open the list without a
separate subscription, matching the Express API. The Next.js page checks the
current account before mounting the archive client, so a guest does not call
`/api/guides-archive` or receive guide data in server HTML.

The Next.js route is staged while Nginx still serves the legacy page. Individual
guide URLs need a public teaser endpoint and authoritative missing-guide 404
before their owner can move to Next.js.
