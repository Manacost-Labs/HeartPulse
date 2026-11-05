# CI performance

## Objective and acceptance

Target the full merge-queue validation, from workflow creation to completion
of `CI required`, including runner queue time: p50 at most 120 seconds and
p95 at most 150 seconds over at least ten successful full runs with warm
caches. Track cold-cache runs separately. Deployment is a separate metric.
Every existing required check and every selected test must remain covered;
retries, quarantine membership and release reuse retain their current rules.

## Implementation sequence

1. Record machine-readable per-file times and refresh the historical weights
   from successful full runs. Keep failed/retried files out of the calibration.
2. Measure runner queue/setup time and available concurrency before increasing
   the matrices. Split the longest browser files into independent scenarios.
3. Benchmark isolated workers and balance registry and browser work by time.
4. Split the observatory into independently runnable scenario groups with
   complete coverage and reuse the validated application build where possible.
5. Remove unnecessary build/Storybook dependencies. Eliminate repeated type
   checking only after an equivalent required check covers generated Next types.
6. Replace incidental browser waits with explicit readiness checks, preserving
   tests whose subject is a timing contract. Validate the target over ten runs.

The initial slice owns the test runner, its duration calibration, the CI timing
artifacts and focused tests. It adds no dependencies and preserves test selection
and required-check conditions. Subsequent slices must measure the next critical
path rather than assume linear speedup.

## Baseline

