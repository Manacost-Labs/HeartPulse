import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { ReportError, createGhApi, main, median, percentile, scanLogForInfra } from '../scripts/ci-flake-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/ci-flake-report/github-api.json'), 'utf8'));
const NOW = () => new Date('2026-10-28T00:00:00Z');

/**
 * The GitHub network boundary: answers `gh api` endpoints from recorded API
 * responses. Everything the report computes runs for real on top of it.
 */
function fixtureApi({ requests = [], data = fixture } = {}) {
  return async endpoint => {
    requests.push(endpoint);
    const url = new URL(`https://api.github.test/${endpoint}`);
    const route = url.pathname.replace(/^\//, '').replace(`repos/${data.repository}/`, '');
    const page = Number(url.searchParams.get('page') ?? 1);
    const perPage = Number(url.searchParams.get('per_page') ?? 30);
    const slice = items => items.slice((page - 1) * perPage, page * perPage);
    let match;
    if (endpoint === 'repos/{owner}/{repo}') return JSON.stringify({ full_name: data.repository });
    if (route === 'actions/workflows/ci.yml/runs') {
      const created = url.searchParams.get('created');
      const floor = created ? Date.parse(created.replace('>=', '')) : -Infinity;
      const all = data.runs.workflow_runs.filter(run => Date.parse(run.created_at) >= floor);
      return JSON.stringify({ total_count: all.length, workflow_runs: slice(all) });
    }
    if ((match = /^actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/.exec(route))) {
      const recorded = data.jobs[`${match[1]}/${match[2]}`];
      assert.ok(recorded, `fixture has no jobs for ${route}`);
      return JSON.stringify({ total_count: recorded.jobs.length, jobs: slice(recorded.jobs) });
    }
    if ((match = /^actions\/runs\/(\d+)\/attempts\/(\d+)$/.exec(route))) {
      assert.ok(data.attempts[`${match[1]}/${match[2]}`], `fixture has no attempt ${route}`);
      return JSON.stringify(data.attempts[`${match[1]}/${match[2]}`]);
    }
    if ((match = /^check-runs\/(\d+)\/annotations$/.exec(route))) {
      return JSON.stringify(slice(data.annotations[match[1]] ?? []));
    }
    if ((match = /^actions\/jobs\/(\d+)\/logs$/.exec(route))) {
      if (!(match[1] in data.logs)) {
        const error = new ReportError('gh api завершился с ошибкой: gh: Not Found (HTTP 404).');
        error.notFound = true;
        throw error;
      }
      return data.logs[match[1]];
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
}

async function run(argv, { api = fixtureApi(), sleep = async () => {}, repo = fixture.repository } = {}) {
  let out = '';
  let err = '';
  const code = await main([...(repo ? ['--repo', repo] : []), '--no-cache', ...argv], {
    api,
    sleep,
    now: NOW,
    stdout: { write: text => { out += text; } },
    stderr: { write: text => { err += text; } },
  });
  return { code, out, err };
}

async function runJson(argv = []) {
  const result = await run([...argv, '--json']);
  assert.equal(result.code, 0, result.err);
  return JSON.parse(result.out);
}

const classOf = (report, runId, attempt = 1) => report.redAttempts.find(item => item.runId === runId && item.attempt === attempt)?.class;

test('a run that went green on rerun is flaky, a dependabot tsc failure is real, a cancelled run is separate', async () => {
  const report = await runJson();
  assert.equal(classOf(report, 103, 1), 'flaky', 'attempt 1 of the run that passed on rerun');
  assert.match(report.redAttempts.find(item => item.runId === 103).reason, /rerun/);
  assert.equal(classOf(report, 105), 'real', 'dependabot pull request with a TypeScript error');
  assert.equal(classOf(report, 104), 'cancelled');
});

test('classifies every red attempt of the recorded window', async () => {
  const report = await runJson();
  const classes = Object.fromEntries(report.redAttempts.map(item => [`${item.runId}#${item.attempt}`, item.class]));
  assert.deepEqual(classes, {
    '101#1': 'flaky', // the same commit passed in run 102
    '103#1': 'flaky', // attempt 2 passed
    '104#1': 'cancelled',
    '105#1': 'real',
    '106#1': 'infra', // Chrome never started
    '107#1': 'infra', // apt-get failed
    '108#1': 'infra', // the job timed out
    '109#1': 'real', // a Chrome timeout in one shard does not excuse a failing contract test in another
    '110#1': 'flaky', // the queue ran the same pull request green later with no new commit
    '111#1': 'real', // a new commit landed in the pull request before it passed the queue
  });
  assert.match(report.redAttempts.find(item => item.runId === 101).reason, /run 102/);
  assert.match(report.redAttempts.find(item => item.runId === 106).reason, /chrome-launch/);
  assert.match(report.redAttempts.find(item => item.runId === 107).reason, /setup-step/);
  assert.match(report.redAttempts.find(item => item.runId === 108).reason, /job-timeout/);
});

test('counts red and rerun-green runs overall and by event', async () => {
  const report = await runJson();
  assert.equal(report.window.completedRuns, 15);
  assert.equal(report.window.pendingRuns, 1, 'the run still in progress is not counted');
  assert.deepEqual(
    { runs: report.totals.runs, green: report.totals.green, red: report.totals.red, cancelled: report.totals.cancelled },
    { runs: 15, green: 6, red: 8, cancelled: 1 },
  );
  assert.equal(report.totals.redPercent, 53.3);
  assert.equal(report.totals.notGreenPercent, 60);
  assert.equal(report.totals.rerunGreen, 1);
  assert.equal(report.totals.rerunGreenPercent, 6.7);
  assert.deepEqual(Object.keys(report.byEvent), ['pull_request', 'merge_group', 'push']);
  assert.equal(report.byEvent.pull_request.redPercent, 55.6);
  assert.equal(report.byEvent.merge_group.redPercent, 50);
  assert.equal(report.byEvent.push.redPercent, 50);
  assert.deepEqual(report.totals.classification, { real: 3, flaky: 3, infra: 3, cancelled: 1, total: 10 });
  assert.deepEqual(report.byEvent.merge_group.classification, { real: 1, flaky: 1, infra: 0, cancelled: 0, total: 2 });
});

test('ranks FAIL and FLAKY test files and failed jobs, leaving out the quarantine and the CI gate', async () => {
  const report = await runJson(['--top', '3']);
  assert.deepEqual(report.topFail, [
    { name: 'tests/queue-flaky-browser.test.mjs', count: 2, runs: 2 },
    { name: 'tests/chrome-browser.test.mjs', count: 1, runs: 1 },
    { name: 'tests/queue-real.test.mjs', count: 1, runs: 1 },
  ]);
  assert.deepEqual(report.topFlaky, [
    { name: 'tests/queue-flaky-browser.test.mjs', count: 2, runs: 2 },
    { name: 'tests/other-browser.test.mjs', count: 1, runs: 1 },
  ]);
  assert.deepEqual(report.topFailedJobs, [
    { name: 'Browser suite', count: 6, runs: 6 },
    { name: 'Registry suites', count: 3, runs: 3 },
    { name: 'Typecheck, lint and static gates', count: 1, runs: 1 },
  ]);
  const everything = await runJson(['--top', '50']);
  assert.ok(!everything.topFail.some(item => item.name.includes('quarantined')), 'quarantine failures never block CI');
  assert.ok(!everything.topFailedJobs.some(item => /CI required|quarantine/i.test(item.name)));
});

test('shares green runs that carried a FLAKY warning', async () => {
  const report = await runJson();
  assert.deepEqual(report.greenWithFlaky, { greenRuns: 6, withFlaky: 2, percent: 33.3 });
});

test('median and p90 duration per event skip cancelled runs and use the last attempt', async () => {
  const report = await runJson();
  assert.deepEqual(report.byEvent.pull_request.duration, { runs: 8, medianSeconds: 450, p90Seconds: 900 });
  assert.deepEqual(report.byEvent.merge_group.duration, { runs: 4, medianSeconds: 600, p90Seconds: 720 });
  assert.deepEqual(report.byEvent.push.duration, { runs: 2, medianSeconds: 210, p90Seconds: 240 });
  assert.deepEqual(report.totals.duration, { runs: 14, medianSeconds: 480, p90Seconds: 720 });
});

test('prints a markdown report with the headline table', async () => {
  const { code, out } = await run(['--runs', '150']);
  assert.equal(code, 0);
  assert.match(out, /^# CI: красные прогоны и flaky-тесты \(ci\.yml\)/);
  assert.match(out, /\| pull_request \| 9 \| 3 \| 5 \| 55,6% \| 1 \| 66,7% \| 1 \| 11,1% \|/);
  assert.match(out, /\| Всего \| 15 \| 6 \| 8 \| 53,3% \| 1 \| 60,0% \| 1 \| 6,7% \|/);
  assert.match(out, /\| Всего \| 3 \| 3 \| 3 \| 1 \| 10 \|/);
  assert.match(out, /\| Всего \| 14 \| 8,0 мин \| 12,0 мин \|/);
  assert.match(out, /2 из 6 зелёных прогонов \(33,3%\)/);
  assert.match(out, /\| tests\/queue-flaky-browser\.test\.mjs \| 2 \| 2 \|/);
  assert.match(out, /Логи 4 упавших джобов недоступны/);
});

test('--runs keeps the newest runs and --since asks GitHub for a window', async () => {
  const newest = await runJson(['--runs', '3']);
  assert.equal(newest.window.completedRuns + newest.window.pendingRuns, 3);
  assert.equal(newest.byEvent.merge_group.runs, 1);
  assert.equal(newest.byEvent.push.runs, 1);

  const requests = [];
  const result = await run(['--since', '2026-10-27T14:00:00Z', '--json'], { api: fixtureApi({ requests }) });
  const windowed = JSON.parse(result.out);
  assert.ok(requests.some(endpoint => decodeURIComponent(endpoint).includes('created=>=2026-10-27T14:00:00Z')));
  assert.equal(windowed.window.completedRuns, 6);
  assert.equal(windowed.window.from, '2026-10-27T14:00:00.000Z');
});

test('an empty window still prints a report', async () => {
  const result = await run(['--since', '2030-01-01T00:00:00Z']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /завершённых прогонов: 0/);
  assert.match(result.out, /\| Всего \| 0 \| 0 \| 0 \| 0,0% \|/);
});

test('retries a transient GitHub error and gives up with a clear message when it persists', async () => {
  const inner = fixtureApi();
  let failures = 1;
  const flaky = async endpoint => {
    if (failures > 0 && endpoint.includes('/runs?')) {
      failures -= 1;
      const error = new ReportError('gh api завершился с ошибкой: HTTP 502.');
      error.transient = true;
      throw error;
    }
    return inner(endpoint);
  };
  const recovered = await run(['--json'], { api: flaky });
  assert.equal(recovered.code, 0, recovered.err);
  assert.equal(JSON.parse(recovered.out).window.completedRuns, 15);

  const delays = [];
  const down = async () => {
    const error = new ReportError('gh api завершился с ошибкой: HTTP 503.');
    error.transient = true;
    throw error;
  };
  const failed = await run([], { api: down, sleep: async ms => { delays.push(ms); } });
  assert.equal(failed.code, 1);
  assert.match(failed.err, /ci-flake-report: .*HTTP 503/);
  assert.deepEqual(delays, [1000, 2000], 'backs off between the three tries');
  assert.equal(failed.out, '');
});

function ghResult({ code = null, stderr = '' }) {
  return (command, args, options, callback) => {
    const error = code === null ? null : Object.assign(new Error(`exit ${code}`), { code });
    queueMicrotask(() => callback(error, '', stderr));
  };
}

async function runWithGh(execFileImpl) {
  return run([], { api: createGhApi({ execFileImpl }) });
}

test('resolves the repository from the current checkout when --repo is not given', async () => {
  const requests = [];
  const result = await run(['--json'], { api: fixtureApi({ requests }), repo: null });
  assert.equal(result.code, 0, result.err);
  assert.equal(JSON.parse(result.out).repository, 'acme/widgets');
  assert.equal(requests[0], 'repos/{owner}/{repo}');
  assert.ok(requests.slice(1).every(endpoint => endpoint.startsWith('repos/acme/widgets/')), 'later calls use the resolved name');
});

test('finished attempts are cached: a repeated report asks GitHub only for the run list', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ci-flake-report-cache-test-'));
  try {
    const argv = ['--cache-dir', directory, '--json'];
    const first = [];
    const cold = await main(['--repo', fixture.repository, ...argv], {
      api: fixtureApi({ requests: first }), sleep: async () => {}, now: NOW,
      stdout: { write: () => {} }, stderr: { write: () => {} },
    });
    assert.equal(cold, 0);
    assert.ok(first.some(endpoint => endpoint.includes('/jobs?')) && first.some(endpoint => endpoint.includes('/annotations?')));

    const second = [];
    let out = '';
    const warm = await main(['--repo', fixture.repository, ...argv], {
      api: fixtureApi({ requests: second }), sleep: async () => {}, now: NOW,
      stdout: { write: text => { out += text; } }, stderr: { write: () => {} },
    });
    assert.equal(warm, 0);
    assert.deepEqual(second.filter(endpoint => !endpoint.includes('/workflows/ci.yml/runs?')), []);
    assert.deepEqual(JSON.parse(out), await runJson(), 'the cached report equals the fresh one');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('stops at a rate limit without waiting and resumes from the cache', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ci-flake-report-cache-test-'));
  try {
    const inner = fixtureApi();
    let served = 0;
    const limited = async endpoint => {
      if (endpoint.includes('/annotations?') && (served += 1) > 5) {
        throw Object.assign(new ReportError('limit'), { rateLimited: true });
      }
      return inner(endpoint);
    };
    const delays = [];
    let err = '';
    const code = await main(['--repo', fixture.repository, '--cache-dir', directory, '--concurrency', '1'], {
      api: limited, sleep: async ms => { delays.push(ms); }, now: NOW,
      stdout: { write: () => {} }, stderr: { write: text => { err += text; } },
    });
    assert.equal(code, 1);
    assert.deepEqual(delays, [], 'a rate limit lasts up to an hour, so retrying at once is pointless');

    const requests = [];
    let out = '';
    const resumed = await main(['--repo', fixture.repository, '--cache-dir', directory, '--concurrency', '1', '--json'], {
      api: fixtureApi({ requests }), sleep: async () => {}, now: NOW,
      stdout: { write: text => { out += text; } }, stderr: { write: () => {} },
    });
    assert.equal(resumed, 0);
    assert.equal(JSON.parse(out).window.completedRuns, 15);
    assert.ok(requests.filter(endpoint => endpoint.includes('/jobs?')).length < 15, 'attempts finished before the limit are not downloaded again');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('explains an exhausted API quota and exits non-zero', async () => {
  const result = await runWithGh(ghResult({
    code: 1,
    stderr: 'gh: API rate limit exceeded for user ID 1. (HTTP 403)\n',
  }));
  assert.equal(result.code, 1);
  assert.match(result.err, /Исчерпан лимит запросов GitHub API/);
});

test('explains a missing gh CLI and exits non-zero', async () => {
  const result = await runWithGh(ghResult({ code: 'ENOENT' }));
  assert.equal(result.code, 1);
  assert.match(result.err, /`gh` не найден/);
  assert.equal(result.out, '');
});

test('explains missing GitHub credentials and exits non-zero', async () => {
  const result = await runWithGh(ghResult({
    code: 4,
    stderr: 'gh: To use GitHub CLI in automation, set the GH_TOKEN environment variable.\n',
  }));
  assert.equal(result.code, 1);
  assert.match(result.err, /gh auth login/);
  assert.match(result.err, /GH_TOKEN/);
});

test('explains an unreachable network and exits non-zero', async () => {
  const result = await runWithGh(ghResult({
    code: 1,
    stderr: 'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com\n',
  }));
  assert.equal(result.code, 1);
  assert.match(result.err, /Нет связи с GitHub/);
});

test('a real process without gh in PATH fails with a readable message', () => {
  const emptyPath = mkdtempSync(path.join(tmpdir(), 'ci-flake-report-path-'));
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/ci-flake-report.mjs'), '--runs', '5'], {
      env: { PATH: emptyPath },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ci-flake-report: GitHub CLI `gh` не найден/);
    assert.equal(result.stdout, '');
  } finally {
    rmSync(emptyPath, { recursive: true, force: true });
  }
});

test('rejects bad arguments with exit code 2 before touching the network', async () => {
  for (const argv of [['--runs', '0'], ['--runs', 'many'], ['--since', 'yesterday-ish'], ['--bogus'], ['--repo', 'nonsense']]) {
    const requests = [];
    const result = await run(argv, { api: fixtureApi({ requests }) });
    assert.equal(result.code, 2, argv.join(' '));
    assert.match(result.err, /Использование|OWNER\/NAME/);
    assert.deepEqual(requests, []);
  }
});

test('infra detection reads a failed log but ignores a Chrome start that recovered', () => {
  assert.deepEqual(scanLogForInfra('TimeoutError: Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!'), ['chrome-launch']);
  assert.deepEqual(scanLogForInfra('[browser] Timed out after 60000 ms while waiting for the WS endpoint URL; starting the browser once more\nok'), []);
  assert.deepEqual(scanLogForInfra('sudo apt-get install -y nginx openssl\n'), [], 'a command line is not a failure');
  assert.deepEqual(scanLogForInfra('2026-10-27T15:00:00Z E: Unable to locate package nginx'), ['apt-get']);
  assert.deepEqual(scanLogForInfra('npm error network request failed ECONNRESET'), ['network']);
  assert.deepEqual(scanLogForInfra('AssertionError: expected 1 to equal 2'), []);
});

test('median and p90 stay inside the data and order correctly', () => {
  assert.equal(median([]), null);
  assert.equal(percentile([], 0.9), null);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(percentile([5, 1, 4, 2, 3, 10, 9, 8, 7, 6], 0.9), 9);
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 60 }), values => {
    const low = Math.min(...values);
    const high = Math.max(...values);
    const mid = median(values);
    const p90 = percentile(values, 0.9);
    return low <= mid && mid <= high && values.includes(p90) && mid <= p90 && percentile(values, 1) === high;
  }));
});

function withRunChanges(changes) {
  const data = structuredClone(fixture);
  for (const item of data.runs.workflow_runs) Object.assign(item, changes[item.id] ?? {});
  return data;
}

async function reportFor(data) {
  const result = await run(['--json'], { api: fixtureApi({ data }) });
  assert.equal(result.code, 0, result.err);
  return JSON.parse(result.out);
}

test('a green run of the same commit that finished BEFORE the failure does not make it flaky', async () => {
  assert.equal(classOf(await runJson(), 101), 'flaky', 'baseline: run 102 passed after run 101');
  const earlier = await reportFor(withRunChanges({ 102: { created_at: '2026-10-27T08:50:00Z', run_started_at: '2026-10-27T08:50:00Z' } }));
  assert.equal(classOf(earlier, 101), 'real', 'a pass before the failure says nothing about it');
});

test('table cells keep backslashes, pipes and line breaks from breaking the markdown row', async () => {
  const data = withRunChanges({ 105: { head_branch: 'fix/a\\|b\\\nnext|c' } });
  const { out } = await run([], { api: fixtureApi({ data }) });
  const row = out.split('\n').find(line => line.includes('actions/runs/105)'));
  assert.ok(row, 'the red attempt of run 105 stays on a single line');
  assert.ok(row.includes('| fix/a\\\\\\|b\\\\ next\\|c |'), row);
});
