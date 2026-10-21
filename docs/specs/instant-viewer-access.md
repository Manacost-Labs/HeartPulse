# Instant viewer access

## Objective

A signed-in visitor sees their account in the menu, and a subscriber sees the
paid pages they may open, from the first client paint, instead of a guest
header, an access check or a paywall while `/api/auth/me` answers. Public
HTML stays the same for every visitor, and a shared or restored device never
shows a previous viewer.

## Contract

- Access is one explicit state (`apps/public-web/ui/accessState.ts`): a
  phase (`unknown`, `pending`, `confirmed`, `unavailable`), the viewer on
  screen and its grants, and where they come from (remembered, session,
  sign-in). `usePublicAccess` turns server answers into its events after
  dropping any answer about another session. A paid section reads only
  `paidAccess` / `entitlementAccess`: `granted` shows the paid view (paid data
  renders only then, for the current viewer), `pending` its loading state,
  `unavailable` a retry, and `denied`, reached only through a server answer,
  the lock or paywall. The header search shows subscription locks only once
  the phase is `confirmed`. `tests/public-access-state.test.ts` holds the
  transition table.

- Server HTML and hydration still render a guest whose access is being
  checked (`usePublicAccess()`, `checking: true`). Viewer and paid data never
  enter server HTML ([public document caching](public-document-caching.md)).
- Sign-in sets, with the session cookie, a readable companion cookie
  `hp_viewer`: a 22-character one-way digest of the session token
  (`server/modules/browserSessionCookies/public.ts`). It grants nothing.
  Sign-out expires it with the session cookie.
- `/api/auth/me` writes no cookie at all, not even when it extends the session
  or answers as a guest, so an answer that reaches the browser after another
  tab signed out or in cannot put the previous session back or take the new
  one's tag away
  ([decision](../decisions/session-cookies-written-at-sign-in.md)). It reports
  `sessionExpiresAt`. A guest answer names the tag its request carried; when
  the browser still holds exactly that tag, the page forgets it
  (`forgetViewerTag`) together with the remembered viewer.
- Every answer is re-checked after each `await`, right before it is acted
  on: still the same check, the same session tag, and no other viewer
  confirmed meanwhile. That holds for the session check, a sign-in's
  subscription answer and a subscription refresh.
- After each answer that confirms both the account and its subscription, the
  browser writes `hs_arena_viewer_hint` to `localStorage`
  (`apps/public-web/ui/viewerHint.ts`): version, the `hp_viewer` value, an
  expiry 72 hours ahead, the viewer digest of `restoredPageAccess.ts`, the
  account id, name, role, avatar and administrator flags, and the granted
  entitlements. Its expiry is never later than `sessionExpiresAt`, so a
  session that ended on its own shows nobody. It stores no e-mail, contacts
  or provider details. It is
  written only under the session tag that was current when the server
  confirmed the account, so a sign-in that replaced the session meanwhile
  never inherits the previous account. A guest answer for its tag and
  sign-out remove it.
- The remembered viewer is shown only while its `hp_viewer` value equals the
  cookie, it has not expired, and its digest equals both its own content and
  the viewer the server last confirmed in this browser. Anything else,
  including unreadable storage or a malformed value, shows nothing; a value
  under another tag, without a tag or past its expiry is removed when read.
- The head script (`apps/public-web/lib/authPrefetch.ts`) applies the same
  rule before the first paint and marks `<html data-hp-viewer="remembered">`.
  The access placeholder (`PaywallPending`) then keeps its height but hides
  its "checking access" text, also in server HTML that has not hydrated yet.
  The mark is removed when no viewer is remembered after all, or when the
  check makes the remembered viewer pending again.
- `/api/auth/me` names the session it read (`viewerSession`, the same tag,
  when the request carried it; null for a guest or a session from before the
  tag, which works but is never remembered). An answer, or the subscription
  answer after it, that arrives when the browser holds another tag (a sign-in
  or sign-out in another tab meanwhile), or after another page of ours
  confirmed a different viewer since the check began, is discarded: nothing of
  it is shown or remembered, and the check runs again. Only such a named
  answer is remembered; an API build that does not name the session yet
  (during a deploy), a sign-in or profile answer and a subscription refresh
  update the page but write no hint.
- Before the first client paint the access state shows the remembered viewer
  with `provisional: true`, `grantsPending: true` and `checking: false`, so
  entitled pages render their paid view and start their chunks and data
  requests while the session check runs. Pages decide with `paidAccess`: a
  grant opens the page, but a missing grant keeps it pending until the server
  confirms the refusal, so a remembered refusal (an old plan, or a section
  bought since) never shows a lock. A sign-in likewise leaves the grants
  pending until its subscription answers. The check then runs quietly: the
  same answer clears `provisional`; another account, a guest or changed grants
  replace the viewer in the next render (a revoked subscription shows the
  gate). Account pages (`/?login`, `/connect/`) treat a provisional viewer as
  still checking.
