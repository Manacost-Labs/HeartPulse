# Public legal documents

`/privacy` and `/terms` are public, indexable routes. The footer links to both;
each page links to the other. `src/modules/legalPages/content.json` owns their displayed
revision date and content. The `client.legalPages` module renders that source,
including contact and privacy links, and the Next routes reuse the module, so
no separate legal copy is maintained.

The application routing manifest owns navigation and loading. SEO inventory
owns canonical trailing-slash URLs, sitemap inclusion and metadata. Neither
page reads session, profile or subscription data. Changing the text requires
review by the project owner; this document describes rendering behavior only.

Next.js owns `/faq/`, `/privacy/` and `/terms/` and prerenders them at build
time with the complete public content and the registry metadata. The shared
navigation shell may fetch account/subscription state after hydration; neither
the document content nor server HTML depends on those requests. In the local
gateway the pages follow `PUBLIC_PAGES_NEXT_ENABLED`.

The shared Nginx canonical-path map includes both legal routes, so legacy-host
and scheme redirects add their canonical slash in the same hop and retain the
query string. The temporary Nginx contract test checks this against inventory.

Verify route resolution, `npm run test:next-seo` (it compares the server HTML
with the legal source) and both Storybook states on desktop and narrow screens
after a content or layout change.

The footer exposes 12 links. Legal links preserve a minimum 44 by 44 pixel
target on every viewport. The shared mobile-chrome test bounds footer height
to 890 pixels at 320px width, 825 at 390px and 404 at 768px, including the new
legal row, while retaining horizontal-overflow and three-column checks.
