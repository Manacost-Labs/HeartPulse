# Content-Security-Policy for scripts

## Objective

Prepare a `script-src` policy without `'unsafe-inline'` for the Next.js public
web (#686), without changing any page: every inline script of the site is
registered and allowed by its sha256, the policy is built in one module and is
proven in a real browser. Production receives it only as
`Content-Security-Policy-Report-Only`, behind a build flag that is off by
default. Enforcing it in production is a separate decision after the reports.

## Inventory of script sources

### Inline scripts of the site

All are registered in `apps/public-web/lib/inlineScripts.ts` (`INLINE_SCRIPTS`)
and rendered through `apps/public-web/ui/InlineScript.tsx`; each source is a
constant, the same text on every response.

<!-- markdownlint-disable MD013 -->
| Id | Where | What it does |
| --- | --- | --- |
| `navigation` | `app/layout.tsx`, head | Remembered compact menu (`data-nav-compact`) and the menu's game mode (`src/app/shell/navigationPreference.ts`) |
| `authPrefetch` | `app/layout.tsx`, head | Starts `/api/auth/me` early and marks `data-hp-viewer="remembered"` (`lib/authPrefetch.ts`) |
| `runtimeConfig` | `app/layout.tsx`, start of body | Publishes the runtime switches on `window.__ARENA_RUNTIME_CONFIG__` from the JSON block before it |
| `analytics` | `app/layout.tsx`, end of body | Adds Plausible on the canonical host only (`lib/analyticsLoader.ts`) |
| `deckLayoutRestore` | `app/standard/fun-decks/page.tsx` | Marks the kept deck view (`data-deck-layout-restore`, #683) before the list is parsed |
| `unavailableSearch` | `lib/unavailablePage.ts` (the proxy's `503` page) | Section search of the offline page |
<!-- markdownlint-enable MD013 -->

The runtime switches change without a release (a root-managed file), so they
are not part of a script: the layout writes them into
`<script type="application/json" id="hp-runtime-config">` and the constant
`runtimeConfig` script parses that block. Consumers keep reading
`window.__ARENA_RUNTIME_CONFIG__` as before.

### Not subject to `script-src`

- `application/ld+json` and the runtime-config JSON block are data blocks; the
  browser never executes them.
- HTML set through `innerHTML` (`src/features/Battlegrounds.tsx`,
  `GuidesArchive.tsx`, `GuideArchiveExcerpt.tsx`) never runs its `<script>`
  elements. An inline event handler (`onclick=…`) inside such HTML would be
  blocked by an enforcing policy; none is known, and the report-only policy
  shows any that appears.
- Embeds (`/embed/…`, `lib/embedDocument.ts`) already send their own enforcing
  policy with the hash of their copy script and are excluded from the site
  policy (`SITE_POLICY_SOURCE`).

### Framework inline scripts

Next.js 16.4 and React write inline scripts into every document:
`(self.__next_f=self.__next_f||[]).push([0])`, the RSC payload
`self.__next_f.push([1,"…"])` and, on streamed pages, the React runtime
(`$RC`, `$RB`, `$RV`, `requestAnimationFrame(function(){$RT…`). The payload
differs per page and per render, so no fixed hash covers it. Next.js attaches a
nonce to them only on dynamically rendered pages, and its SRI option
(`experimental.sri`) covers external chunks, not these inline scripts.

### External scripts

- `'self'`: Next.js chunks under `/_next/static/` (including chunks webpack
  loads on demand) and the legacy Battlegrounds builders under `/bg-legacy/`.
- `https://stats.hs-manacost.ru`: Plausible, added by `analytics`.
- `https://telegram.org`: the Telegram login widget (`LoginPanel.tsx`).

## Decision: hashes, not nonces

`next build` prerenders `/standard/meta/`, `/standard/meta/wild/`,
`/standard/vicious-gold/`, `/battlegrounds/tier-list/`, `/tierlist/`,
`/tierlist/[class]/` and `/wild/` (ISR, revalidated every 5 minutes), and the
regional edge keeps one copy of every anonymous public document for all
cookieless visitors (`docs/specs/public-document-caching.md`).

- A nonce must be new on every response. Next.js can only put one into a page
  it renders per request, so every ISR page above would have to become
  dynamic; and the edge cache would replay the same nonce to every visitor
  until the copy expires, which makes it guessable. That trades ISR for a
  weaker guarantee, so it is rejected.
- A hash is a property of the script text. The registered scripts are
  constants, so one header fits every response, every prerendered page and
  every cached copy. Static headers from `next.config.mjs` apply to ISR pages
  unchanged (`x-nextjs-cache: HIT` with the header present was checked on a
  flagged build).

## Contract

- `apps/public-web/contentSecurityPolicy.mjs` is the only place that assembles
  the policy below, plus `report-uri` when configured:

  ```text
  script-src 'self' <registered hashes> https://stats.hs-manacost.ru
    https://telegram.org 'report-sample'; object-src 'none'; base-uri 'self'
  ```

- The registered hashes live in `apps/public-web/inlineScriptHashes.json`,
  because `next.config.mjs` loads without TypeScript. `npm run csp:hashes`
  rewrites the file from `INLINE_SCRIPTS`; `tests/content-security-policy.test.ts`
  fails while it is stale.
- `HEARTHPULSE_CSP_REPORT_ONLY=1` at `next build` time adds the policy as
  `Content-Security-Policy-Report-Only` to every document except embeds.
  `next.config.mjs` headers are compiled into the build, so the flag belongs
  to the build environment, not to the running service. Any other value, or
  none, sends no policy. This module never emits an enforcing
  `Content-Security-Policy`.
- `HEARTHPULSE_CSP_REPORT_URI` (optional) is the `report-uri`: a same-origin
  path or an https URL; any other value fails the build. Without it the
  browser reports violations to the console only. There is no report
  collector yet.
- A new inline script must be a constant added to `INLINE_SCRIPTS`, rendered
  with `<InlineScript id="…" />`, followed by `npm run csp:hashes`. A value that
  varies per request goes into a JSON data block instead.

## Verification

- `tests/content-security-policy.test.ts`: the policy text, the flag (off by
  default, report-only only, embeds excluded), the report URI check and the
  freshness of the hash file.
- `tests/csp-inline-scripts-browser.test.mjs`: the QA runtime
  (`scripts/qa/nextRuntime.mjs`) behind a loopback proxy that sends an
  enforcing `Content-Security-Policy` on every HTML response: the site policy
  plus the hashes of that response's framework scripts (recognised only by the
  prefixes above, so a site script without a registered hash stays blocked).
  On `/`, meta, an archetype, a card, Vicious Syndicate Gold, fun decks and the
  Battlegrounds tier list it checks that no violation is reported, that the
  head scripts mark the remembered viewer, the compact menu and the kept deck
  view, that the runtime switches arrive and that the page hydrates (the menu
  toggle answers a click). For every registered script of these pages it also
  drops that one hash and checks that exactly this script is blocked.

## Before enforcing in production

The registered hashes are ready; the framework scripts are not. The options,
each a separate decision:

1. Upgrade Next.js once `experimental.externalBrowserRuntime` (present on
   canary, not in 16.4) is stable: the RSC payload becomes an inert
   `<template>`. Whether React's streaming runtime still needs inline scripts
   must be checked then.
2. Hash every response before it is cached: a layer between `next start` and
   the edge reads the finished HTML, hashes its framework scripts and sends
   the matching header (what the browser test's proxy does). It keeps ISR and
   the edge cache, but buffers the document, which removes streaming and
   delays the first byte.
3. Nonces with every public page dynamic and no shared HTML cache: rejected
   above; listed only for completeness.
4. `'unsafe-inline'` with the other directives: keeps the host allowlist,
   `object-src` and `base-uri`, but gives no protection against injected
   inline scripts.

Turn the report-only policy on first, read the reports (all expected ones
start with `self.__next_f`, `(self.__next_f` or `$R`; `'report-sample'`
includes the first 40 characters), then choose.
