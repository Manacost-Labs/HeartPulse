# Unified public page headers

## Contract

Every public page uses the heroes banner from the owner's visual reference:
burgundy material, the existing ornamental frame, tavern illustration on the
right and the page's primary title on the left. The home page uses the same
header, with its navigation actions and class summary below it. Admin screens
keep their workspace headers.

Each page exposes one H1. Dynamic detail titles remain the entity's name;
filters, subscription gates, facts, recovery actions and navigation remain
available outside the title area. Long titles wrap without clipping at 320px,
390px, 768px and 1440px. Artwork never covers text and carries no accessible
content. Reduced motion produces no banner animation.

Use the existing shared `SectionBanner` for simple titles and retain the
compatible banner classes for headings with metrics. Banner presentation is
owned by shared UI; route composition supplies titles and contextual content.
No new assets, dependencies or data calls are required. The profile access tour
highlights the status and refresh header so its mobile bottom sheet does not
cover an arbitrarily tall list of access details.

## Working plan and documentation impact

1. Share the existing artwork presentation and migrate public headings.
2. Update component stories and header geometry checks.
3. Build both applications and Storybook, run focused contracts and Semgrep,
   then review public routes and stories in Chrome DevTools MCP.

Documentation impact: this specification, `CHANGELOG.md` and the banner
ownership/preload references in `apps/public-web/README.md`.

Selected skills: agent-resource-index, using-agent-skills, context-engineering,
codegraph, context7, spec-driven-development, planning-and-task-breakdown,
incremental-implementation, test-driven-development, frontend-design,
TypeUI fundamentals, browser-testing-with-devtools, react-best-practices,
frontend-testing-debugging, git-workflow-and-versioning,
documentation-and-adrs, code-review-and-quality, code-simplification and
shipping-and-launch.

## Bundle budget evidence

The shared banner stylesheet and recovery headings are now present on every
public route. Reviewed
initial gzip sizes increased by less than 1.5 KiB beyond the previous ceiling
on affected routes; only exceeded entries in `config/next-bundle-budgets.json`
were rounded up to the next 256 bytes. Unaffected ceilings and the checks that
keep administrator and paid Battlegrounds assets lazy remain unchanged.

## Release verification

Use the existing main-branch CI and immutable release pipeline, then verify
the health endpoint reports the task commit and review representative live
headers on desktop and mobile. On new clipping, navigation failures or client
errors, revert the task commit through the same pipeline. This change replaces
no asset bytes and needs no data migration.
