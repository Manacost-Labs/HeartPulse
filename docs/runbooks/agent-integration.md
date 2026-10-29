# Agent integration: pull requests and the merge queue

Parallel agent sessions ship through pull requests and the GitHub merge queue.
No session pushes to `main`; the queue tests queued PRs together on top of the
newest `main` and fast-forwards it, and that push deploys
([ADR 2026-10-21](../decisions/2026-10-21-pull-requests-and-merge-queue.md)).

## Flow for one session

1. Worktree: `git worktree add -b <agent>/<task>-<date>
   /srv/projects/tasks/hearthpulse-<task>-<date> origin/main`, then
   `npm run agent:session:preflight`.
2. Work only on owned paths. A visible change adds
   `changelog.d/<YYYY-MM-DD>-<slug>.md`; bundle growth above the tolerance adds
   `config/next-bundle-budgets/approvals/<slug>.json`
   ([bundle budgets](next-bundle-budgets.md)); a new ADR is
   `docs/decisions/YYYY-MM-DD-<slug>.md`; a local change to a vendored kit adds
   `src/vendor/<kit>/patches/<slug>.md`. See
   [Shared hot spots](#shared-hot-spots).
3. Run the task's focused checks, commit, then `npm run agent:integrate`
   (add `--check <npm-script>` for extra local gates). It rebases once onto
   `origin/main`, runs the fragment check and the integration preflight, pushes
   the task branch with `--force-with-lease`, opens the PR (or reuses it) and
   enables auto-merge pinned to the pushed head SHA. The output line
   `READY <branch> <sha>` is the handoff.
4. The PR's own CI runs; when `CI required` is green the PR enters the queue.
   The queue runs CI on `main + earlier queued PRs + this PR`. With
   `ALLGREEN` a failing PR is removed and the others still merge. If yours is
   removed: fix on the branch, commit, rerun `npm run agent:integrate`.
5. `npm run agent:integrate -- --status` prints `DEPLOYED` once
   `https://hearthpulse.net/api/health/live` serves a release that contains the
   merge commit (a later batch deploys earlier merges too). Then run the task's
   production check, post the fragment with
   `npm run changelog:post -- --fragment changelog.d/<file>.md`, report PR,
   merge commit and production SHA, stop every dev server you started, and end
   the session.

Until the settings below are applied, auto-merge is disabled in the
repository: `agent:integrate` stops after opening the PR, and the lead session
merges READY PRs.

## Shared hot spots

`npm run quality:hot-spots` (`scripts/shared-hot-spots.mjs`) refuses a branch
whose diff against its merge base edits `CHANGELOG.md`,
`config/next-bundle-budgets.json`, any file in
`config/next-bundle-budgets/baselines/`, or an existing file in
`config/next-bundle-budgets/approvals/`. Adding a new approval file passes.
`npm run agent:integrate` runs it before the push, and CI runs it on the pull
request in `verify:release:checks`, so a PR opened without the helper is
refused too. Merge-queue and `main` push runs skip it: each queued PR already
passed it on its own pull request.

The release (`changelog:assemble --release`) and the bundle baseline refresh
are the only commits that change these files. Such a commit carries the
trailer `Shared-Hot-Spots: <reason>`; it exempts only the files that commit
touches, so other commits of the branch stay checked:

```bash
git commit -m "chore(budgets): refresh bundle baselines" \
  --trailer "Shared-Hot-Spots: bundle baseline refresh"
```

The old `--allow-shared` flag is gone: CI cannot see a local flag.
`config/function-size-budgets.json` and `config/source-debt-budgets.json` are
not covered: they have no approvals directory, so a task still records a new
exception there.

## Required CI contract

The required check is the single job `CI required` of
`.github/workflows/ci.yml` (GitHub Actions, integration id `15368`). It
depends on every validation job, so sharding jobs does not change the ruleset.
The workflow must run on `merge_group` (`types: [checks_requested]`) and give
the changed-file gates the queue base:
`CLEAN_CODE_BASE` and `REACT_DOCTOR_BASE` set to
`${{ github.event.merge_group.base_sha }}`. Deployment stays on `push` to
`main`: the queue fast-forwards `main` to the tested group commit. The queue
run also packages the immutable release, so that push reuses the queue run's
validation and artifact instead of running CI again (exact SHA and tree, and
the queue run's `CI required` job succeeded; the run itself need not be
completed, as only `CI required` is awaited;
see [DEPLOYMENT.md](../../DEPLOYMENT.md#automatic-deployment-from-main)).
`CI required` also passes on such a push, where the validation jobs are
skipped by design. The job `Browser quarantine (non-blocking)` runs the
registry's quarantined flaky tests with `continue-on-error: true` on
`pull_request` and `workflow_dispatch` only, so the merge queue run does not
start or wait for it; `CI required` and the deployment do not depend on it
(see the Quarantine section of
[phase0-test-discovery.md](../architecture/phase0-test-discovery.md#quarantine)).

## Tests affected by a pull request

`scripts/ci-affected-tests.mjs` answers which registered test files a change
can affect. It is not wired into `ci.yml` yet: the pull request run still runs
everything, and `merge_group` and `main` always will. Use it to reproduce what
a pull request run would select:

```bash
# two commits (the base is compared at its merge-base with the head)
node scripts/ci-affected-tests.mjs --base origin/main --head HEAD
# or a list of paths, one per line; --output writes the JSON to a file
node scripts/ci-affected-tests.mjs --files-from changed.txt --output selection.json
# run only the selected files of a suite
node scripts/test-suite-runner.mjs --suite unit --only-files selection.json
```

The JSON has `mode`, `reason`, `files` (selected test files per suite, in
registry order) and `affectedModules`:

- `none`: only `docs/**`, `changelog.d/**`, or Markdown outside `.github`,
  `.storybook`, `apps`, `config`, `database`, `deploy`, `public`, `scripts`,
  `server`, `shared`, `src` and `tests`. No file is selected.
- `subset`: every changed file is in a module root of
  `config/module-boundaries.json`, in a legacy area of
  `config/architecture-catalog.json`, or is a registered test. Selected are
  the catalog `tests` of the changed modules and of every module that depends
  on them (transitively, by the `dependencies` of the inventory), plus the
  changed test files.
- `all`: anything else. That is `package*.json`, `.npmrc`, `.github/**`,
  `scripts/**`, `config/**`, `tests/test-suites.json`, test helpers and
  fixtures, the shared roots (`src/shared`, `server/shared`, `shared`),
  tsconfig, Next and Storybook configs, a file outside every module, a path
  that is not a clean relative path, or a changed module with no registered
  test. Every registered file is selected.

`--only-files <file>` accepts that JSON (or a plain list of paths) and keeps
only those files of the chosen suites, before the quarantine filter and before
sharding. A suite with nothing selected exits 0 and prints
`ONLY-FILES selected 0 files; nothing to run`. A wrong `subset` is caught by
the full `merge_group` run, so the tool errs towards `all`: if it fails, treat
the failure as `all`. A tool exit code other than 0 means "run everything".

## GitHub settings (owner applies; agents never change them)

Apply in this order, only after `main` contains the `merge_group` trigger and
the `CI required` job and that job has run once (otherwise the queue waits for
a check that never reports).

1. Ruleset for `main` ([`.github/rulesets/main-merge-queue.json`](../../.github/rulesets/main-merge-queue.json)):
   PR required (0 approvals, squash), `CI required` must pass, merge queue
   (squash, `ALLGREEN`: up to 2 cumulative groups are built in parallel on
   top of `main`, up to 5 PRs are merged together, 75 minutes for checks),
   linear history, no force push, no deletion and **no bypass
   actors**: an admin token cannot push to `main` either, so the queue is the
   only writer.

   ```bash
   gh api -X POST repos/Manacost-Labs/HeartPulse/rulesets \
     --input .github/rulesets/main-merge-queue.json
   ```

   `max_entries_to_build` is 2, not 5 (2026-10-28, #253): the organization is
   on the Free plan with 20 concurrent GitHub-hosted jobs shared by all
   repositories, and one `ci.yml` run is 19 jobs. Five groups building at once
   left jobs waiting 3.1 min p50 / 9.5 min p90 for a runner. After changing the
   live ruleset, keep this file in sync (`PUT …/rulesets/<id>`).

   `strict_required_status_checks_policy` is `false` on purpose: the queue
   already tests against the newest `main`, so PRs never need an up-to-date
   rebase.

2. Repository merge options, only after the ruleset exists (auto-merge without
   required checks would merge a PR before its CI): auto-merge on, merged
   branches deleted, squash commits keep the commit messages and their
   co-author trailers.

   ```bash
   gh api -X PATCH repos/Manacost-Labs/HeartPulse \
     -F allow_auto_merge=true -F delete_branch_on_merge=true \
     -F allow_squash_merge=true -f squash_merge_commit_title=PR_TITLE \
     -f squash_merge_commit_message=COMMIT_MESSAGES
   ```

3. Verify:

   ```bash
   gh api repos/Manacost-Labs/HeartPulse/rulesets --jq '.[] | {id, name, enforcement}'
   gh api repos/Manacost-Labs/HeartPulse/rules/branches/main --jq '.[].type'
   gh api repos/Manacost-Labs/HeartPulse --jq '{allow_auto_merge, delete_branch_on_merge}'
   ```

   Expected rule types: `deletion`, `non_fast_forward`,
   `required_linear_history`, `pull_request`, `required_status_checks`,
   `merge_queue`. A direct `git push origin HEAD:main` must now be rejected.

4. Emergency (owner only, recorded in the incident): pause the ruleset,
   push the fix, re-enable it.

   ```bash
   id=$(gh api repos/Manacost-Labs/HeartPulse/rulesets \
     --jq '.[] | select(.name == "main: merge queue only") | .id')
   gh api -X PUT "repos/Manacost-Labs/HeartPulse/rulesets/$id" -f enforcement=disabled
   gh api -X PUT "repos/Manacost-Labs/HeartPulse/rulesets/$id" -f enforcement=active
   ```

   Rollback of the whole change: `gh api -X DELETE
   "repos/Manacost-Labs/HeartPulse/rulesets/$id"` and
   `gh api -X PATCH repos/Manacost-Labs/HeartPulse -F allow_auto_merge=false`.

The `Production` environment keeps its `main` deployment branch policy; it is
unaffected.

## Long-lived processes

Storybook, `next dev`, watchers and browsers are started only for the check
that needs them and stopped before the handoff (`kill %1`, `TaskStop`, or the
port's owning PID from `ss -ltnp`). A session that ends with a listening dev
server is not finished.
