# Admin console on Valyro

## Status

Implemented on 2026-10-23 from the owner's request: the admin panel was
inconvenient and laggy and is rebuilt on the vendored Valyro UI kit. It
supersedes the frame of
[the TailAdmin workspace shell](admin-tailadmin-workspace-shell.md); the
section contracts of [the CRM](admin-crm.md) stay as they are. The rebuild
ships in slices; this document describes what is live.

## Measured problems (2026-10-23, before)

Local production build, 4× CPU slowdown, 150 ms round trip, 4 000 seeded users
(see *Measurement*):

- The frame rendered before its stylesheet arrived and then jumped: first-load
  CLS 0.93, 0.88 of it from one shift of the whole layout.
- Code and access loaded one after another (page JS → `/api/auth/me` → panel
  chunk → shell chunk → section chunk → data); the overview data was
  requested at 2.3 s.
- Every section switch and every return refetched everything: 180–700 ms per
  switch, the same on the second visit.
- Boosty waited for boosty-auth on every visit: 4.4–5.4 s each time.
- The contests list loaded on every start, whatever the section.
- Article read statistics waited for the article list.

## Frame

`src/features/adminConsole/AdminConsoleShell.tsx` composes Valyro
`ThemeScope` (`manacost` theme, site Inter font), `AppShell`, `Sidebar` and
`CommandPalette`. Modules may not import `src/vendor`, so the frame lives in
`src/features`; `src/modules/adminWorkspace` keeps the domain-neutral parts
(the data cache and the shared look of section content).

- Grouped sidebar: Рабочий стол, Люди и деньги, Контент, Рост, Система. It
  folds into a 56 px icon rail; the choice is remembered in `localStorage`
  (`hp-admin-sidebar-collapsed`, read in `try`/`catch`).
- Below 960 px of shell width the sidebar is a modal drawer (focus trap,
  Escape and scrim close it, a «Закрыть меню» button in its header).
- Top bar: the sidebar toggle, the path (group › section), «Найти раздел»
  with Ctrl+K / ⌘K opening the command palette over all sections, the
  operator's name.
- Page heading `h1#admin-section-title` with the section caption; the content
  region `#admin-section-<id>` is labelled by it and carries
  `.admin-workspace-content`.
- One toast `.admin-toast` (status or alert) with «Закрыть уведомление»;
  success toasts leave after 6 s.
- Touch screens get 44 px sidebar rows and controls.
- Contest-only administrators see only «Конкурсы», as before.

Section URLs (`?section=<id>`, the legacy `?section=list` and `?contest`)
are unchanged and parsed in `adminConsole/adminNavigation.ts`.

## Loading contract

- `/admin/` renders a placeholder with the console's geometry
  (248 px rail, 56 px bar) while access is re-checked, then the console
  replaces it in place.
- The panel chunk starts downloading together with the access re-check. Only
  sessions the server already accepted for `/admin/` receive this page, and
  the chunk contains code, never admin data.
- The frame and its stylesheet are part of the panel chunk, so the frame never
  renders unstyled.
- A small module (`adminConsole/sectionPreload.ts`) downloads beside the panel
  code; once the access re-check succeeds it starts the opening section's code
  and data (`preloadAdminSection`), so the first screen shows its data at once.
- Pointing at a menu item, or focusing it with the keyboard, starts
  downloading that section's code before the click. Code is not prefetched
  on idle: a section the operator never opens costs nothing, and a connection
  lost mid-session still fails only the section that needed new code.

## Section data cache

`useAdminResource(key, load, options)` from `adminWorkspace/public.ts`:

- One in-memory store per tab; nothing is persisted. Keys are request paths
  with their query.
- An answer younger than 30 s is shown without a request; an older one is
  shown at once and refreshed in the background. Concurrent readers share one
  request.
- A failed refresh keeps the last data and reports the error.
- `keepPrevious` keeps the previous page on screen while a new page or filter
  loads (people list).