The successful merge-queue run
[41827672747](https://github.com/Manacost-Labs/HeartPulse/actions/runs/41827672747)
completed its required job about 412 seconds after the first job started.
The browser shard 8 test step took 304 seconds; its full job took 340 seconds.
The historical weights came from October 20–21 and underestimated several
tests. These are observations, not a post-change benchmark.

The initial recalibration uses successful full merge-queue runs `41796198528`
and `41827672747`. Replaying their recorded browser durations with the old
and refreshed weights changes the longest shard from 295 to 201 seconds and
from 304 to 212 seconds respectively, at the same nine shards. This is an
in-sample balance estimate; setup, artifact upload, other jobs and future
execution variance are not included. It does not establish the two-minute SLO.

## Refreshing test weights

The shard artifacts are named `test-timings-registry-*`,
`test-timings-browser-*` and `test-timings-quarantine`. They retain 14 days of
JSON observations. Download at least two **successful full** merge-queue or
main-push runs into separate directories, then update the checked manifest:

```bash
gh run download FIRST_RUN_ID --repo Manacost-Labs/HeartPulse \
  --pattern 'test-timings-*' --dir /tmp/ci-timings/FIRST_RUN_ID
gh run download SECOND_RUN_ID --repo Manacost-Labs/HeartPulse \
  --pattern 'test-timings-*' --dir /tmp/ci-timings/SECOND_RUN_ID
node scripts/update-test-durations.mjs --reports /tmp/ci-timings
```

Use a fresh directory for each calibration window. The command recursively
reads JSON reports (or one JSON file containing a report or array of reports).
It calculates a median PASS duration from at least two distinct runs per file.
Zero durations get a 1 ms floor. Existing weights without enough samples and
the default weight remain unchanged; removed tests are pruned. Review the diff
and normal CI checks before integrating the manifest. No commit or push is
performed by this command.

Only the latest supplied attempt of each run is considered. By default PR
observations, pushes outside main, quarantine-only reports, flaky files and
failed/incomplete shards do not calibrate weights. Duplicate observations,
conflicting SHA values or malformed durations fail the command before it
writes the manifest. The
command does not query GitHub or attest provenance: the operator must choose
successful full runs from this repository, not artifacts supplied by a PR.
JSON files are checked and read through the same open descriptor; the fixture
static server follows the same rule to avoid file-check/read races.

For full-repository benchmark PRs, an operator may pass `--allow-full-pr` after
checking the provenance and successful workflow result. Every supplied PR run
must then contain complete PASS/FLAKY results covering the entire current
unquarantined registry; narrowed, incomplete or failed runs are rejected.
Duplicate protection, latest-attempt selection, the two-distinct-run minimum
and exclusion of FLAKY samples remain in force. This explicit option lets a
benchmark PR replace split-file estimates after two full measurements without
weakening the default main/merge-queue calibration policy.
The first calibration predates JSON artifacts and was bootstrapped from the
START/PASS/FLAKY timestamps in those two runs' complete shard logs.

## Parallel execution and build contract

All shards use the same checked `tests/test-durations.json`. Calibration is
reproducible but is not automatically committed by CI. The worker wrapper
runs four browser workers in each of ten jobs and two registry workers in
each of four jobs. More workers are rejected above four per job. Reports and
process groups are separate; the aggregate waits for every worker and retains
failure and cancellation behavior. These are CI processes, not agent sessions.

The observatory downloads the validated build and runs four batches, each
with two isolated Next/backend/browser runtimes. `scripts/qa/groups.mjs`
assigns all eight groups exactly once: desktop/mobile authenticated routes,
desktop/mobile admin, public pages, home, navigation, and shell/responsive.
The full responsive cross product and its aggregate ratchets stay in one
group. `QA_PART` standalone modes remain available; disjoint part/group
selections fail. Every scenario assertion is preserved. CI sets
`QA_SCREENSHOTS=responsive`: the responsive inventory still captures every
required PNG and hash, while other screenshots are optional diagnostics.
Standalone QA retains all screenshots. Per-group wall times are logged.

The release build alone sets `HP_CI_SEPARATE_NEXT_TYPES=1`. The required
static gate runs `next typegen` and the same TypeScript compiler on the Next
project, including generated route validators. The build's configured
`lint:next` check remains too. Standalone builds keep their embedded Next
check. A deliberate TS2322 in a temporary app module was rejected by the
separate gate during local verification; the probe was removed.

The skeleton-route geometry suite is split by viewport without changing its
route/geometry assertions. Archetype geometry waits for DOM content, its
explicit ready selector and fonts instead of network silence. CI backend
fixtures opt into the compiled release to avoid concurrent repeated TypeScript
transpilation; standalone source fixtures are unchanged. The production scraper
smoke test also uses that build, avoiding a rebuild of files used by siblings.
Soft-paywall coverage runs as three independent overview, filter and layout
files with shared assertions in `tests/helpers/softPaywallBrowser.mjs`.
Identity continuation is split into guest, context and delayed-layout files;
the one-second delayed response, observation windows, viewport matrix and
security assertions are retained in a shared helper. Knip's project includes
authored test helpers so their dependency use remains visible to the static gate.

## Verification status

The first hosted PR run
[42039456378](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42039456378)
passed `CI required` in 251 seconds from workflow creation (raw Actions API
timestamps). The initial matrix was six registry and ten browser jobs. Build
and smoke took 57 seconds, registry identity continuation 107 seconds, the
slowest observatory batch 106 seconds, and one browser job started 66 seconds
after its siblings. This PR observation does not calibrate checked weights.

The follow-up reduces the matrices to four/eight to leave runner headroom,
splits identity continuation and omits only optional screenshots. Its hosted
run [42043123385](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42043123385)
passed the required gate in 314 seconds, including 89 seconds before any job
started (225 seconds after first start). Browser jobs started together. Registry
guest/context timings were 54/47 seconds against initial 14-second weights,
leaving a 108-second shard; the longest browser shard took 115 seconds.

The next pass uses four/ten jobs and retains one Webpack cache per PR, lockfile
and Next config. GitHub scopes that cache to the PR merge ref, so it cannot
replace main's cache. The bounded key avoids a new large cache on every push;
Next still invalidates changed inputs. See the
[GitHub cache scope rules](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).
Run [42047977667](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42047977667)
saved the PR cache successfully, but required validation failed in the media
lightbox landing test on both attempts. Its RAF sampler could miss the final
compositor frame before the flying copy was removed. The follow-up observes
actual geometry in `Animation.finished` before removal, retains frame sampling
and the existing 40 px tolerance, and explicitly asserts animation completion.
A probe dropping late RAF observations reproduces the old failure and passes
with the fix. The local parallel shard completed using its standard retries
after backend-startup failures on this shared host; the landing assertion
passed. All nine lightbox tests also passed in an isolated run without retries.
This failed hosted run cannot calibrate weights.

A disposable Turbopack probe failed after 5.8 seconds: four explicit `.js`
TypeScript import-resolution errors, invalid generated CSS at
`section::after::after`, and a UMD/CommonJS-format warning. The probe config and
tsconfig were restored. No compiler or product behavior change is included.

All original eight observatory groups, skeleton viewports
and paywall groups passed locally. Local full parallel runs saw network-change
browser errors and timing sensitivity on this shared host; failed files passed
in isolation, and hosted required jobs all passed. Historical replays and one
PR run do not establish the warm-cache, full-run two-minute SLO.

## Verification

Focused runner and workflow tests must prove deterministic complete sharding,
timing output on success/failure, and unchanged failure propagation. Calibration
must ignore failed, flaky and unrun files, reject malformed or duplicate
observations, and preserve weights without enough fresh samples. Keep run IDs
with the calibration for reproducibility. A replay of recorded times estimates
balance only; only a new GitHub Actions run measures actual CI improvement.
