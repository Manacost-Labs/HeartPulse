# Public legal documents

`/privacy` and `/terms` are public, indexable routes. The footer links to both;
each page links to the other. `src/modules/legalPages/content.json` owns their displayed
revision date and content. The lazy `client.legalPages` module and static
prerender consume that same source, including contact and privacy links. The
Next routes also reuse the same module, so no separate legal copy is maintained.

The application routing manifest owns navigation and loading. SEO inventory
owns canonical trailing-slash URLs, sitemap inclusion and metadata. Neither
page reads session, profile or subscription data. Changing the text requires
review by the project owner; this document describes rendering behavior only.

The optional Next owner for `/faq/`, `/privacy/` and `/terms/` is controlled by
`PUBLIC_PAGES_NEXT_ENABLED`, independently of the card section flag. It emits
the complete public content and existing metadata on the server. The shared
navigation shell may fetch account/subscription state after hydration; neither
the document content nor server HTML depends on those requests. Rollback uses
the existing Vite routes and requires no content or data migration.

The shared Nginx canonical-path map includes both legal routes, so legacy-host
and scheme redirects add their canonical slash in the same hop and retain the
query string. The temporary Nginx contract test checks this against inventory.

Verify route resolution, prerender parity and both Storybook states on desktop
and narrow screens after a content or layout change.

The footer exposes 12 links. Legal links preserve a minimum 44 by 44 pixel
target on every viewport. The shared mobile-chrome test bounds footer height
to 890 pixels at 320px width, 825 at 390px and 404 at 768px, including the new
legal row, while retaining horizontal-overflow and three-column checks.