- `invalidateAdminResources(prefix)` after a mutation refreshes the mounted
  readers of that prefix and marks the rest stale; a request that was already
  running is followed by one more.

Sections on the cache: overview, people list and segment counts, articles
and their read statistics, gallery, contests, referral links, Boosty status
and subscribers, Telegram accounts, the mailing overview (refreshed every
2.5 s while a campaign is queued or sending) and the translation coverage
check (up to 45 s on the server; «Проверить ещё раз», a saved translation and
the BlizzCore sync refresh it).

While the first page of the people, Boosty or Telegram table loads, a Valyro
skeleton of about the same height holds its place
(`adminConsole/AdminTableSkeleton.tsx`), so the pager does not jump.

## Sections

Each section owns its state and data in `src/features/adminConsole/sections/`
(people, mailing, contests, referrals, Boosty, Telegram) or in its own lazy
feature file (overview, articles, gallery, translations, mechanics, parsers,
fun decks, Public API). `src/features/Contests.tsx` keeps only access,
the address bar, history and the toast, so typing in one section re-renders
that section alone.

- A section is mounted on its first visit and then kept behind React's
  `Activity` while another one is shown: drafts, filters, the selected
  contest and loaded rows are there on return without a render or a request.
  A hidden section's effects (polling, listeners, open menus) stop and start
  again when it is shown; sections on the data cache refresh then only when
  their answer is older than 30 s.
- Each section has its own error boundary; an error stays in that section
  until its «Повторить», the others keep working.
- The scrolling main area remembers the position per section; a section
  opened for the first time starts at the top.
- The overview's segment shortcuts open the people list on that segment once;
  showing the section again keeps the operator's own filters.

## Boosty answers on the server

`server/adminBoostyRoutes.ts` reuses a successful boosty-auth answer for one
minute and shares a request that is already running: the status and each
subscriber list (with or without inactive subscribers) are separate entries.
Failures are not cached. The section's «Обновить» sends `fresh=1` and always
asks boosty-auth again; a revisit inside the minute is answered from memory.
The mailing contact sync that rides on this read keeps running in the
background every six hours ([mailing audience](mailing-boosty-audience.md)).

## Measurement

A puppeteer probe (task notes, not in the repository) starts the production
build through `tests/helpers/publicCardPilot.mjs`, makes the session an
administrator, seeds users, throttles the CPU 4× and the network to a 150 ms
round trip, and records first-load CLS, long tasks, bytes, the request
waterfall, and for each section switch and revisit the time until the DOM
settles plus the API requests made.

After the first slice:

- first-load CLS: 0.93 → 0.006;
- without network delay: frame at 1.20 s and overview data settled at 1.34 s →
  frame and data together at 1.08–1.26 s (the overview request starts with
  the panel code instead of after the frame);
- at 150 ms on the local HTTP/1.1 server the frame now waits for more CSS
  files (2.5–2.8 s, data included) than the old shell (2.0 s, data at 2.45 s);
  production serves HTTP/2, where those files load in parallel;
- returning to Boosty: 4.4 s and 2 requests → 0.11 s and none;
- returning to the people list: 222 ms and 2 requests → 87 ms and none;
- returning to contests, referrals, Telegram or the gallery: 47–184 ms and
  one request each → 46–71 ms and none;
- the contests list is requested only in «Конкурсы».

Sections that still load on their own (translations, mechanics, parsers,
fun decks, Public API, mailing) keep their old timings until they move to the
cache.

## Verification

- `tests/admin-resource-store.test.ts`: sharing, freshness, stale display,
  error retention, invalidation.
- `tests/admin-console-navigation.test.tsx`: section list, groups, URL
  parsing, overview sections.
- `tests/next-admin-browser.test.mjs`: SSR boundary, desktop and 390 px frame,
  drawer, one main landmark.
- The admin part of `scripts/e2e-qa.mjs`.
