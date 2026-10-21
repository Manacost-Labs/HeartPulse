import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  addedChangelogFragments, deploymentVerdict, parseArgs,
} from '../scripts/agent-integrate.mjs';

test('only dated changelog.d files count as fragments', () => {
  assert.deepEqual(addedChangelogFragments(['changelog.d/README.md', 'changelog.d/2026-10-21-queue.md', 'docs/a.md']),
    ['changelog.d/2026-10-21-queue.md']);
});

test('arguments default to auto-merge and a draft disables it', () => {
  assert.deepEqual(parseArgs([]), { auto: true, draft: false, status: false, title: null, bodyFile: null, checks: [] });
  assert.equal(parseArgs(['--draft']).auto, false);
  assert.deepEqual(parseArgs(['--check', 'test:registry', '--check', 'lint']).checks, ['test:registry', 'lint']);
  assert.throws(() => parseArgs(['--push-main']), /unknown argument/);
  assert.throws(() => parseArgs(['--allow-shared']), /Shared-Hot-Spots: <reason>" commit trailer/);
});

test('the session ends only when production contains the merge commit', () => {
  assert.equal(deploymentVerdict({ state: 'OPEN' }).done, false);
  assert.equal(deploymentVerdict({ state: 'MERGED', mergeCommit: 'a', productionRelease: null }).done, false);
  assert.match(deploymentVerdict({ state: 'MERGED', mergeCommit: 'a', productionRelease: 'b', productionContainsMerge: false }).message,
    /does not contain/);
  assert.equal(deploymentVerdict({ state: 'MERGED', mergeCommit: 'a', productionRelease: 'b', productionContainsMerge: true }).done, true);
});

test('the main ruleset only lets the merge queue change main', () => {
  const ruleset = JSON.parse(readFileSync('.github/rulesets/main-merge-queue.json', 'utf8'));
  const rules = Object.fromEntries(ruleset.rules.map(rule => [rule.type, rule.parameters ?? {}]));
  assert.equal(ruleset.enforcement, 'active');
  assert.deepEqual(ruleset.bypass_actors, [], 'nobody, admins included, may push to main past the queue');
  assert.deepEqual(ruleset.conditions.ref_name.include, ['~DEFAULT_BRANCH']);
  for (const type of ['deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'merge_queue']) {
    assert.ok(rules[type], `${type} rule is required`);
  }
  assert.equal(rules.merge_queue.merge_method, 'SQUASH');
  assert.deepEqual(rules.required_status_checks.required_status_checks, [{ context: 'CI required', integration_id: 15368 }]);
  assert.equal(rules.required_status_checks.strict_required_status_checks_policy, false,
    'the queue tests against the newest main, so PRs need no up-to-date rebase');
});