- A `401` from `/api/subscription/status`, after the session answer or after
  a sign-in, means the session ended: the page shows a guest and forgets the
  viewer (hint, session hint and record).
- Paid data is authorized by the API on every request; the remembered viewer
  only decides what the page renders while it waits.
- A failed check (no answer, `429`/`5xx` or the deadline) is neither a grant
  nor a refusal. `paidAccess` reports it as `unavailable`: the page shows,
  in the gate's place, what happened and «Повторить проверку»
  (`AccessUnavailable`), never the lock or the subscription pitch; the card
  statistics keep their rows with the same retry.
- A session check retries a remembered session at most twice within ten
  seconds. The deadline bounds the whole check, including a response body
  that never finishes (the head's early request has no signal of its own),
  and a late result is ignored. A remembered viewer the check cannot confirm
  is hidden again. Then the page leaves the
  pending state: the account it could confirm, if any, and a gate that says
  the check failed and offers «Повторить проверку», which runs the check
  again. Nothing polls after that.
- Full-page gates show `PaywallPending`, never the locked preview, while the
  check runs (`/standard/matchups/` and `/standard/vicious-gold/` included).
  The Standard meta loads its public teaser during the check, whatever the
  browser remembers; full access replaces it. A remembered subscriber, who has
  access from the first client paint, reads the full slice only.
- A paid panel shows a lock, the inline paywall or an "available to
  subscribers" preview only after a confirmed answer without access. While
  access is checked, or a subscriber's paid data is on its way after access
  was granted, it keeps its loading state: card statistics keep their rows
  with loading values (`PendingStatsRows`), the card catalog leaves its
  statistics blank and unlocked, and the archetype page holds its builds'
  loading place instead of the build preview and the paywall.
- A page restored from the back/forward cache does not use the remembered
  viewer: before its first frame it hides any viewer and turns pending, a
  guest's page too, and every check until one confirms both answers (the
  retry included) shows a viewer only together with its subscription
  ([public document caching](public-document-caching.md)).

## Remaining gap

A session revoked on the server ([account sessions](account-sessions.md):
«Завершить», «Выйти на всех других устройствах») is refused by the next
request that carries it, the session check and every paywall included, and
the guest answer names its tag, so the browser forgets the remembered viewer.
A browser that was not open when its session ended can learn that only from
that next answer: one new page there may still show the remembered account in
the header for one session check. Paid data never reaches it, because the API
refuses the ended session (`tests/next-account-sessions-browser.test.mjs`:
no frame shows the paid card statistics). Restored pages do not have this gap.

## Verification

`tests/public-access-state.test.ts` checks every transition and what each
section shows in each state. `tests/public-viewer-hint.test.ts` checks the
record, its binding, expiry, stored fields and the head script.
`tests/browser-session-cookies.test.ts` and
`tests/auth-profile-routes.test.ts` check the companion cookie.
`tests/next-instant-access-browser.test.mjs` samples every frame of a
remembered subscriber on three paid pages at desktop and phone widths (no
gate, preview or access-check text; the account before the session answer;
`HP_FILMSTRIP_DIR` saves a screencast filmstrip), a revoked subscription, a
shared device after the session ended and another account's session, a sign-in
of another account while the check is on its way, a check whose response body
never finishes, and a session check or subscription service that keeps
failing. `tests/client-identity-early-session.test.ts` checks the hung body
and the session identity; `tests/next-bfcache-browser.test.mjs` a session
revoked while the page was frozen, and a page restored as a guest after a
sign-in, with late session and subscription answers (no lock frame) or a
failing one and its retries (still atomic);
`tests/next-soft-paywall-requests-browser.test.mjs` the meta requests of a
guest, a new and a remembered subscriber.
`tests/next-paid-panels-pending-browser.test.mjs` samples every frame of a
subscriber with a late subscription answer on a card page, the card catalog
and an archetype page: no lock, paywall or subscribers' preview appears; a
card page restored by Back shows no paid statistics until access is confirmed
again (late or failing answers). The instant access browser tests also cover a
late `401` about the previous session (the new session's memory stays) and a
failed or hung check in a browser with no memory of a session (unavailable,
never a lock), a late guest answer after another sign-in (the new tag
stays), a subscription body that arrives after another sign-in (session
check and sign-in: dropped), and header search with a remembered refusal and
a late subscription answer (no lock).
`tests/next-paywall-access-check-browser.test.mjs` checks the
guest placeholder, including matchups and Vicious Gold. The same browser test
file checks a remembered refusal and a sign-in with a late subscription answer
(no lock) and a sign-in whose subscription answer is 401 (a guest).
`tests/auth-persistence-integration.test.mjs` checks on the real server that
no session check, not even one that extends the session, writes cookies.
