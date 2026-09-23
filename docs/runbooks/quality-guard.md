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

The registry includes Russian purpose keywords and a native authenticated-page
reference in `scripts/quality/references/`. Referenced source/token hashes detect
stale screenshots: after UI changes, recapture with the native browser suite and
review before updating those hashes. Set `QA_SCREENSHOT_DIR` to a worktree-owned
directory when running the browser suite so concurrent tasks keep separate output.
The static config gate requires no model, browser or OpenRouter API call.
