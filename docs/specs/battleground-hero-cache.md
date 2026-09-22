# Battlegrounds hero tier cache

Hero-tier data is cached by mode and MMR. A successful API response lasts five
minutes. A solo fallback snapshot lasts thirty seconds and retains its explicit
reserve-snapshot label. Duos never uses the solo snapshot. Expired entries
cannot satisfy a new request without another API attempt.

An open hero list observes its selected entry and refreshes at its expiry.
Snapshot recovery therefore does not require navigation or a browser reload.
A recovered API response replaces the snapshot and its source label. Concurrent
views and prefetches share an in-flight request for the same mode/MMR pair.
Failures release that request; if both sources fail, observers retry after
thirty seconds rather than looping immediately.

Closing the view or changing mode/MMR disposes its observer: pending shared
requests may finish, but the disposed view receives no callbacks and schedules
no more retries. The cache is in memory only and has eight possible keys.

Clock-controlled tests cover snapshot expiry, live expiry, recovery on an open
view, request deduplication, mode isolation, denied solo fallback for duos,
bounded retries and disposal during an in-flight request. The hero-list story
exercises the live view and navigation with deterministic API fixtures.
