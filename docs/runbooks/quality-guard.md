# Project quality commands

`config/quality-guard.json` connects the versioned server tools to this project's
existing release gate, compiler, architecture checks, Storybook and browser
observatory. `npm run quality:config` validates native commands and component
paths; `verify:release` and therefore CI execute this check without API keys.

Use `npm run quality:plan -- --risk high --changed src/app/shell/HeaderProfileButton.tsx`
to inspect selection. `npm run quality:verify -- --risk high --allow-heavy --allow-network`
executes the selected checks with their declared limits. Explicit heavy/network
permission is required for the full browser/release/audit set. Missing tools,
timeouts and omitted required checks must not be reported as a passing gate.

The project client uses `~/.local/share/codex-context-economy/current` and its
Python environment by default. Set `MANACOST_QUALITY_ROOT` to a separately
prepared release for candidate validation; this does not switch the installed
release. The repository owns the command registry and design references.

For code reuse, provide selected files to the server `retrieve` command. Exact
symbols use local AST results. Only an explicitly unresolved search with
`--semantic-fallback --evidence-gap TEXT --allow-remote` invokes the configured
OpenRouter embedding and native rerank endpoints. Treat source hashes and
complete definitions as evidence, and run the relevant project test before reuse.
The runtime keeps model credentials and caches outside the repository.

## Reuse existing code and check search quality

After `npm run agent:context -- <module-or-path>` identifies a bounded area, use
the installed CLI before broad source reads:

```sh
context-economy --project "$PWD" retrieve 'device authorization payload' \
  --source src/modules/applicationConnect/schema/deviceAuthorization.ts \
  --source src/modules/applicationConnect/applicationConnectModel.ts
npm run quality:retrieval-eval
```

`config/retrieval-eval.json` owns six labeled implementation queries and one
no-answer query. The default evaluation is local and makes no model calls. To
compare the native OpenRouter embedding/rerank path, run
`npm run quality:retrieval-eval -- --semantic` only with an explicit evidence
gap and the shared daily budget available. A ranked hit is a candidate, never
proof that the implementation fits. Update labels when code moves; record the
manifest hash with each result. The no-answer case checks whether the selected
corpus should be widened before reusing code.

## Measure accepted tasks

For a real task chosen for the pilot, start before preparation with a unique
task ID: `context-economy --project "$PWD" meter-start --task-id ID
--current-session --from-task-start`. The current-session option resolves the
exact local Codex JSONL identified by `CODEX_SESSION_ID`; other clients must
pass an exact `--session` path. Omit `--from-task-start` if preparation already
began and do not label that interval complete. Attach helper sessions before
they work, and bind CLI helpers with `--meter-task-id ID` when used.

Create a small ignored `.artifacts/pilot/task.json` with `goal`, nonempty
`criteria`, and `constraints`, then run local `context-economy --project
"$PWD" advise --task .artifacts/pilot/task.json --category implementation
--selected-model terra` (use the actual category/model). Save its returned
`advice_id`. After all checks, call `meter-finish --task-id ID
--coverage-evidence '...'` only if the interval includes preparation, retries,
reviews and helpers. Record one actual outcome using `pilot-record --file
.artifacts/pilot/outcome.json --meter-task ID`; the required fields and pairing
rules are in the installed `ADVISORY-PILOT.md`. Never infer credits from API
prices, fabricate a baseline or mark an unverified change accepted.

`npm run quality:pilot-report` shows accepted-task pairs, and
`npm run quality:usage-report` shows measured end-to-end usage. Neither a
retrieval benchmark nor a single outcome proves token savings. Use
`npm run quality:cache-stats -- --days 7` to inspect UTC hit/miss/expiry and
eviction trends without revealing source or query text; keep the cache limit
and TTL until real churn warrants a change.

The registry includes Russian purpose keywords and a native authenticated-page
reference in `scripts/quality/references/`. Referenced source/token hashes detect
stale screenshots: after UI changes, recapture with the native browser suite and
review before updating those hashes. Set `QA_SCREENSHOT_DIR` to a worktree-owned
directory when running the browser suite so concurrent tasks keep separate output.
The static config gate requires no model, browser or OpenRouter API call.
