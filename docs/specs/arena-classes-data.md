# Arena class statistics

The `/classes` view displays only validated responses from `/api/winrates` or
previously validated responses cached for the same account and source. Static
example percentages belong exclusively to Storybook fixtures. The existing
server subscription checks and browser permission gate remain authoritative.

The view distinguishes initial loading, real results, an empty dataset, a
failed request with no usable data and stale real data. A stale notice means
that the latest update could not be confirmed, the server reports a fallback,
or the dataset timestamp is over six hours old. The visible source and update
timestamp describe the displayed dataset. Missing timestamps are explicit.
Empty and error states contain no fabricated rankings. A retry button requests
the source again; old requests cannot update the view after account changes or
unmounting.

Cache keys use `arena-classes:v3:<account>:<source>`. Entries expire after six
hours; the unscoped legacy keys are not reused. Invalid payloads, including the
former `initial` dataset, never enter the cache. HTTP 401 or 403 clears the
account's source entry and removes its displayed data. Storage failure does not
prevent network loading. A 304 without valid cached data retries without an
ETag; stale cache headers on a 304 remain visible as stale.

The deterministic client tests cover outage without cache, empty data, fresh
data, stale fallback, account isolation, cache expiry, authorization rejection,
304 recovery and invalid responses. Storybook covers each rendered state and
the retry action at desktop and mobile widths.

The module now also owns the page presentation shared by Vite and Next.js.
Its lazy JavaScript chunk is capped at 10,000 bytes; the measured migration
build is 9,682 bytes. The remaining Arena route stays capped at 73,675 bytes.
Vite uses explicit chunk ownership so the module cannot absorb a shared React runtime
and enter the initial dependency graph. The
[Rollup chunk contract](https://rollupjs.org/configuration-options/#output-onlyexplicitmanualchunks)
applies to the function form of `manualChunks`.
