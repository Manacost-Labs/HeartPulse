# Public legal documents

`/privacy` and `/terms` are public, indexable routes. The footer links to both;
each page links to the other. `src/modules/legalPages/content.json` owns their displayed
revision date and content. The lazy `client.legalPages` module and static
prerender consume that same source, including contact and privacy links.

The application routing manifest owns navigation and loading. SEO inventory
owns canonical trailing-slash URLs, sitemap inclusion and metadata. Neither
page reads session, profile or subscription data. Changing the text requires
review by the project owner; this document describes rendering behavior only.

Verify route resolution, prerender parity and both Storybook states on desktop
and narrow screens after a content or layout change.

The footer exposes 12 links. Legal links preserve a minimum 44 by 44 pixel
target on every viewport. The shared mobile-chrome test bounds footer height
to 890 pixels at 320px width, 825 at 390px and 404 at 768px, including the new
legal row, while retaining horizontal-overflow and three-column checks.
