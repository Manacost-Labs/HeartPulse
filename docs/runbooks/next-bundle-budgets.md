# Next.js bundle budgets

`npm run budget:next` (`tests/next-bundle-budgets.test.mjs`, part of the CI
registry) measures the gzip size of the JavaScript and CSS that each public
route's server-rendered document references, and fails when a route grows past
its limit.

## Measurement

The gate and CI measure identically: the same test, gzip level 6, after
`normalizeAsset` in `scripts/next-bundle-budgets.mjs` replaces the compiled
release SHA (`releaseId:"…"`, `development` locally) and the 16-hex chunk
hashes with fixed placeholders. Before this, a CI build with `GITHUB_SHA` was
41–276 B larger than the local build of the same source. After it, a build with
and without `RELEASE_SHA` differ by at most 4 B per route (the minifier's name
choice), far below the tolerance. The gate fails if no chunk contains the
release-id literal any more, so a code change cannot silently break the
normalization. Every run writes `tmp/next-bundle-measurements.json`; CI
uploads it as the artifact `next-bundle-measurements-<sha>`.
`npm run budget:next:baseline` takes it from the newest successful push run
on `main`, or, when that push reused its merge-queue validation and ran no
tests, from the merge-queue run of the same commit.

## Limits

```text
limit = baseline + max(ceil(ratio × baseline), minBytes) + approvals
```

- `config/next-bundle-budgets.json`: policy only, `tolerance`
  (`ratio: 0.02`, `minBytes: 1024`).
- `config/next-bundle-budgets/baselines/<route-slug>.json`: one exact measured
  baseline per route (`/` → `home.json`, `/standard/cards/` →
  `standard--cards.json`). The route list is the set of these files.
- `config/next-bundle-budgets/approvals/<change>.json`: explicit extra bytes
  for one change.

The tolerance is cumulative since the last baseline refresh, not per PR: all
merged changes together must fit in it. The merge queue measures the combined
PRs, so a batch that exceeds it fails there. The formula is no looser than
the previous regeneration (`ceil(1.02 × measured)` rounded up to 1 KiB). The
switch itself re-measured every route: JS limits of `/legendaries/`,
`/tierlist/` and `/standard/meta/` rose by about 2 KiB over their old hand-set
ceilings, CSS limits stayed equal or tighter. Task branches may not edit the
policy file either; `agent:integrate` refuses it.

## Growth above the tolerance

Add a new approval file in the change; the PR diff makes the decision visible
and the merge records it.

```json
{
  "reason": "Чем оправдан рост: какая функция, почему её нельзя загрузить лениво",
  "routes": {
    "/standard/meta/": { "jsGzipBytes": 3072 }
  }
}
```

Bytes are the amount above the current limit (the failure message prints the
minimum). Use a unique name, e.g. the branch slug, so parallel approvals never
conflict. Never edit a baseline or the tolerance in a task branch;
`npm run agent:integrate` refuses baseline edits.

## Baseline refresh

Run in a dedicated PR, for example after a release or once approvals pile up:

```bash
git fetch origin main
npm run budget:next:baseline
```

It downloads the measurement of the newest successful `push` run on `main`,
refuses one that exceeds its own limits, rewrites every baseline, and deletes
only the approval files that existed at the measured commit; approvals merged
later stay. Commit the result with `npm run agent:integrate -- --allow-shared`.

A new route: add `baselines/<route-slug>.json` with zero sizes, run
`npm run budget:next` after a local build, and copy the route's measured
sizes from the failure message into the file. Only routes with a baseline are
measured.
