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

## Verification

Focused runner and workflow tests must prove deterministic complete sharding,
timing output on success/failure, and unchanged failure propagation. Calibration
must ignore failed, flaky and unrun files, reject malformed or duplicate
observations, and preserve weights without enough fresh samples. Keep run IDs
with the calibration for reproducibility. A replay of recorded times estimates
balance only; only a new GitHub Actions run measures actual CI improvement.
