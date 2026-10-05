# Public navigation stability

Status: implemented in `codex/navigation-stability-20261005`; the owner
authorized integration and production deployment on 2026-10-05. The immutable
release is identified by this change's Git commit and verified by the
production monitor after CI deployment. Base: `3e4cf5ec228495014a5d63b1f66d3d03c53cd5a2`.

## Problem and change

Public `navigate()` previously called `window.location.assign()`. Every page
created its own `PublicPageShell` and menu state. The desktop sidebar returned
to its initial scroll and closed its groups. A cross-document fade-through
also faded out the old content before revealing the next page, creating a
visible flash even when the server was fast.

The Next root layout now owns the actual navigation DOM and one viewer-access
provider. App Router replaces route content while the menu remains mounted.
Legacy callbacks and eligible real anchors use the same adapter; intent
prefetch fetches RSC rather than running another document. The document
transition, entrance script and hidden-document speculation rules are removed.
Standalone page shells still render navigation for component previews.

The access context holds a stable per-document snapshot store instead of the
changing profile object. React context propagation had invalidated a dehydrated
home article boundary when the account check finished before its chunk loaded.
Hydrated readers subscribe through `useSyncExternalStore`; the SSR snapshot is
the initial guest state, and verified changes publish in a layout effect before
paint. Revocation is synchronous, without a transition or delayed grant update.
The snapshot contract follows [React's SSR store guidance](https://react.dev/reference/react/useSyncExternalStore).

Mobile links close the drawer synchronously before navigating, releasing the
body scroll lock before Next records the history entry. The desktop scroll
and expanded groups persist. Modified clicks, downloads, external links,
fragments, APIs, identity, referral and admin links retain native navigation.
Malformed destinations do not throw during hover prefetch.

Access is quietly reverified on pathname changes and on bfcache restore;
account changes or failed verification hide paid grants. Request generations
prevent an older session/subscription answer from restoring a previous viewer.
The API payloads and server authorization checks are unchanged. Existing
Plausible tracking observes History API navigation automatically; the document
loads its script once, without additional pageview calls. This was checked
against the installed tracker and [Plausible's SPA contract](https://plausible.io/docs/spa-support).

## Verification, 2026-10-05

- Next production build and TypeScript check.
- Navigation/import/Express/search-parameter contracts: 18 tests.
- Browser navigation, drawer, bfcache/access and document-head contracts:
  7 tests, including native links without JavaScript, actual Ctrl-click,
  RSC navigation without a new document, menu DOM identity/scroll/groups,
  mobile lock release and Back position, revoked access and account switching.
- Registered tests and architecture/debt/catalog/route-manifest gates.
- Slow-chunk home hydration: server-rendered articles stay visible while the
  guest profile check finishes, with the article chunk deliberately held.
- Browser observatory checks the first skip link at the persistent Next root
  or standalone shell, then retains its viewport, sticky and keyboard checks.
- Changed-source Semgrep: zero findings and parser errors.
- Storybook MCP instructions and story discovery; ten affected desktop/mobile
  states reviewed in the browser. The persistent-menu stories exercise route
  changes and drawer closing. Storybook contracts and production build pass.
- Bundle budgets, dependency-only Knip, property checks and Sentry/privacy
  checks pass. React Doctor reports five advisory warnings: the real anchors
  intentionally retain native fallback while the adapter is mounted; context
  reads follow the existing React convention. No suppressions were introduced.

Chrome DevTools used its isolated profile, the project URL allowlist and
header redaction. App review covered 1440px desktop and 390px phone widths,
visible clipping/overflow, console, network and accessibility structure.
There was no horizontal overflow or application console error. The existing
unused CSS-preload warning remains; it also occurred in the production baseline.

## Performance evidence and limits

| Local production build, guest | Desktop | Phone, CPU 4x |
| --- | ---: | ---: |
| Click to committed route, observed frames | 64 ms | 116 ms |
| Interaction duration reported by Chrome trace | 39 ms | 56 ms |
| Observed CLS | 0.00 | 0.00 |
| Menu DOM preserved on every sampled frame | yes | yes |
| Content opacity on every sampled frame | 1 | 1 |

These are single local Chrome samples with a fixture backend and no network
throttling. They are not field INP, a cross-browser benchmark or a production
speed guarantee. The older cold production phone sample had LCP 1556 ms and
TTFB 925 ms; its remote network/server conditions differ, so it is not used
as a before/after comparison with these local route samples.

The shared adapter adds some initial JavaScript. The reviewed home build has
about 159–160 KiB gzip JavaScript and 34 KiB CSS. Only exceeded JavaScript ceilings
were rounded up to the next KiB in `config/next-bundle-budgets.json`; existing
CSS ceilings and already sufficient JavaScript ceilings were retained. The
stable access store adds approximately 150 bytes gzip to the shared runtime;
three newly exceeded ceilings were rounded up by the same next-KiB rule.
The CI build measured about 0.6 KiB more shared JavaScript than the local build;
the thirteen ceilings exceeded in CI were likewise rounded to the next KiB.
Both builds remain covered by the same route budgets; CSS limits are unchanged.
The tradeoff is paid once per document; client routes reuse the runtime and menu.
First-visit server latency, DNS/TLS and legacy view hydration still need their
own measured work if cold loading remains slow. Application cache and deployment
gates remain unchanged. Before publishing, the root-managed edge sync and monitor
configuration was aligned with the existing Moscow/Novosibirsk DNS topology:
the disconnected Limburg host had caused the previous deployment to fail after
the application release was activated. Both active edges passed the regional
monitor and static synchronization. See
`docs/runbooks/hearthpulse-domain-migration.md` for the configuration and backup.

## Documentation and public update

Updated documentation: `apps/public-web/README.md`,
`docs/specs/public-client-navigation.md`,
`docs/architecture/module-boundaries.md`,
`docs/runbooks/hearthpulse-domain-migration.md`, this runbook and `CHANGELOG.md`.
The required public update is [Telegram message 502](https://t.me/changelogarena/502),
posted under the current release version with an explicit awaiting-integration
notice. It does not announce a production deployment.

## Repeat the checks

### Follow-up: group layout and prefetch freshness

The 2026-10-05 production phone sample (390×844, CPU 4x) showed a second
109px control movement around 108ms after switching groups: the old group
kept 106px of height during its discrete display transition. Group display
now changes immediately; appearance still uses the shared motion tokens.
The drawer's popover and scroll-lock behavior is preserved for iOS and Back.

The permanent prefetch set now follows Next's `onInvalidate` callback.
Repeated intent reuses a fresh request, stale intent can prepare a new one,
and invalidation alone starts no request. A synchronous speculative failure
allows a later retry. Desktop/closed-drawer transitions skip the unnecessary
`flushSync`; open-drawer transitions still close synchronously.

Regression coverage: `tests/next-navigation.test.ts` exercises fresh/stale
intent and failure/retry; `tests/next-page-transitions-browser.test.mjs`
checks zero closed-group geometry and no delayed control movement on desktop
and mobile, together with its existing navigation/history/native-link checks.
Persistent navigation stories exercise group switching before route changes.

Local production-build review at 390×844/CPU 4x sampled 15 frames after a
group switch: the closed group's height was zero throughout, and the control
had zero subsequent movement. Mobile FAQ→tierlist kept the document and menu,
closed the drawer, and Back restored scroll 600→600. The observed transition
was 147ms in the local fixture, not a production speed comparison or field INP.
All four focused navigation/mobile/head/canonical browser tests passed;
Next contracts (20), motion tokens (3), shell, TypeScript, architecture,
Storybook build/contracts, existing bundle budgets and documentation gates
passed. Changed-source Semgrep found no issues. Desktop and mobile persistent
stories were visually reviewed; no overflow or application console error was
found. The pre-existing unused CSS preload warning remains. No bundle ceiling
was increased. A separate read-only review found no required corrections.

Documentation impact: this runbook, `docs/specs/public-client-navigation.md`
and `CHANGELOG.md`. The public-web README and architecture contract remain
accurate: no route, access rule, data contract or ownership boundary changed.

```sh
npm run agent:session:preflight
npm run build:next
npm run lint:next
npm run lint:architecture
npm run test:next-contracts
npm run test:registry
node --test --test-concurrency=1 \
  tests/next-page-transitions-browser.test.mjs \
  tests/next-mobile-menu-browser.test.mjs \
  tests/next-bfcache-browser.test.mjs \
  tests/next-document-head-browser.test.mjs
npm run budget:next
npm run security:semgrep
npm run test:storybook
npm run build-storybook
```

Start the local gateway on allowed port 3000 and repeat the menu transitions
through Chrome DevTools MCP. On mobile, scroll a page before opening the drawer,
follow a link, then use Back. On desktop, expand a group, scroll the sidebar,
and confirm its DOM/scroll remain unchanged after navigation. Review browser
console/network and the target page's metadata. Keep Chrome protections enabled.

With the owner's commit/push/deploy authority, commit in this task worktree,
run integration preflight on the clean branch and integrate
through the normal pipeline and report the resulting commit and Production SHA.
A public changelog post for this unreleased task must say it awaits integration.
