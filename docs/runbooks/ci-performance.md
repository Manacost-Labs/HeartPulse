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

## Account scenarios and rejected twelve-shard trial

Run `42114399124` (`e24c8fa9`) passed all 36 checks and all 545 blocking
files without retries. The required gate finished at +193s. Browser shard 10
was last: Chrome warmup took 30.624s and its longest worker ran about 77s.
Both library viewport files passed. The two-minute target remains unmet.

The four account scenarios now register separately: delayed chunk loading,
shell surfaces, subscription/settings layout, and sign-in/linking/sign-out.
Their bodies are byte-identical to the original, preserving 35 assertion
sites, viewport lists, 45s/60s scenario timeouts, waits and cleanup. Each
scenario already owned its backend, Next and browser lifetime. The old
52.646s median is allocated into 9.505/17.628/14.941/10.572s seeds using
successful parent scenario durations, not new measured per-file medians.

The trial grew the browser matrix from ten to twelve jobs with four workers each.
Together with four registry and four observatory jobs this makes twenty test
jobs; GitHub can still queue them. Worker bounds, disjoint striped partitions,
PR subset scaling, failure handling and all required dependencies remain.
The dynamic workflow matrix already consumes this plan, so only its full-run
constant and the corresponding contract expectations change.

An in-sample replay using the latest successful file timings and parent
account scenario timings estimates the slowest worker at 80.329s with forty
workers and 67.248s with forty-eight. It excludes queues, setup and changed
contention, and does not establish a hosted speedup. Cold Chrome startup
remains an unresolved source of variation; no launch flags or timeouts change.

Current registry: 552 files, four quarantined, 548 blocking, 455 non-browser
and 93 blocking browser files. All four account scenarios passed concurrently
on four local CPUs in a clean run. The body comparison preserves all four
original test blocks exactly. Registry validation with 48 checks, 53 planner/
worker/calibration checks, workflow contracts, documentation lint and focused
Semgrep passed. The updated worker test covers all 48 global shards and
separate reports. All 548 blocking files occur exactly once in the partitions.
The hosted trial `42116391624` (`0ee6273b`) finished the required gate at
+232s: 547 files passed first attempt, while `next-instant-access` passed on
retry. All four extracted account scenarios passed first attempt. Browser
jobs 5 and 9 started at +137/+138s, whereas the other browser jobs started
at +71/+72s. The final job was the delayed shard 5, ending at +227s.
The replay did not account for this queue. Restore ten browser jobs, retaining
the four independent account files and their assertions. The worker contract
still tests both historical and twelve-job stripe arithmetic.

## Deterministic remembered-viewer response ordering

The retry in `42116391624` was an ordering assertion in `next-instant-access`:
the first recorded viewer appeared at 3396.4ms, after the session response
ended at 3372.1ms. A local probe delaying script requests by 4.5s reproduced
the same assertion on the unchanged test (viewer 4670.8ms, response 3023.8ms).
The fixed three-second fixture delay did not guarantee a response after the
first client render on a loaded runner.

Only the remembered-subscriber scenario now selects a per-context response
hold. It waits for the paid root and the recorded viewer while the session
answer is still held, then releases the answer in `finally`. The ordinary
three-second minimum delay also remains in force. The hold cookie is removed
after release; other scenarios retain their existing server behavior.
All original assertions remain, including the strict viewer-before-response
comparison, first-frame remembered marker, no gate/preview/checking frames,
and hydration checks across all three paid routes and both viewports.
Existing readiness and product session deadlines are unchanged. A page that
needs the held response to show the viewer fails the existing readiness wait.

The delayed-JavaScript probe failed before the change and passed after it.
All 17 instant-access scenarios then passed together on four local CPUs.
The restored plan passed 53 planner/worker/calibration checks and the workflow
contract; all 548 blocking files remain covered exactly once. Documentation
lint and focused Semgrep passed. The full hosted run must confirm stability
and queue behavior with the restored matrix.

## Pending paywall fixture and current-registry calibration

Run `42117968384` (`d92b1259`) passed all 36 checks. Its required gate took
290s from workflow creation: 547 files passed first attempt and
`next-paywall-access-check` passed on retry. Instant access passed first
attempt after its fixture fix. The release build started at +57s, and several
test jobs started late. Merge-queue run `42117621102` for PR350 overlapped
this run, so the wall time is not a controlled comparison of code changes.
The branch subsequently merged main `d2872835` without conflicts and rebuilt
static/server, Next and Storybook artifacts for the profile styling changes.

The paywall file failed two assertions: a gate appeared before the pending
assertions finished, and a paid view appeared 346ms after status response
completion. The first was reproduced by delaying the test reader for 1.5s:
the original 1.2s session timer expired between two assertions. The fixture
now holds session responses while the pending assertions run and releases
them in `finally`, retaining the 1.2s minimum delay. It also releases the hold
if assertions finish before the request arrives. All seven routes at both
viewports, pending checks and the CLS limit remain unchanged.

The delayed-reader probe failed before and passed after the fix. Both paywall
scenarios passed together on four local CPUs. The subscriber speed scenario
is byte-identical, including the strict 200ms bound and no-loading/CSS checks.
Its separate hosted timing failure was not reproduced in this isolated run;
the new full CI must verify behavior under the worker load. No timing limit
was relaxed and no scenario was quarantined.

The two successful full 552-file runs `42116391624/1` and `42117968384/1`
provide complete current-registry reports. The explicit full-PR calibration
produced 546 eligible medians and changed 540 weights. FLAKY observations
were excluded: instant-access and paywall-access-check retained their previous
weights because each has only one new PASS sample. Split-file seeds now have
measured medians; the default remains 15s. The output is reproducible from
the previous manifest and the selected reports. The runs include different
matrix sizes and shared-runner load; these medians guide balancing and do
not establish a hosted speedup.

After the main merge, all four account browser scenarios and 25 account UI
checks passed against rebuilt artifacts. Registry validation with 48 checks,
13 worker/calibration checks, workflow contracts, docs and focused Semgrep
passed. The calibrated partitions cover all 548 blocking files exactly once.

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

Run [42051834709](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42051834709)
passed all browser suites after the lightbox fix, but its first attempt failed
when the production scraper could not launch system Chrome. The isolated smoke
and exact two-worker registry shard (104 files, four CPU cores) then passed
locally without retries. A full same-SHA rerun failed observatory batches 2/3
before any scenarios: both browsers in each batch missed the DevTools endpoint
on both existing 60-second launch attempts, with no Chrome output despite
`dumpio`. These are startup failures, not scenario assertion failures.

