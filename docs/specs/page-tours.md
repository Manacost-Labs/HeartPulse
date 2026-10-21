# Page tours

## Purpose

Dense statistics pages explain themselves: a short walkthrough points at each
control or chart on the page and says what its numbers mean. Coverage, rollout
order and the Vicious Gold specifics are in
`docs/specs/vicious-gold-performance-and-page-tours.md`.

## Components

- **Tour UI:** `src/features/pageTour/PageTour.tsx` renders the vendored Valyro
  Pro `Tour` (`src/vendor/valyro-ui/feedback/Tour.tsx`). It owns everything the
  kit cannot know: which anchors are rendered for this visitor, waiting for
  late data, the subscription fallback step, saved progress, the phone bottom
  sheet and the inert application root behind the dialog.
- **Copy:** `pageTourDefinitions.ts` holds one declarative entry per page:
  `id`, `version`, `paths`, `title` and 3–7 steps. Each step has an `id`, a
  `target`, a Russian `title` and `description`, an optional
  `mobileDescription`, an `audience` and an optional `media` explainer.
- **Route list:** `pageTourRoutes.ts` lists only `id` and `paths`. The header
  imports it eagerly, so the button can be rendered on the server. A registry
  test keeps it equal to the definitions.
- **Explainers:** `PageTourMedia.tsx` draws the step pictures as inline SVG.
  They are decorative: the step text carries the whole meaning.
- **First-visit rules:** `pageTourAutoStart.ts`.

## Anchors

- A step targets an element with `data-tour-id="<target>"`. The first rendered,
  visible match wins.
- Steps whose target is absent for this visitor or view are skipped.
- A tour without any visible step shows the subscription block
  (`subscription-paywall`) when there is one.
- Page code changes nothing for a tour except the attribute.
- `tests/page-tour-registry.test.ts` fails when a step target is rendered by no
  source file.

## Opening a tour

- **Header button.** «Как пользоваться страницей» (`.global-tour-button`)
  appears in the utility header on every page that has a tour. It is
  icon-only below 1180 px.
- **Help menu.** The menu also keeps the item «Обучение по странице».
- **Link.** `?tour=1` opens the tour after the page loads, and `?tour=0`
  suppresses the first-visit tour.
- **First visit.**
  - The tour starts by itself once per page and tour version. Any saved
    progress counts as seen: completed, skipped or left half-way.
  - It waits for the `load` event plus 1.5 s and an idle callback.
  - It does not start while a modal dialog is open or the tab is hidden.
  - It stays invisible until a step can be shown, and closes silently when
    no step appears within 8 s.
  - It never starts with only the subscription step: for a guest on a paid
    page that would be an advertisement, not a walkthrough.
  - It always begins at step 1.
- **Never automatic.**
  - Crawlers, preview fetchers and automated browsers never get a
    first-visit tour. This covers a bot user agent and
    `navigator.webdriver`, which also keeps CI and e2e runs undisturbed.
  - A visitor who pressed «Больше не показывать» never gets one either.
  - These visitors load only the tiny first-visit rules chunk, never the tour
    copy or UI.
- **Server rendering.** Only the button is rendered on the server. The tour
  code and copy load in the browser.

## Storage

Everything is stored only in `localStorage`. The site has no server-side
storage for user preferences. `PATCH /api/auth/profile` accepts only contact
fields.

- `manacost:page-tour:<id>:v<version>` holds
  `{ status: 'in-progress' | 'dismissed' | 'completed', stepId? }`.
- `manacost:page-tours:auto-off` is `'1'` after «Больше не показывать».
- Bump a tour's `version` when its meaning changes. Visitors then see the new
  tour once.
- A manual start resumes at the saved step unless the tour was completed.

## Interaction

- **Card controls:** «Далее», «Назад», «Готово», progress dots and «Шаг N из
  M». The footer has «Пропустить» on every step but the last, and «Больше не
  показывать».
- **Keyboard:**
  - Arrow keys page through the steps and Escape closes the tour.
  - Focus is trapped in the card, and the page behind is `inert`.
  - Focus returns to the control that opened the tour.
- **Placement:** `planTourStep` in `pageTourModel.ts` decides the layout.
  - A popover sits beside the target when one side has room for the whole
    card; the page scrolls so that the target and the card are both in view.
  - On a phone, or when no side has room, the card docks as a bottom sheet.
    The target scrolls into the free area above the sheet, below the sticky
    bars, and the spotlight is clamped to that area.
- **Visuals:**
  - The parchment card has the wood rail frame.
  - The page behind is softly dimmed and slightly blurred; there is no blur
    on phones.
  - A gold and red ring marks the target.
- **Motion:**
  - Motion uses `transform` and `opacity` only.
  - Under `prefers-reduced-motion` the ring, the explainers and the
    scrolling are static.

## Performance

- The tour UI, its CSS and its copy are lazy chunks.
- They load on a click, on `?tour=1`, or for an eligible first visit after
  load and idle.
- The header adds only the route list and the path resolver; the first-visit
  rules are a separate small chunk. `config/next-bundle-budgets/approvals/page-tours.json`
  approves the growth on the routes that were already at their budget.
- The button is part of the server HTML, so it causes no layout shift.

## Checks

- `tests/page-tour.test.ts`, `tests/page-tour-engine-contracts.test.ts`:
  resolving and restoring tours, and step planning.
- `tests/page-tour-auto-start.test.ts`: first-visit, opt-out and bot rules.
- `tests/page-tour-registry.test.ts`: the registry, copy limits, rendered
  anchors and the equality of the route list.
- `tests/global-utility-header-progressive-loading.test.ts`: the header never
  bundles the tour copy or UI.
- `scripts/e2e-qa.mjs` `auditPageTour`: focus trap, accessibility, viewport
  geometry and completion on desktop and phone.
- Storybook: `Features/Page tour`.