Affected jobs used `ubuntu-latest`, resolved to Ubuntu 26.04 image
`20261101.186.1`. The same image also passed an earlier full run, so an OS-image
root cause is not proven. The workflow now pins every hosted job to
`ubuntu-24.04` to remove the moving OS target and test that mitigation; the
self-hosted deployment label is unchanged. The dependency cache already keys
on the actual OS version, preventing reuse of native modules from 26.04.
Launch limits, retries and all scenario assertions are unchanged. Verify this
mitigation in a fresh full hosted run before calling the startup issue fixed.
Neither failed attempt may calibrate duration weights. GitHub documents the
[gradual latest-image migration and explicit OS labels](https://github.com/actions/runner-images#latest-migration-process).

The first full run after the OS pin,
[42054746478](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42054746478),
passed all required validation in 299 seconds from creation (one second before
the first job, 298 seconds active). All 536 unquarantined files passed without
file retries. This is one successful observation, not proof that Chrome startup
is fixed. The build and Storybook jobs took 82/84 seconds; the slowest browser
job took 163 seconds, including a 142-second test step.

Complete artifacts from that run and successful full run `42043123385/1`
calibrated 535 eligible file medians; 534 values changed. The earlier run's one
FLAKY file and quarantine-only reports did not contribute samples. The
identity guest/context/layout weights are now 50.692/43.953/26.519 seconds,
replacing the initial split estimates. Failed runs are not in the input set.

The hosted logs also showed the four slowest browser files starting together
in job 1. Consecutive global shard numbers grouped the largest individual
files on one runner, causing contention despite an otherwise balanced LPT
partition. Worker assignment now stripes across jobs: job 1 of ten owns
`1/40, 11/40, 21/40, 31/40`, while job 2 owns
`2/40, 12/40, 22/40, 32/40`. Every global shard still executes exactly once,
with the same worker count, test selection and failure propagation. A focused
mapping test fails under the old assignment and passes under the new one.
A new hosted run must measure the effect; median estimates do not establish
the two-minute objective.

Run [42056699065](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42056699065)
verified the striped mapping with a green required gate in 215 seconds from
creation (one second before the first job, 214 seconds active). Its blocking
reports contain 533 PASS and three FLAKY files, so this is not a clean
first-attempt benchmark. Build/Storybook completed in 63/61 seconds. One
browser job started at +95 seconds instead of +68 seconds and completed last;
its test step took 98 seconds. Archetype geometry remained a 106-second file.

The next slice makes quarantine depend on `required`, leaving that optional
job's runner slot available for blocking checks. Its existing explicit
`!cancelled()` condition still permits execution after a failed required gate
when both builds succeeded; it remains non-blocking and PR/manual-only.
The browser registry and required gate never depend on quarantine.

Archetype/Vicious geometry now runs as three viewport files against one shared
assertion helper: desktop1350/1024, tablet768 and mobile412/360. All five public
widths, all four ready/loading pairs, selector lists, counts, two-frame layout
settling, readiness retries and 2px/4px tolerances are retained. Registry count
is now542, including four existing quarantined files. Initial part weights
allocate the measured original file median in proportion to viewport counts;
they are estimates until two complete PASS observations per part exist.
A fresh hosted run must verify the runtime effect of both changes.

Run [42058487409](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42058487409)
passed the required gate in264 seconds. All blocking jobs started at+67–70s;
quarantine started after the gate as intended. The three archetype geometry
parts passed in35.12/14.79/18.98 seconds. Two other browser files needed retries:
desktop route skeleton (146.5s total) and leaderboard state (94.3s total), so
this is not a clean first-attempt benchmark. The longest browser job's setup
also took longer; these measurements do not show an overall speedup.

A controlled local four-file probe on four CPU cores compared the same desktop
skeleton, mobile layout diagnostics, HSReplay deck and runtime-config files.
Two workers completed in53.010s; four in33.082s; both passed without retries.
The four-worker setting remains. Local timings do not establish hosted capacity.
The diagnostic-only mobile layout file took61.9s on the slow hosted job but
1.11s in the local four-worker probe. Other first files also showed large
hosted overhead. The next run logs `launch-start` and `launch-end` for each
Chrome attempt with entry basename, PID, outcome and elapsed milliseconds,
plus close-start/close-end timings around native browser shutdown.
This separates browser startup, scenario time and shutdown; the cause of the overhead
is still unknown. Logging is enabled in GitHub Actions, or locally with
`HP_BROWSER_TIMINGS=1`; browser flags, launch limits, retries and assertions
are unchanged. No URLs, browser options or arbitrary environment values are
logged.

The diagnostic run on identical source,
[42075959354](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42075959354),
passed the required gate in253 seconds. Browser shard8 started at+140s while
most test jobs started at+67s; hosted queueing remains a separate contributor.
Browser reports contain82 PASS and2 FLAKY files. In shard5, the first browser
launches took8.6–14.3s; subsequent launches took0.5–0.9s, while shutdown took
0.1–0.4s. Shard8's initial launches took11–20s; its next launches were generally
below one second. The observatory's initial launches took10.9s. These measured
phase differences do not prove why cold launch is slow; close is not the
observed bottleneck.

The subsequent hosted experiment tried Puppeteer's supported DevTools `pipe` transport
in GitHub Actions, avoiding WebSocket endpoint log discovery and its TCP
connection. Explicit `pipe`/`debuggingPort` options remain authoritative, and
standalone defaults are unchanged. Browser flags, profile isolation, worker
count, scenario assertions, deadlines and the existing WS-timeout retry rule
remain intact. Launch logs identify the requested transport. The installed
Puppeteer `LaunchOptions` and `ChromeLauncher` define this option; see the
[upstream launch contract](https://pptr.dev/api/puppeteer.launchoptions).
Compare the next hosted launch distributions and total required time before
retaining this experiment as a performance improvement. If cold launches do
not improve, revert the transport default rather than attribute queue or test
variance to it.

The pipe experiment in
[42077962936](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42077962936)
failed browser shard5 and therefore `CI required`. That job took827s; six files
failed after their normal retries and one was FLAKY. Failures included empty
backend-readiness timeouts, navigation timeouts and skeleton readiness. The
other nine browser jobs and four observatory batches passed. Its first Chrome
launches were slow too; the failed run is not a valid performance benchmark,
and neither transport causality nor resource exhaustion is proven.

The CI pipe default is reverted. The phase logs and explicit caller options
remain available. Required checks, timeout values, retries and worker counts
are unchanged. CI worker parents now log CPU availability, total/available
memory and one-minute OS load initially and every20s while workers run. These
numeric resource hints expose no process arguments, URLs or environment data.
The timer is unrefed and cleared after all workers settle, including failures.
Use future resource samples with the phase/file timings before changing
concurrency or attributing a slow host to memory/CPU pressure. Failed pipe
reports must not calibrate duration weights.
The rollback passed the exact four-worker browser shard5 locally: all eight
files PASS without retries. Worker lifecycle tests, docs lint and selected-source
Semgrep also passed. The hosted rollback run
[42081325514](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42081325514)
passed `CI required`: 537 blocking files PASS and one FLAKY, out of538. Creation
to required completion was517s. Many jobs waited well after build completion;
browser shard1 started at+399s and took112s including setup and cleanup.
The sampled browser runners (shards1 and5) had4 CPUs and about16GiB total RAM,
with at least12GiB available in the recorded samples. Initial Chrome launches
still took roughly9–16s, while subsequent launches usually took under1s.
These samples do not demonstrate memory exhaustion, and do not establish the
cause of the first-launch delay. Queueing and scenario execution remain
separate contributors; the two-minute acceptance target is not met.

The bfcache file took95.717s in that run. Its five tests already start their
own servers/browsers and clean them up independently. They now register in
three files: headers/navigation, subscription confirmation, and account
switch/offline/client navigation. A shared registration helper retains all
five original test bodies,47 assertion sites, delayed responses, sampling
windows, offline cases and cleanup. The three files can be assigned to
independent workers; no browser or session is shared between them. Their
initial weights divide the old median by the observed scenario durations
in42081325514 and are explicitly estimates until two full successful runs
supply PASS samples for each part. A source reconstruction check preserved
the original scenario text exactly after removing registration wrappers and
adjusting moved import paths. All five tests passed together on four local
CPUs. The hosted split run
[42084172679](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42084172679)
passed `CI required` in223s:538 blocking files PASS and two FLAKY, out of540.
All three bfcache files passed. Their navigation/subscription/session durations
were83.311/21.833/74.984s; the split alone does not establish a stable speedup.

Browser shard1 exposed a more specific startup difference. Its embed and
bfcache launches waited56.870s and55.106s while archetype detail launched in
1.074s on the same runner. Available memory stayed above13GiB during the wait,
and recorded load was low. Source fallbacks select `/usr/bin/chromium` for
the former tests and `/usr/bin/google-chrome` for archetype detail. Only the
observatory job had explicitly set `CHROMIUM_PATH`. The hosted image installs
[Chrome and a separate Chromium snapshot](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/install-google-chrome.sh);
these are different executables, not interchangeable path aliases.

Registry, browser and quarantine jobs now explicitly set
`CHROMIUM_PATH=/usr/bin/google-chrome`, matching observatory. The embed and
identity fixtures also honor this existing override before their standalone
fallback list. Launch diagnostics record the executable basename so the next
run can confirm the chosen binary alongside timings. This is a controlled
CI browser selection change, not proof of Chromium's internal startup cause.
Browser flags, profiles, assertions, deadlines and retry rules stay intact.
Verify all540 blocking results and compare launch/scenario durations separately
before claiming an improvement; use successful runs with the new browser
selection for the next calibration window.

The Chrome-selection run
[42085901962](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42085901962)
passed required validation in467s:537 PASS and three FLAKY files. The build job
started at+121s; runner queueing again materially contributed to wall time.
Sampled shards1/3/9 logged `executable=google-chrome`; first launch time still
varied. This confirms selection, not elimination of startup delay. The three
retries were instant-access ordering, home-feed arrival observation, and the
paid-view arrival deadline. Their assertions and timing budgets remain intact.

The home-feed test had queried `getAnimations()` only after checking recovered
content. Its220ms native animation may already have finished by that read, so
the API returns no active animation even though arrival ran. The test now
retains the native animation from `Element.animate` in a page-local WeakMap,
awaits its `finished` promise, and checks the same native effect duration and
keyframes. Missing animations still return null and fail; cancellation rejects
the promise. The observer returns the original animation and does not change
playback. A deterministic probe delayed the reader by500ms: the prior observer
failed with null, and the retained-animation observer passed under the same
delay. Production motion, readiness deadlines and assertions are
unchanged.
The exact four-worker browser shard3 passed on four local CPUs: all8 files PASS,
without retries. Docs lint and selected-source Semgrep also passed.

The home-observer run
[42088343280](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42088343280)
passed required validation in247s:539 PASS and one FLAKY out of540 blocking
files. Home hydration passed without retry. Browser shard6 started at+132s,
while most test jobs started at+68s; queue time still affects the target.

A fresh calibration window contains only successful full runs42085901962/1
and42088343280/1, both with registry544 and explicit system Chrome. The updater
validated complete coverage before this next split;536 files had two PASS
samples and535 weights changed. FLAKY samples were excluded and unmeasured
weights retained. This replaces earlier split estimates with measurements for
eligible bfcache and geometry files. The manifest states the run identities
and the coverage at calibration time.

The card-loading file took76.247s in42088343280. Its independent catalog and
card-detail tests now register from a shared helper in two files. The six
pre-hydration catalog widths640/641/900/901/1240/1241, hydrated mobile390→1440,
and glow widths600/1000/1440 remain intact. Both top-level cases, eight nested
cases,29 assertion sites, delays, network-idle waits and runtime cleanup are
preserved by an exact source reconstruction check. New seeds35.695/25.879s
allocate the fresh median by observed scenario durations; they are not yet
individually calibrated. The registry now has545 files (four quarantined), so
future calibration must use two new complete541-file blocking datasets.
All10 card checks passed concurrently on four local CPUs; registry,calibration,
worker-plan,docs and selected-source Semgrep checks also passed. The two parts
map to separate CI jobs. Hosted improvement remains to be verified.

The refreshed-weight/card-split run
[42090269778](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42090269778)
passed required validation in207s:540 PASS and one FLAKY out of541 blocking
files. Both cards files and home hydration passed on the first attempt. The
remaining retry was `next-bg-tier-list-browser`; its worker also ran page
transitions and deck builder, making browser shard8 the final blocking job.

The tier-list fixture sent one temporary subscription503, then allowed the
automatic retry to succeed immediately. The test read the pending state after
`networkidle2`; on a busy runner recovery could already have replaced it with
the healthy page. Its failure showed the recovered toolbar, not a revoked
entitlement. The fixture now holds successful subscription-recovery responses
until the existing pending assertion runs, then releases them and keeps the
same10s recovery assertion. Missing retries or incorrect pending/recovery UI
still fail. No sleeps were added to the committed test. A disposable probe
added a5s reader delay: the previous fixture failed with the recovered toolbar,
while the controlled fixture passed. All auth-attempt counters, accessibility,
viewport, network-error and final tier-data failure assertions stay intact.
The exact four-worker browser shard8 passed on four local CPUs: all10 files
PASS without retries. Docs lint and selected-source Semgrep also passed.

The next hosted run, [42092177251](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42092177251),
confirmed the tier-list fix on its first attempt. Observatory batch1 exposed a
separate QA race: its home CSS inspection appended synthetic orbit elements
to the server-rendered React tree before hydration finished. React then raised
error418 and replaced the tree during layout inspection. Holding the initial
five JS requests reproduced this failure locally; the same probe passed when
fixture insertion, measurement and cleanup ran in one synchronous browser
call. The helper removes only its own nodes, including when inspection throws.
Desktop style assertions and subsequent mobile checks are unchanged. The CSS
owner check also waits for support-prompt and footer styles within its existing
10s bound instead of sampling them while their lazy chunks are still loading.
Batch1 passed with both isolated runtimes on four local CPUs; the final home
scenario, docs lint and selected-source Semgrep also passed. Hosted validation
passed in [42094463512](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42094463512).

That run reached the required gate in231s, with540 PASS and one FLAKY
(`battleground-hero-motion-browser`) among541 blocking files. Browser shard7
started137s after creation, versus77–78s for most browser jobs, and finished
last at225s. Runner queuing remains variable, not a proven repository quota.

A local experiment combined the eight registry workers into two jobs of four
instead of four jobs of two. The first group passed, but the second failed
auth-persistence and newsletter-consent backend startup. Overall452/454 files
passed; both failing files then passed all13 cases in an isolated control.
The layouts ran on four pinned local CPUs, with host RAM still64GiB rather
than the hosted16GiB. The failed experiment is not adopted; keep two registry
workers per job and do not raise backend deadlines to accommodate it.

The same hosted run spent26s in the registry4 TLS-tools setup. Its log shows
OpenSSL already current and nginx already installed: apt upgraded nginx from
Ubuntu package7.18 to7.19 rather than supplying a missing executable. CI now
checks both binaries first and only runs the existing apt installation if one
cannot execute. It prints both versions afterward; missing/broken binaries or
failed installation still fail the step. Real nginx/TLS regressions passed;
five shell-path probes covered preinstalled tools, each missing tool, install
failure and tools still absent after installation. Hosted run
[42096751424](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42096751424)
passed the required gate in200s; all four TLS-tool steps took0–1s. There were
540 PASS and one FLAKY among541 blocking files. This is an observed run, not a
controlled end-to-end speedup or a stable two-minute result.

Its critical browser1 job spent32–34s in each initial Chrome launch. The
account-surface test then hit its existing45s whole-case timeout and passed
on retry; later launches took below one second. The browser worker wrapper
now offers explicit `--warmup-browser`, enabled only for required browser CI
jobs. It starts and closes the same configured Chrome once before starting
workers, using the existing60s launch bound and WS-timeout retry policy. Its
elapsed time remains inside the CI job; per-case deadlines, geometry/timing
assertions and retries stay unchanged. Missing Chrome or warmup/close failure
fails the job before any worker starts. Standalone and registry runs retain
their previous default. The launch logs identify the wrapper separately, so
hosted evaluation must include warmup cost and subsequent initial launches.
This experiment does not establish the internal cause of cold-start delays.
Run `42125084896` passed all checks with 549 blocking files passing first try;
its required gate took235s including queue time. The last browser shard spent
36.946s launching warmup Chrome and1.488s closing it, then65s in its longest
worker. The plan finished before build artifacts were ready and did not
extend that dependency path. To identify the cold-start phase, CI warmup now
sets Puppeteer's documented `dumpio` option: Chrome stdout/stderr and its
DevTools endpoint appear between existing launch markers. Only this disposable
`about:blank` browser emits raw output; test browsers retain their old defaults.
No flags, timeout, retry, matrix or test-selection change accompanies this
instrumentation. It is diagnostic evidence gathering, not a speedup claim.
Six worker-plan/lifecycle checks and seven calibration checks passed, as did
an actual missing-executable failure probe. The exact four-worker browser1
shard on four local CPUs completed with6 PASS/1 FLAKY: account-surface hit an
SMTP-delivery assertion once, a different failure from the hosted launch-time
case. Its isolated four-case control passed. Local Chrome was already warm;
these results do not establish a hosted speedup. Semgrep,actionlint and docs
checks passed; the next full hosted run must include all warmup time.

The first warmup run
[42098451709](https://github.com/Manacost-Labs/HeartPulse/actions/runs/42098451709)
failed two files. The workflow contract still expected the exact command
without the new warmup flag; its strict expectation is now updated, preserving
all matrix,selection,retry/quarantine checks. Browser4 failed before launching
the patch-notes browser: two server reads were not enough to fill the cold
Next patch cache, so the selected-version assertion saw its allowed skeleton.
A proxy delaying the initial patch API reads by2.5s reproduced this locally.
The fixture now waits at most10s for the version-switcher markup, then runs
the same version/content assertions. Wrong-version markup and HTTP errors are
returned immediately and still fail; this is readiness, not assertion retry.
The existing240s case limit and product600ms first-paint budget are unchanged.
The delayed-reader probe and first-paint loader contracts passed afterward.
The exact four-worker browser4 shard passed all9 files on four local CPUs,
without retries; workflow contract,docs and selected-source Semgrep passed.

Warmup itself completed: browser1 took8.146s to launch the warmup Chrome, then
its four initial case launches took0.339–0.435s. Account-surface passed without
retry. Browser4 warmup took0.997s. These samples support continuing the trial,
but the failed full run is not a valid speed acceptance or calibration sample.

A disposable Turbopack probe failed after 5.8 seconds: four explicit `.js`
TypeScript import-resolution errors, invalid generated CSS at
`section::after::after`, and a UMD/CommonJS-format warning. The probe config and
tsconfig were restored. No compiler or product behavior change is included.

All original eight observatory groups, skeleton viewports
and paywall groups passed locally. Local full parallel runs saw network-change
browser errors and timing sensitivity on this shared host; failed files passed
in isolation, and hosted required jobs all passed. Historical replays and one
PR run do not establish the warm-cache, full-run two-minute SLO.

## Full-registry recalibration after Chrome warmup

Run `42100456266/1` (`631ad0bb`) passed all 36 checks. All 541 blocking
files passed on their first attempt; the required gate finished 195 seconds
after workflow creation. Browser job 8 finished last: it started at +86s,
spent 83s in the test step and finished at +191s. Its Chrome warmup took
0.839s; the longest worker executed three files totaling 81.978s.

The new calibration uses successful full PR runs `42094463512/1`,
`42096751424/1` and `42100456266/1`. Each covers the current 541 blocking
files. Run IDs, attempts, repository provenance and successful workflow
conclusions were verified before using `--allow-full-pr`. PASS medians
update all 541 eligible files (538 values changed), including both parts of
the card-loading split; flaky observations are excluded. Quarantine weights
and membership remain unchanged. The first two runs predate Chrome warmup,
so this mixed window is a scheduling estimate, not a controlled comparison.

Replaying the latest run's file times with the old and new partitions gives
81.978s and 65.970s respectively for the longest browser worker. Both
partitions cover all 87 blocking browser files exactly once across 40 workers.
This in-sample replay excludes queues, setup and changed contention; only a
new full hosted run can establish the actual effect. It does not establish
the two-minute SLO or justify changing test deadlines or failure handling.

## Hero-filter prefetch fixture ordering

Run `42102338038` (`afd2277b`) failed browser job 3 because the hero-filter
fixture returned an immediate Top 1% error. The component prefetches on
pointer entry and focus; if that failed request finishes before selection,
the next input legitimately starts another request. The test expected one
request regardless of input scheduling and failed on both attempts.

A forced hover-before-click probe reproduced the duplicate request locally.
The fixture now holds its Top 1% response until the button is selected, so
prefetch and selection share the pending request. The same probe then passed.
The exact request sequence, visible error, absence of fallback rows, late
Top 20% response rejection and final Top 5% assertions remain unchanged.
No product request behavior, retry policy or timeout is changed.

Local verification: all three hero-motion scenarios passed in isolation.
The exact four-worker shard was not clean: 7 PASS, 1 FLAKY (library controls)
and 1 FAIL (other hero scenarios hit CSS/selector failures). The corrected
filter scenario passed on retry. A separate sequential control again passed
all hero scenarios but timed out in the unchanged library test; that file
passed in the failed hosted run. These local failures remain limitations,
not evidence of a successful full-shard run. Semgrep found no issues.

## Registry jobs start after their actual build inputs

Run `42104437021` (`09a86654`) passed all 36 checks and all 541 blocking
files without retries, including the hero-filter correction. The required
gate finished at +226s. Release artifacts were ready at +46s, Storybook at
+67s, and registry jobs started at +69–70s. Browser job 3 started at +139s
and finished last at +205s; the final gate started at +223s. Queue delay is
part of the result and cannot be predicted from test-duration weights.

The 454 non-browser registry files and their local import dependencies do
not consume the Storybook build. References to `storybook-static` are
source-scan exclusions, contract assertions or temporary runner fixtures.
Registry jobs now depend on `plan` and `build` and download only validated
release outputs. Browser jobs retain both build dependencies and artifacts.
Storybook still blocks `CI required` and deployment, even if registry tests
finish first; cancellation, empty affected-test plans and failures retain
their existing behavior. Four registry jobs with two workers each remain.

This removes an unnecessary prerequisite and artifact download and permits
registry work while Storybook is still building. It does not guarantee a
shorter runner queue or establish the two-minute target. The workflow
contract explicitly rejects a Storybook dependency in registry jobs while
retaining required-gate and browser-input checks.

All 454 non-browser files passed locally with `storybook-static` temporarily
absent, using two workers on four CPUs and the existing compiled artifacts.
The directory was restored after all workers exited. The new dependency
contract failed before the workflow edit and passed after it. Actionlint,
documentation lint and focused Semgrep passed. Every other workflow job,
including required and deployment gates, is byte-identical to the prior head.
A fresh hosted run is still needed to measure the scheduling effect.

Before publishing, integration preflight required synchronizing main
`8ea1faaf` (profile workspace PR349). The merge was conflict-free; the three
overlapping files were package scripts, observatory account assertions and
the test registry. The updated account checks from main are preserved.
Main adds one saved-decks test: the registry is now 546 files, with 542
blocking files and 455 non-browser files. The six added/changed non-browser
test files passed all 30 checks with Storybook absent. The merged workflow
contract, registry validation and actionlint passed. Existing calibration
samples describe the earlier 545-file registry; the new test uses its default
weight until two complete current-registry hosted runs are available. Local
compiled browser artifacts predate the merge; fresh hosted CI rebuilds them.

## Independent public deck-builder scenarios

Run `42107088754` (`1b849a44`) passed all 36 checks and all 542 blocking
files without retries. Its required gate finished at +206s. Browser job 5
finished last at +201s; Chrome warmup took 7.354s, followed by sub-second or
near-one-second initial launches. The builder file occupied one worker for
74.770s across three independently initialized scenarios.

A local attempt to reduce instant-access internal concurrency from four to
two did not establish a clean speed comparison: both four-way controls
needed unrelated retries (loader deadline and backend startup). The two-way
trial passed, but that alone does not prove a speed benefit. Its change was
reverted; the existing internal concurrency is retained.

The public builder's guest flow, rune/tourist restrictions and sideboard
editing now register in three files. All three test bodies are byte-identical
to the original blocks, preserving 77 assertion sites, viewports, network
fixtures, waits, downloads, accessibility checks and cleanup. Shared card,
image and axe fixture data moved into `tests/helpers/publicDeckBuilderData.mjs`.
Each scenario already owned its backend/Next/browser lifetime; the split
lets the existing shard planner distribute those independent lifetimes.

The old 47.056s median is allocated into labeled seeds of 29.335s, 8.487s
and 9.234s using parent scenario durations from the successful hosted run.
Their sum preserves the previous total estimate. These are scheduling seeds,
not measured per-file medians. Registry coverage is now 548 files with four
quarantined, 544 blocking, 455 non-browser and 89 blocking browser files.
Two complete current-registry successful runs are needed for recalibration.

All three extracted scenarios passed concurrently on four local CPUs after
restoring the guest scenario's required file-read import. Body hashes prove
the scenario code did not change. Registry validation, 13 worker/calibration
checks, workflow contracts, documentation lint and focused Semgrep passed.
Partition checks cover all 544 blocking files exactly once. No local timing
is treated as a hosted improvement; the new full CI run decides that.

## Observatory pairing experiment

Run `42110452495` (`8265f211`) passed all 36 checks and all 544 blocking
files without retries, finishing the required gate at +187s. Observatory
batches 3 and 4 and browser shard 1 were the last jobs.

Separating the heavy admin and responsive groups into different pairs did
not establish a local improvement. On four CPUs, the old final pair took
67.250s initially and 61.602s in the reverse control. All four candidate
pairs passed, with a maximum of 62.530s. The reverse control overlaps that
result, so the original pairing is retained. These local measurements are
not evidence of a hosted improvement.

## Split library listings by viewport

The same successful hosted run spent 80.555s on
`next-bg-library-listings-browser.test.mjs`, which visited 17 routes at
1440px and then 390px. Desktop and mobile now register separately through
`tests/helpers/bgLibraryListings.mjs`, allowing existing workers to schedule
the two viewport matrices independently.

All 34 route/viewport combinations retain the same status, canonical, heading,
main landmark, overflow, paywall and axe assertions. Console errors, failed
requests and private API requests still fail each viewport test. The three
404 checks now run at both viewports. Navigation readiness and timeouts are
unchanged. Each file owns and closes its backend, Next and browser runtime.
The extracted scenario body matches the original after normalizing indentation
and substituting the supplied width list.

The previous 83.831s median is divided into 41.916s and 41.915s scheduling
seeds. These are not measured per-file medians. The current registry contains
549 files, four quarantined, 545 blocking, 455 non-browser and 90 blocking
browser files. Recalibration requires two complete fresh successful runs.
Both viewport tests passed concurrently on four local CPUs. Registry checks,
13 worker/calibration checks, the workflow contract, documentation lint and
focused Semgrep passed. All 545 blocking files appear exactly once across
the existing partitions; desktop and mobile land in different browser jobs.
The next full GitHub Actions run will measure the split's hosted effect.

## Backend fixture startup and failure cleanup

Run `42120524765` cancelled registry shard 3/4 after its job deadline.
`next-seo-page-metadata.test.mjs` had already failed with `no such table: users`
in `publicCardFixture`; its other worker finished, but setup leaked local
servers and kept the failed process alive. No backend startup log was retained
by the failing fixture, so a port collision in that run is not proven.

The backend helper now requires its own child's listening message before the
HTTP liveness probe, checks the existing database and users table, and handles
signal exits during readiness/cleanup. A premature health response from another
listener cannot make it return a newly created empty database. The HTTP probe
has a bounded timeout. Card fixture setup now closes all acquired servers and
the backend on failure, including failures while seeding a session.
The immutable legacy HTML shell is read once during fixture setup and served
from memory. This removes per-request file access flagged by CodeQL
`js/missing-rate-limiting` without adding artificial throttling to local tests.

Two subprocess regressions inject an early health response and a seed failure.
Both failed before the change and passed afterward, including natural process
exit after the rejected setup. The source and compiled backend paths pass;
the original SEO file passes all 17 tests on four local CPUs. Registry shard
3/4 also passes all 119 selected files with two workers on those four CPUs.
These tests join the required integration registry. No application behavior,
existing assertion, quarantine membership or CI job deadline changes.

## Leaderboard geometry fixture ordering

Run `42126696282` passed the required gate in230s, but browser shard3
retried `next-leaderboards-states-browser.test.mjs`. Its first attempt spent
92s before timing out on the loaded statistics selector. Warmup on that shard
was897ms. Across ten shards, the slowest warmup took16.214s, with its endpoint
at11.485s; identical D-Bus errors also appeared on subsecond starts, so those
errors alone do not identify the cold-start cause.

The leaderboard test held the statistics request while opening five separate
baseline pages. Those unrelated navigations consumed the application's
20-second `fetchWithDeadline` budget. A22s delay in baseline preparation
reproduced expiry: the loading surface disappeared before release. Preparing
all fresh baseline pages before holding the request makes that probe pass.
The same eight assertion lines, two modes, five widths, ten fresh baseline
pages, network-idle waits, geometry tolerance and timing limits are retained.
Only measurements and viewport changes now occur while the request is held.
Baseline pages close in `finally`, including on a failed measurement. The
probe delay is not committed; application request deadlines remain unchanged.
The full browser shard3/10 passes all nine files on four local CPUs without
retries after the fix. The hosted run also retried the separate lightbox-close
fixture because its recorded CSS transition fields were null; that observation
remains unresolved and is not covered by the leaderboard ordering change.

## Blank-browser startup process sampling

Run `42128153215` on `b7f92290` passed all 36 checks. Required validation
completed in 176 seconds including queue time; all 549 blocking files passed
without retries. Both leaderboard states and lightbox close passed on their
first attempt. This is still above the 120-second target.

Browser shard 2 ended last. Its blank-browser launch took 27.720 seconds,
including 17 seconds before the first Chrome stderr message. Closing added
1.067 seconds. Artifact downloads occupied only three seconds after dependency
installation, so overlapping them with warmup would hide little of this delay.
D-Bus messages alone do not establish the cause.

Linux GitHub warmup now samples only the launcher's direct children once per
second, capped at eight children per sample. The allowlisted fields are PID,
process state, main-thread CPU and run-queue milliseconds, storage read bytes,
and kernel wait channel. These are cumulative counters, so compare consecutive
samples for the same PID. Scheduler values describe the main thread, not all
Chrome threads; unavailable counters are null, and kernel configuration can
limit scheduler accounting. Missing processes or proc files are tolerated.
The field meanings follow the Linux kernel's [proc documentation][proc-docs]
and [scheduler statistics][sched-docs].

No command arguments, environment values, open-file paths or raw proc files
are logged. Sampling stops in `finally` after warmup success or failure, before
any test worker starts. Only the disposable blank browser is observed; launch
flags, deadlines, retries, assertions and matrix sizes are unchanged. This is
a diagnostic change, not evidence of faster CI. A controlled child test checks
counter-only output and sampler shutdown; a delayed real-Chrome launch probe
checks worker ordering and cleanup after both success and launch failure.

[proc-docs]: https://docs.kernel.org/filesystems/proc.html
[sched-docs]: https://docs.kernel.org/scheduler/sched-stats.html

## Executable page-cache preload experiment

Run `42129521691` on `a78582e0` completed required validation in 175 seconds;
all 549 blocking files passed without retries. Its slow browser startups
repeatedly sampled state `D` and wait channel `folio_wait_bit_common` while
storage-read counters increased. The final shard's 14.045-second launch used
only about 288 ms of main-thread CPU and 2 ms in its run queue. This points to
file-page I/O waits during cold loading; it does not identify the underlying
GitHub storage mechanism.

The experiment enables `HP_BROWSER_PRELOAD=1` in the browser matrix and
observatory batches.
Before the usual blank-browser warmup, it sequentially reads the Chrome ELF
through one open descriptor in 1 MiB chunks. Google's resolved `google-chrome`
wrapper selects its sibling `chrome`; other executable paths are checked
as-is. Only regular ELF files up to 512 MiB qualify. A ten-second abort signal
is checked between reads; an in-flight filesystem read must finish before it
can be noticed. Missing, unsupported, interrupted or failed preloads continue
to the unchanged real browser launch. Nothing is executed or modified by the
preload, and the emitted result contains only status, bytes, time and an error
code. All preload time remains inside the measured CI job.

A local ABBA experiment evicted only a private copy of the executable, leaving
system resources and libraries alone. It did not improve total time on the
local fast disk: controls were 640/627 ms, candidates 645/643 ms. This is not
speedup evidence for GitHub. The hosted file-wait profile motivates a bounded
trial; retain it only if complete hosted runs support a reduction in setup or
critical-path time without failures or missing coverage. Revert the experiment
if it adds overhead without benefit.

The preload regression fails against a no-op and passes after implementation.
It checks exact bytes through a symlinked wrapper, unchanged contents, abort,
size/type limits and missing files. All nine worker/workflow checks pass, and
a real-Chrome probe confirms preload precedes normal launch/close and all four
workers. Launch flags, deadlines, retry limits and assertions are unchanged.

## Observatory preload follow-up

Run `42131145215` on `db57eda9` passed all 549 blocking files without retries;
required validation took 183 seconds. All ten browser preloads completed. For
these observed runs, median combined preload/launch/close was 5.586 seconds
against 8.911 seconds in the preceding no-preload run; maximum was 10.665
against 14.494 seconds. These are unpaired runner samples, not a controlled
estimate of savings. The full required gate did not get faster.

The final job was observatory batch 3, which had not enabled preload. Both
browsers began together and each spent about 26.985 seconds launching before
its scenarios. The next trial applies the same bounded preloader once in the
batch parent, before starting either isolated runtime. The four batch pairs,
all eight QA groups, screenshots, assertions and sibling-failure handling are
unchanged. Preload time remains part of the complete job even though per-group
runtime logs begin afterward. Judge the next result by full setup and required
completion time, not those per-group logs alone.

The workflow regression fails before enabling the observatory environment and
passes afterward. Worker, workflow and QA-group contracts verify the retained
coverage and concurrency. A real batch-3 run on four local CPUs checks both
`public` and `admin-mobile`; its timing is not a GitHub SLO measurement.

## Single-payload build artifact trial

Run `42132192018` on `03df04d` passed all 36 checks. Required validation
finished at +271 seconds, including queue time. The registry shard 1 download
step took 102 seconds for a 23,825,832-byte artifact and became the critical
path. Its log combines network transfer and file extraction, so this does not
establish which operation stalled. The registry contains 553 files: 552 PASS
and one FLAKY home-hydration file, including the four quarantine results.
A local delayed-module probe did not reproduce that cancellation assertion;
its deadline and assertions remain unchanged.

The next experiment packages `build`, `dist` and `apps/public-web/.next`
into one `build-outputs.tar.gz`, excluding only the Next cache. Tar includes
hidden outputs and preserves paths and modes. Gzip level 1 compresses once in
the build job; the artifact upload uses level 0 to avoid recompressing it.
Every consumer downloads the same SHA-named artifact to its temporary
directory, then extracts at the workspace root with `--no-same-owner`.
Transfer and extraction now have separate step timings. Missing required
inputs or extraction failures fail the job. The production release packaging,
Storybook artifact, test selection and required dependencies are unchanged.
This follows the artifact action's documented
[tar transport pattern](https://github.com/actions/upload-artifact#permission-loss).

The workflow regression executes its actual pack and extract commands on
fixtures, checking hidden files, spaces, modes, cache exclusion and failure
on a missing output directory. A separate roundtrip of all 2,051 local build
files compares paths, SHA-256 digests and modes, including a simulated
uncompressed ZIP transport layer; source files remain unchanged. On four
local CPUs, packing took 0.554 seconds and extraction 0.168 seconds, yielding
a 24,015,327-byte payload. These local timings do not prove a hosted speedup.
Judge the experiment by complete hosted setup, packing and required-gate time;
revert it if the extra packaging has no measured benefit.

## Mobile route geometry groups

Run `42134776160` on `32653a83` passed all 36 checks and all 553 registered
files without retries. Required validation completed at +186 seconds.
Packing took one second and uploading two seconds. Across consumer jobs,
downloads took at most five seconds and extraction at most one second, using
integer step timestamps. This unpaired run supports keeping the archive trial
for further measurement, but does not establish a causal speedup or the SLO.

Browser shard 2 finished last. Its mobile route geometry file took 70.340
seconds, covering seven sequential routes. It now runs in two independent
files: the first three routes (`fun-decks`, `guide-detail`, `guides-list`)
and the remaining four (`cosmetics-list` and the three arena routes). Each
file owns its backend, Next server and browser. Shared route measurements,
CLS and geometry assertions, fonts, animation waits, fixtures and the mobile
viewport are unchanged. Desktop still checks every route. An explicit
`SKELETON_ROUTES` selection continues to run in full when invoking either
mobile file for diagnostics; default CI runs the disjoint groups exactly once.

The prior 63.773-second scheduling weight is allocated as 33.002 and 30.771
seconds using successful subtest durations from that hosted run. These are
initial scheduling seeds, not new per-file medians. There are now 554
registered files: 550 blocking and four quarantined, with 94 blocking browser
files. Four workers per browser job and ten browser jobs remain unchanged.
The coverage proof checks both groups against the entire active route table
and verifies that only route selection changed in the shared harness. Both
mobile groups passed concurrently in real Chrome on four local CPUs: all
seven routes, no skips or retries. Registry validation and all 11 worker,
workflow and QA-group checks also passed. Local group timings are not a
hosted CI speedup measurement.

## Guided-tour geometry readiness

Run `42136196730` on `5d1d0fc7` passed all 36 checks and all 554 files without
retries; required validation completed at +178 seconds. Both mobile geometry
groups passed on their first attempt. Observatory batch 4 was last, with
`shell-responsive` at 83.191 seconds and `admin-desktop` at 89.567 seconds.
The two-minute target remains unmet.

A local control run of `admin-desktop` passed and recorded seven tours with
36 steps. Each step slept 750 ms before reading its geometry: 27 seconds of
fixed pauses. The tests already request reduced motion. The next change waits
for loaded fonts, no pending/running finite tour animation, and three animation
frames with identical dialog/spotlight rectangles and window scroll position.
The readiness wait uses the same 10-second bound as existing step readiness;
it fails if the UI never appears or keeps moving. The old 750 ms pause was a
settling heuristic, not a product response-time assertion.

Final geometry, overlap, viewport, focus trapping, inert background, step
counts, completion persistence and accessibility assertions are unchanged.
Readiness does not wait for those assertions to become true: even stable
incorrect geometry is returned to the original checks. Infinite animations
are not awaited; position and size must still stabilize. Each call owns a
browser handle and disposes it on success or failure. No product, animation,
viewport, scenario, screenshot or batch configuration changes.

A real-Chrome regression fails against a no-op and verifies finite animation
completion together with smooth scrolling, rejection of missing or constantly
moving UI, and exposure of stable incorrect geometry. It is registered in the
browser suite,
bringing the total to 555 files: 551 blocking and four quarantined, including
95 blocking browser files. A new file keeps the default scheduling weight
until enough hosted PASS observations support calibration.

All four affected groups (`admin-desktop`, `admin-mobile`, `routes-desktop`,
`routes-mobile`) pass against the production Next build, run in pairs on four
local CPUs. The temporary profiler is removed before commit. A byte comparison
confirms the QA suite changed only its import and the fixed pause; all scenario
and assertion bodies remain intact. The local desktop tour portion took
3.629 seconds for the same 36 steps; the control recorded 28.637 seconds.
These local runs differ in concurrent load and do not establish hosted savings;
judge the next full CI run, including the still-long responsive inventory.

## Library listing access readiness

Run `42138221063` on `304b347f` passed all 36 checks, with 554 PASS and one
FLAKY registered file. Required validation took 193 seconds. The tour readiness
regression and every observatory group passed. The final browser shard 9
retried `next-bg-library-listings-browser.test.mjs`: its first attempt saw no
subscription-gate text at `bgLibraryListings.mjs:64`. The retry passed.

The listing renders `PaywallPending` until its session check finishes.
`networkidle2` permits two outstanding requests and therefore does not prove
that access is settled. A local probe delayed the first `/api/auth/me` request
by three seconds. The old test reproduced the same false-versus-true assertion
on `/library/minions/`; diagnostics showed a pending access placeholder,
correct canonical/H1/main/overflow and no axe violations. This reproduces the
failure mechanism, not the exact hosted request latency.

The helper now waits up to 10 seconds for a visible `.arena-paywall` before
injecting axe and taking measurements. The existing gate-text assertion still
checks its content. Canonicals, headings, main count, overflow, accessibility,
console/request errors, absence of private API requests, all 17 routes, both
viewports and the three invalid-route 404 checks remain unchanged. Navigation
mode and application access deadlines are unchanged. Missing gates still fail
readiness; a wrong gate still fails the original assertions.

The delayed-session probe passes with this wait and is removed before commit.
Both normal viewport files pass concurrently on four local CPUs, covering
34 route/viewport combinations plus six invalid-route checks. A byte comparison
confirms only the readiness wait and its comment were added; all assertions
and scenario bodies are preserved. Worker/workflow/QA contracts, focused
Semgrep, Oxlint, documentation and integration preflight also pass.

## Library listing navigation readiness

Run `42139571641` on `9568af44` passed all 36 checks and all 555 registered
files without retries, including both library listing files. Required
validation took 202 seconds. Browser shard 3 finished last; its executable
preload hit the bounded abort after 10.078 seconds and ordinary Chrome launch
then took 5.877 seconds. The fallback behaved as intended, but setup variation
and long browser files still keep the two-minute goal unmet.

A local desktop listing control passed in 31.041 seconds. Across its 17
positive routes, `networkidle2` returned 17.259 seconds after document `load`
in total. The next change waits for `load`, the existing visible access gate,
loaded fonts and completed finite animations before measuring and running axe.
It removes the network-quiet heuristic while retaining document/resource load
and explicit rendered-state readiness. The three 404 navigations retain their
original wait mode. Every assertion, path, viewport and private-request check
is byte-identical; no product deadline changes.

The candidate desktop run passed in 17.592 seconds on four local CPUs. Its
combined navigation/access/font/animation readiness took 8.103 seconds across
17 routes. These sequential local samples are not a hosted CI speedup estimate.
Both viewport files also pass with the first session response delayed three
seconds, exercising the previously reproduced access race with the new wait
mode. Temporary delays and timing probes are removed before commit. Scheduling
weights stay unchanged until fresh complete hosted runs support calibration.
Normal mobile verification also passes. Contract tests, focused Semgrep,
Oxlint, documentation and integration preflight pass.

## Verification

Focused runner and workflow tests must prove deterministic complete sharding,
timing output on success/failure, and unchanged failure propagation. Calibration
must ignore failed, flaky and unrun files, reject malformed or duplicate
observations, and preserve weights without enough fresh samples. Keep run IDs
with the calibration for reproducibility. A replay of recorded times estimates
balance only; only a new GitHub Actions run measures actual CI improvement.

## Desktop route geometry groups

Run `42141140467` on `7b16f692` passed all 36 checks and all 555 registered
files without retries. Required validation took 169 seconds, including queue
time. Both library listing files passed on their first attempt. This one run
does not establish the ten-run SLO or isolate the effect of the navigation
change from runner variation.

Browser shard 2 finished last at +164 seconds. Its desktop route geometry
file took 65.299 seconds across seven sequential routes. Like the existing
mobile split, desktop now uses two independent files: the first three routes
(`fun-decks`, `guide-detail`, `guides-list`) and the remaining four
(`cosmetics-list` and the three arena routes). The existing shared helper is
byte-identical: geometry and CLS assertions, held requests, fonts, animation
waits, cleanup and the 1440×900 viewport are preserved. Each group owns its
backend, Next server and browser. Explicit `SKELETON_ROUTES` selections still
run in full for single-file diagnostics; the default CI groups are disjoint.

The old 63.021-second scheduling weight is allocated into 31.802 and 31.219
seconds using successful route durations from that hosted run. These are
initial scheduling seeds, not new measured per-file medians. The registry now
contains 556 files: 552 blocking and four quarantined, with 96 blocking browser
files. Ten browser jobs and four workers per job remain unchanged.

Both groups passed concurrently in real Chrome on four local CPUs, covering
all seven routes without skips or retries. A coverage proof confirms the
partition equals the active route inventory and that the shared helper is
unchanged. Registry validation and all 11 worker/workflow/QA-group contracts
pass. Local timings are not a hosted speedup measurement.

## Lightbox close failure diagnostics

Run `42142434528` on `11323b66` failed browser shard 10 because the hero media
lightbox close test observed no opacity transition on either attempt. The
required gate correctly failed. Both new desktop geometry groups passed;
552 blocking reports contain 551 PASS and one FAIL. The failure also appeared
before the desktop split, so there is no evidence that this split caused it.

The ordinary local lightbox file passed all four cases. Diagnostic runs on
one CPU with 30× and 60× browser CPU throttling also passed; neither reproduced
the hosted failure. A small transition sampling probe also passed with and
without early observation. These experiments do not establish a root cause
or a fix. Temporary throttling/probes are removed from the committed test.

The failure detail now includes bounded transition lifecycle events and
inline opacity changes, with timestamps and removal state. These diagnostic
reads do not force style or layout calculation. They distinguish an animation
that was never observed from a recorded transition ending or being cancelled.
Original frame sampling, CPU throttling at 6×, fade duration/end/monotonicity,
scroll-lock and reduced-motion assertions are unchanged. This adds evidence
for the next failure; it does not claim the flake is fixed.

## Independent Arena access scenarios

Run `42143742966` on `e9d9a1a3` passed all 36 checks and all 556 registered
files without retries. Required validation took 162 seconds, including queue
time. Lightbox close passed on its first attempt; this does not establish the
root cause of its intermittent failure. The approximately two-minute target
and ten-run acceptance rule remain unmet.

The longest blocking browser file was Arena guest paywall, at 61.495 seconds.
Its three independent cases took 18.174 seconds for guest preview, 26.429 for
layout shift, and 16.358 for administrator access. Each case already owned
its backend, Next server and browser. They now register as three files so
workers can schedule them independently. The scenario bodies and imports
are byte-identical to the originals; no shared product implementation changes.

All three Arena routes remain covered for guests and administrators. The CLS
case keeps both 1440×900 and mobile 390×844 viewports, its 500ms observation
window, the 0.02 shift limit and original navigation/readiness waits. The
administrator case still waits for subscription status before asserting that
no paywall exists. The preview case keeps loader and animation assertions.

The previous 54.534-second weight is allocated into initial seeds of 16.258,
23.643 and 14.633 seconds from the successful hosted case durations. These
are not newly measured per-file medians. Registry size becomes 558 files:
554 blocking and four quarantined, including 98 blocking browser files.
Browser job/worker counts and required gates remain unchanged. Calibration
still requires two complete eligible runs; an incomplete or failed full PR
run cannot provide a shortcut around that coverage requirement.

All three files passed concurrently in real Chrome on four local CPUs. All
48 registry tests and 11 worker/workflow/QA-group contracts passed, along
with scoped Semgrep, Oxlint and documentation checks. These local results
verify the split; only a new hosted run measures its CI timing effect.

## Canonical link audit groups

Run `42145130847` on `c0aa9139` passed all 36 checks and all 558 registered
files without retries. Required validation took 192 seconds. The three Arena
files passed; this unpaired run does not demonstrate a whole-CI speedup.
Browser shard 4 was critical. Its test step took 97 seconds, including a
6.916-second executable preload and 0.866-second initial Chrome launch.
One worker ran the administrator Arena case and then the 62.046-second
canonical-link audit. Other workers were also busy with long browser files.

The canonical audit now runs in two independent files with a shared helper:
twelve guest routes, and four subscriber routes plus the archive and card
navigation checks. Both groups retain server-HTML and hydrated-anchor reads,
all content selectors, network-idle waits and browser-error assertions. The
subscriber group retains both disabled archive checks, hover prefetch, API
request restrictions, redirect checks and same-document navigation checks.
The route tables, measurement helpers and original assertions are unchanged;
only group selection and ownership of the final navigation phase differ.
Each group owns its runtime/browser and isolated subscriber context.

A local control run passed. Its phase profile recorded 12.900 seconds for
guest routes, 3.828 for subscriber routes and 3.411 for archive/navigation.
The previous 45.349-second weight is proportionally allocated as 29.049 and
16.300 seconds. These are initial seeds from local phase ratios, not hosted
subgroup medians. Temporary profiling is removed. The registry now contains
559 files: 555 blocking and four quarantined, including 99 blocking browser
files. Job/worker counts and required gates remain unchanged.

Both groups passed concurrently in real Chrome on four local CPUs. A normalized
source comparison proves that route tables, helpers and scenario assertions
match the original after removing only group-selection plumbing. All 48
registry tests and 11 worker/workflow/QA-group contracts passed, along with
scoped Semgrep, Oxlint and documentation checks. Hosted timing is still pending.

## Stable-inventory timing calibration sample

Run `42146509165` on `c306c382` passed all 36 checks and all 559 registered
files without retries. Required validation took 169 seconds, including queue
time. Both canonical groups and lightbox close passed on their first attempt.
The release artifact was ready at +50 seconds; Storybook finished at +65
seconds. Browser shards 5 and 8 finished last at +163 seconds.

The 40 browser workers averaged 56.737 seconds of recorded test-file time,
with loads from 36.119 to 73.693 seconds. This suggests stale scheduling
weights after the scenario splits; it does not prove that rebalancing alone
will meet the two-minute target. The longest worker combined admin layout,
Battleground library controls and Battleground library details.

Keep the executable inputs, test inventory and scheduling weights unchanged
for a second full PR timing sample. The PR diff still includes the CI changes,
so the test planner must select all registry and browser shards. Only after
two complete eligible runs may the calibration command update PASS-only
per-file medians. Preserve existing weights without sufficient samples, and
verify the resulting schedule in a subsequent hosted run. A documentation-only
measurement commit supplies the second sample without changing test behavior.

## Calibration of the stable 559-file inventory

Run `42147565370` on `3a600ba7` passed all 36 checks and all 559 files without
retries. Required validation took 188 seconds. Its executable inputs and
inventory match `c306c382`; only documentation changed between the two heads.
The timing reports retain GitHub's original merge SHA identities and run IDs.

The calibration command used all 48 blocking worker reports from each of runs
`42146509165/1` and `42147565370/1`, with explicit full-PR coverage validation.
Every one of the 555 blocking files has two distinct PASS observations. Their
medians replace the scheduling estimates; 554 numeric values change, and one
is unchanged. All four quarantine weights remain unchanged. No failed,
retried, incomplete or synthetic observations contribute to this update.

Replaying the recorded browser file times through the new 40-worker schedule
predicts longest-worker totals of 63.237 and 66.043 seconds for the two runs;
the original schedules recorded 73.693 and 73.063 seconds. For the eight
registry workers, replay maxima are 47.970 and 57.667 seconds, compared with
recorded maxima of 55.855 and 70.440 seconds. These calculations exclude
setup and queue time and cannot model timing changes caused by new concurrent
neighbours. They justify a hosted trial, not a claimed CI speedup or SLO.

Validation checks every new median against the two original samples, retains
quarantine weights, and verifies exact disjoint coverage of all 99 blocking
browser and 456 non-browser files. Calibration, worker/workflow/QA-group and
registry tests pass. The next full GitHub run measures the actual effect;
job counts, worker counts, test code and required gates remain unchanged.

## Identity layout fixture: sample before releasing the delayed answer

Run `42148659297` on `9baedb159` failed the registry layout scenario at
1280 px: the alleged first-frame text already contained the site name.
The required gate correctly failed because registry shard 3 failed.
The calibrated weights remain a candidate; this run is not an eligible
successful calibration sample.

The fixture previously started its one-second answer timer on the HTTP
request, then read the early text through the Node driver. Delaying that
read by 1.5 seconds reproduces the exact hosted assertion failure. This
establishes a fixture race, although the hosted driver delay itself was
not instrumented.

Capture the first form-frame text inside the existing animation-frame
observer. Hold only delayed fixture answers until the driver retrieves that
sample, then retain the original one-second response delay and 1.5-second
observation window. This makes the scenario independent of driver scheduling
before the sample. Release the hold during cleanup as well. Guest and context
fixtures retain their original response behavior. No product code, assertions,
viewport matrix, layout limits or required gates change.

Validation: the delayed-reader reproduction fails before the change and passes
after it. All three identity continuation groups also pass on four CPUs with
the temporary probe removed. All 65 assertion lines are unchanged. Focused
and project Semgrep checks report no findings; JavaScript and documentation
checks pass. The hosted result for this correction is still pending.
