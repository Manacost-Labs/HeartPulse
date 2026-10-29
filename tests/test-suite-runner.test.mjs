import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  discoverTestFiles,
  parseOnlyFiles,
  parseRunnerArguments,
  parseShard,
  planShards,
  TEST_SUITE_IDS,
  runTestRegistry,
  validateTestDurations,
  validateTestRegistry,
} from '../scripts/test-suite-runner.mjs';

function withRepository(run) {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'arena-test-registry-'));
  const removeRepository = () => rmSync(repositoryRoot, { recursive: true, force: true });
  try {
    const result = run(repositoryRoot);
    if (result && typeof result.then === 'function') {
      return result.finally(removeRepository);
    }
    removeRepository();
    return result;
  } catch (error) {
    removeRepository();
    throw error;
  }
}

function writeFixture(repositoryRoot, relativePath, contents = '') {
  const absolutePath = path.join(repositoryRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function registry(files, overrides = {}) {
  const suites = overrides.suites ?? [{ id: 'unit', files }];
  const fileEnvironment = Object.fromEntries(suites.flatMap(suite =>
    suite.files.map(file => [file, suite.env ?? { TIERLIST_TEST_SKIP_HANDLER: '1' }])));
  return {
    version: 1,
    exclusions: [],
    fileEnvironment,
    ...overrides,
    suites: [...suites.map(({ env, ...suite }) => suite),
      ...TEST_SUITE_IDS.filter(id => !suites.some(suite => suite.id === id)).map(id => ({ id, files: [] }))],
  };
}

function completedChild(code = 0, signal = null) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('close', code, signal));
  return child;
}

test('discovers authored test files repository-wide and ignores generated or vendored trees', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/root.test.ts');
    writeFixture(repositoryRoot, 'tests/nested/component.test.tsx');
    writeFixture(repositoryRoot, 'tests/nested/tool.test.mjs');
    writeFixture(repositoryRoot, 'src/module/model.test.ts');
    writeFixture(repositoryRoot, 'server/module/routes.test.ts');
    writeFixture(repositoryRoot, 'tests/nested/helper.ts');
    writeFixture(repositoryRoot, 'tests/nested/legacy.test.js');
    writeFixture(repositoryRoot, 'node_modules/package/vendor.test.ts');
    writeFixture(repositoryRoot, 'build/server/generated.test.mjs');
    writeFixture(repositoryRoot, 'dist/assets/generated.test.mjs');
    writeFixture(repositoryRoot, 'storybook-static/generated.test.mjs');
    writeFixture(repositoryRoot, '.codegraph/index.test.mjs');

    assert.deepEqual(discoverTestFiles(repositoryRoot), [
      'server/module/routes.test.ts',
      'src/module/model.test.ts',
      'tests/nested/component.test.tsx',
      'tests/nested/legacy.test.js',
      'tests/nested/tool.test.mjs',
      'tests/root.test.ts',
    ]);
  });
});

test('accepts a registry that covers every discovered test exactly once', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/one.test.ts');
    writeFixture(repositoryRoot, 'tests/two.test.mjs');

    const result = validateTestRegistry(
      registry(['tests/one.test.ts', 'tests/two.test.mjs']),
      { repositoryRoot },
    );

    assert.deepEqual(result.files, [
      'tests/one.test.ts',
      'tests/two.test.mjs',
    ]);
  });
});

test('rejects a registry that omits a discovered test', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/listed.test.ts');
    writeFixture(repositoryRoot, 'tests/missing.test.tsx');

    assert.throws(
      () => validateTestRegistry(registry(['tests/listed.test.ts']), { repositoryRoot }),
      /unclassified test files: tests\/missing\.test\.tsx/,
    );
  });
});

test('rejects authored tests outside the tests directory with an actionable error', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/listed.test.ts');
    writeFixture(repositoryRoot, 'src/module/misplaced.test.ts');

    assert.throws(
      () => validateTestRegistry(registry(['tests/listed.test.ts']), { repositoryRoot }),
      /unclassified test files: src\/module\/misplaced\.test\.ts/,
    );
  });
});

test('rejects duplicate registrations across suites', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/duplicate.test.ts');

    assert.throws(
      () => validateTestRegistry(registry([], {
        suites: [
          { id: 'unit', env: {}, files: ['tests/duplicate.test.ts'] },
          { id: 'integration', env: {}, files: ['tests/duplicate.test.ts'] },
        ],
      }), { repositoryRoot }),
      /classified more than once: tests\/duplicate\.test\.ts/,
    );
  });
});

test('rejects registered files that do not exist', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/existing.test.ts');

    assert.throws(
      () => validateTestRegistry(
        registry(['tests/existing.test.ts', 'tests/nonexistent.test.mjs']),
        { repositoryRoot },
      ),
      /classified test does not exist: tests\/nonexistent\.test\.mjs/,
    );
  });
});

test('rejects absolute, traversing, normalized, and backslash paths', async t => {
  for (const unsafePath of [
    '/tmp/outside.test.ts',
    '../outside.test.ts',
    'tests/../outside.test.ts',
    'tests\\outside.test.ts',
    'tests/\0outside.test.ts',
  ]) {
    await t.test(unsafePath, () => {
      withRepository(repositoryRoot => {
        assert.throws(
          () => validateTestRegistry(registry([unsafePath]), { repositoryRoot }),
          /unsafe test path/,
        );
      });
    });
  }
});

test('validates environment variable names and string values', async t => {
  await t.test('invalid name', () => {
    withRepository(repositoryRoot => {
      writeFixture(repositoryRoot, 'tests/env.test.ts');
      assert.throws(
        () => validateTestRegistry(registry([], {
          suites: [{ id: 'unit', env: { 'BAD-NAME': '1' }, files: ['tests/env.test.ts'] }],
        }), { repositoryRoot }),
        /invalid environment variable name: BAD-NAME/,
      );
    });
  });

  await t.test('non-string value', () => {
    withRepository(repositoryRoot => {
      writeFixture(repositoryRoot, 'tests/env.test.ts');
      assert.throws(
        () => validateTestRegistry(registry([], {
          suites: [{ id: 'unit', env: { RETRIES: 2 }, files: ['tests/env.test.ts'] }],
        }), { repositoryRoot }),
        /environment variable RETRIES must be a string/,
      );
    });
  });
});

test('runs registered tests sequentially without a shell and merges the registry environment', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/first.test.ts');
    writeFixture(repositoryRoot, 'tests/second.test.mjs');

    const calls = [];
    let childRunning = false;
    const spawnImpl = (command, args, options) => {
      assert.equal(childRunning, false, 'a second child started before the first completed');
      childRunning = true;
      calls.push({ command, args, options });
      const child = new EventEmitter();
      queueMicrotask(() => {
        childRunning = false;
        child.emit('close', 0, null);
      });
      return child;
    };
    const messages = [];

    const summary = await runTestRegistry(
      registry(['tests/first.test.ts', 'tests/second.test.mjs']),
      {
        repositoryRoot,
        spawnImpl,
        parentEnv: { INHERITED: 'yes' },
        logger: message => messages.push(message),
      },
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, process.execPath);
    assert.deepEqual(calls[0].args, ['--import', 'tsx', 'tests/first.test.ts']);
    assert.equal(calls[1].command, process.execPath);
    assert.deepEqual(calls[1].args, ['tests/second.test.mjs']);
    for (const call of calls) {
      assert.equal(call.options.cwd, repositoryRoot);
      assert.equal(call.options.shell, false);
      assert.equal(call.options.stdio, 'inherit');
      assert.deepEqual(call.options.env, {
        INHERITED: 'yes',
        TIERLIST_TEST_SKIP_HANDLER: '1',
      });
    }
    assert.deepEqual(summary, { executed: 2, registered: 2, excluded: 0 });
    assert.deepEqual(messages, [
      '[test-suite] START unit tests/first.test.ts',
      '[test-suite] PASS unit tests/first.test.ts',
      '[test-suite] START unit tests/second.test.mjs',
      '[test-suite] PASS unit tests/second.test.mjs',
      '[test-suite] SUMMARY executed=2 registered=2 excluded=0',
    ]);
  });
});

test('applies environment only to the suite that declares it', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/tierlist.test.ts');
    writeFixture(repositoryRoot, 'tests/regular.test.ts');
    const calls = [];

    await runTestRegistry(registry([], {
      suites: [
        { id: 'unit', env: { TIERLIST_TEST_SKIP_HANDLER: '1' }, files: ['tests/tierlist.test.ts'] },
        { id: 'integration', env: {}, files: ['tests/regular.test.ts'] },
      ],
    }), {
      repositoryRoot,
      parentEnv: { INHERITED: 'yes' },
      spawnImpl: (command, args, options) => {
        calls.push({ command, args, options });
        return completedChild();
      },
      logger: () => {},
    });

    assert.equal(calls[0].options.env.TIERLIST_TEST_SKIP_HANDLER, '1');
    assert.equal(calls[1].options.env.TIERLIST_TEST_SKIP_HANDLER, undefined);
    assert.equal(calls[1].options.env.INHERITED, 'yes');
  });
});

test('stops after a nonzero child exit and exposes the exit code', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/failing.test.ts');
    writeFixture(repositoryRoot, 'tests/unreached.test.ts');
    let calls = 0;
    const messages = [];

    await assert.rejects(
      runTestRegistry(
        registry(['tests/failing.test.ts', 'tests/unreached.test.ts']),
        {
          repositoryRoot,
          spawnImpl: () => {
            calls += 1;
            return completedChild(7);
          },
          logger: message => messages.push(message),
        },
      ),
      error => error.exitCode === 7
        && error.testFile === 'tests/failing.test.ts'
        && /exited with code 7/.test(error.message),
    );
    assert.equal(calls, 1);
    assert.deepEqual(messages, [
      '[test-suite] START unit tests/failing.test.ts',
      '[test-suite] FAIL unit tests/failing.test.ts',
      '[test-suite] SUMMARY executed=1 registered=2',
    ]);
  });
});

test('reports a child terminated by a signal and stops the suite', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/signaled.test.mjs');
    writeFixture(repositoryRoot, 'tests/unreached.test.mjs');
    let calls = 0;

    await assert.rejects(
      runTestRegistry(
        registry(['tests/signaled.test.mjs', 'tests/unreached.test.mjs']),
        {
          repositoryRoot,
          spawnImpl: () => {
            calls += 1;
            return completedChild(null, 'SIGTERM');
          },
          logger: () => {},
        },
      ),
      error => error.signal === 'SIGTERM'
        && error.testFile === 'tests/signaled.test.mjs'
        && /terminated by SIGTERM/.test(error.message),
    );
    assert.equal(calls, 1);
  });
});

test('forwards parent termination signals to the active child and removes listeners', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/active.test.mjs');
    const signalEmitter = new EventEmitter();
    const child = new EventEmitter();
    child.pid = 1234;
    const kills = [];

    const running = runTestRegistry(registry(['tests/active.test.mjs']), {
      repositoryRoot,
      signalEmitter,
      spawnImpl: () => child,
      killImpl: (activeChild, signal) => {
        kills.push({ activeChild, signal });
        queueMicrotask(() => activeChild.emit('close', null, signal));
      },
      logger: () => {},
    });
    signalEmitter.emit('SIGTERM');
    queueMicrotask(() => child.emit('close', 0, null));

    await assert.rejects(
      running,
      error => error.signal === 'SIGTERM' && /interrupted by SIGTERM/.test(error.message),
    );
    assert.deepEqual(kills, [
      { activeChild: child, signal: 'SIGTERM' },
      { activeChild: child, signal: 'SIGKILL' },
    ]);
    assert.equal(signalEmitter.listenerCount('SIGINT'), 0);
    assert.equal(signalEmitter.listenerCount('SIGTERM'), 0);
  });
});

test('a repeated parent signal immediately force-kills the active process group', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/active.test.mjs');
    const signalEmitter = new EventEmitter();
    const child = new EventEmitter();
    child.pid = 1234;
    const kills = [];

    const running = runTestRegistry(registry(['tests/active.test.mjs']), {
      repositoryRoot,
      signalEmitter,
      spawnImpl: () => child,
      killImpl: (activeChild, signal) => {
        kills.push({ activeChild, signal });
        if (signal === 'SIGKILL') queueMicrotask(() => activeChild.emit('close', null, signal));
      },
      logger: () => {},
    });
    signalEmitter.emit('SIGINT');
    signalEmitter.emit('SIGINT');

    await assert.rejects(
      running,
      error => error.signal === 'SIGINT' && /interrupted by SIGINT/.test(error.message),
    );
    assert.deepEqual(kills, [
      { activeChild: child, signal: 'SIGINT' },
      { activeChild: child, signal: 'SIGKILL' },
    ]);
    assert.equal(signalEmitter.listenerCount('SIGINT'), 0);
    assert.equal(signalEmitter.listenerCount('SIGTERM'), 0);
  });
});

test('release and CI gates rely on the registry without rerunning registered files', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const duplicatedFocusedCommands = [
    'test:react-doctor-contract',
    'test:agent-tooling',
    'test:storybook',
    'test:security-tooling',
    'test:property',
    'test:sentry',
  ];
  for (const gate of ['verify:release', 'verify:ci']) {
    const command = packageJson.scripts[gate];
    assert.equal((command.match(/npm test/g) || []).length, 1, `${gate} must run the registry once`);
    for (const focusedCommand of duplicatedFocusedCommands) {
      assert.ok(!command.includes(`npm run ${focusedCommand}`), `${gate} duplicates ${focusedCommand}`);
    }
  }
});

test('parses shard specifications and rejects malformed ones', () => {
  assert.deepEqual(parseShard('1/1'), { index: 1, total: 1 });
  assert.deepEqual(parseShard('6/6'), { index: 6, total: 6 });
  for (const value of ['0/6', '7/6', '1/0', '-1/6', '1/6/2', '1.5/6', ' 1/6', '1/', '/6', '', 'a/b']) {
    assert.throws(() => parseShard(value), /invalid shard/, value);
  }
});

test('parses runner arguments strictly', () => {
  assert.deepEqual(parseRunnerArguments(['--validate']), { validate: true });
  assert.deepEqual(parseRunnerArguments(['--all']).suiteIds, TEST_SUITE_IDS);
  assert.deepEqual(parseRunnerArguments([
    '--suite', 'browser', '--shard', '2/6', '--retry-failed-once', '--continue-on-failure', '--quarantine', 'exclude',
  ]), {
    validate: false,
    suiteIds: ['browser'],
    shard: { index: 2, total: 6 },
    retryFailedOnce: true,
    continueOnFailure: true,
    quarantine: 'exclude',
  });
  assert.equal(parseRunnerArguments(['--suite', 'browser', '--quarantine', 'only']).quarantine, 'only');
  assert.equal(parseRunnerArguments(['--all']).quarantine, null);
  assert.equal(parseRunnerArguments(['--all']).continueOnFailure, false);
  assert.deepEqual(parseRunnerArguments(['--suite', 'unit,integration']).suiteIds, ['unit', 'integration']);
  for (const args of [
    [], ['--suite'], ['--suite', '--shard', '1/2'], ['--all', '--shard'], ['--all', '--shard', '1/2', '--shard', '2/2'],
    ['--all', '--retry-failed-once', '--retry-failed-once'], ['--all', '--unknown'], ['--validate', '--all'],
    ['--all', '--continue-on-failure', '--continue-on-failure'], ['--all', '--quarantine'],
    ['--all', '--quarantine', 'skip'], ['--all', '--quarantine', 'only', '--quarantine', 'exclude'],
  ]) {
    assert.throws(() => parseRunnerArguments(args), /usage:/, args.join(' '));
  }
  assert.throws(() => parseRunnerArguments(['--all', '--shard', '3/2']), /invalid shard/);
});

test('validates the historical duration file', () => {
  const valid = { version: 1, defaultSeconds: 15, seconds: { 'tests/a.test.mjs': 2.5 } };
  assert.equal(validateTestDurations(valid), valid);
  assert.throws(() => validateTestDurations({ ...valid, version: 2 }), /version/);
  assert.throws(() => validateTestDurations({ ...valid, defaultSeconds: 0 }), /defaultSeconds/);
  assert.throws(() => validateTestDurations({ ...valid, seconds: { 'tests/a.test.mjs': -1 } }), /positive/);
  assert.throws(() => validateTestDurations({ ...valid, seconds: { '../a.test.mjs': 1 } }), /unsafe test path/);
  const repositoryDurations = JSON.parse(readFileSync(new URL('../tests/test-durations.json', import.meta.url), 'utf8'));
  validateTestDurations(repositoryDurations);
});

test('every planned file lands in exactly one shard, in registry order', () => {
  const durations = { version: 1, defaultSeconds: 5, seconds: {} };
  for (let count = 0; count <= 23; count += 1) {
    const files = Array.from({ length: count }, (_, index) => `tests/f${String(index).padStart(2, '0')}.test.mjs`);
    files.forEach((file, index) => { durations.seconds[file] = ((index * 37) % 11) + 1; });
    for (let total = 1; total <= 8; total += 1) {
      const shards = planShards(files, total, durations);
      assert.equal(shards.length, total);
      assert.deepEqual(shards.flat().sort(), [...files].sort(), `count=${count} total=${total}`);
      for (const shard of shards) {
        assert.deepEqual(shard, files.filter(file => shard.includes(file)), 'a shard keeps the registry order');
      }
      assert.deepEqual(planShards(files, total, durations), shards, 'planning is deterministic');
    }
  }
  assert.throws(() => planShards(['tests/a.test.mjs'], 0, durations), /invalid shard total/);
});

test('balances shards by historical duration and weighs unknown files by the default', () => {
  const durations = {
    version: 1,
    defaultSeconds: 10,
    seconds: { 'tests/slow.test.mjs': 100, 'tests/medium.test.mjs': 50, 'tests/small.test.mjs': 40 },
  };
  const files = ['tests/small.test.mjs', 'tests/unknown-a.test.mjs', 'tests/slow.test.mjs',
    'tests/unknown-b.test.mjs', 'tests/medium.test.mjs'];
  // Longest first: slow(100) | medium(50) + small(40) + unknown-a(10) | the tie at 100 goes to shard 1.
  assert.deepEqual(planShards(files, 2, durations), [
    ['tests/slow.test.mjs', 'tests/unknown-b.test.mjs'],
    ['tests/small.test.mjs', 'tests/unknown-a.test.mjs', 'tests/medium.test.mjs'],
  ]);

  const registry = JSON.parse(readFileSync(new URL('../tests/test-suites.json', import.meta.url), 'utf8'));
  const repositoryDurations = JSON.parse(readFileSync(new URL('../tests/test-durations.json', import.meta.url), 'utf8'));
  const browserFiles = registry.suites.find(suite => suite.id === 'browser').files;
  const weight = file => repositoryDurations.seconds[file] ?? repositoryDurations.defaultSeconds;
  const totalSeconds = browserFiles.reduce((sum, file) => sum + weight(file), 0);
  const longest = Math.max(...browserFiles.map(weight));
  for (let total = 1; total <= 8; total += 1) {
    const loads = planShards(browserFiles, total, repositoryDurations)
      .map(shard => shard.reduce((sum, file) => sum + weight(file), 0));
    // Greedy longest-first is within one longest file of the perfect split.
    assert.ok(Math.max(...loads) <= totalSeconds / total + longest, `total=${total} loads=${loads.join(',')}`);
  }
});

test('shard runs execute every selected file exactly once across all shards', async () => {
  await withRepository(async repositoryRoot => {
    const browserFiles = Array.from({ length: 7 }, (_, index) => `tests/b${index}.test.mjs`);
    const unitFiles = ['tests/u0.test.ts', 'tests/u1.test.ts'];
    for (const file of [...browserFiles, ...unitFiles]) writeFixture(repositoryRoot, file);
    const fixture = registry([], {
      suites: [{ id: 'unit', files: unitFiles }, { id: 'browser', files: browserFiles }],
    });
    const durations = { version: 1, defaultSeconds: 1, seconds: { 'tests/b3.test.mjs': 9 } };
    const executed = [];
    const messages = [];
    for (let index = 1; index <= 3; index += 1) {
      const summary = await runTestRegistry(fixture, {
        repositoryRoot,
        suiteIds: ['browser'],
        shard: { index, total: 3 },
        durations,
        spawnImpl: (command, args) => {
          executed.push(args.at(-1));
          return completedChild();
        },
        logger: message => messages.push(message),
      });
      assert.equal(summary.shard, `${index}/3`);
    }
    assert.deepEqual([...executed].sort(), [...browserFiles].sort());
    assert.ok(messages.includes('[test-suite] SHARD 1/3 files=1 of selected=7'), messages.join('\n'));
    assert.ok(messages.some(message => /^\[test-suite\] SUMMARY executed=1 registered=9 excluded=0 shard=1\/3$/.test(message)));
  });
});

test('a file that fails once and passes on the single retry is reported as FLAKY', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/flaky.test.mjs');
    writeFixture(repositoryRoot, 'tests/stable.test.mjs');
    const summaryPath = path.join(repositoryRoot, 'summary.md');
    const exitCodes = { 'tests/flaky.test.mjs': [1, 0], 'tests/stable.test.mjs': [0] };
    const messages = [];
    let now = 0;

    const summary = await runTestRegistry(registry([], {
      suites: [{ id: 'browser', files: ['tests/flaky.test.mjs', 'tests/stable.test.mjs'] }],
    }), {
      repositoryRoot,
      suiteIds: ['browser'],
      retryFailedOnce: true,
      summaryPath,
      annotations: true,
      clock: () => (now += 1500),
      spawnImpl: (command, args) => completedChild(exitCodes[args.at(-1)].shift()),
      logger: message => messages.push(message),
    });

    assert.deepEqual(summary.flaky, ['tests/flaky.test.mjs']);
    assert.deepEqual(messages, [
      '[test-suite] START browser tests/flaky.test.mjs',
      '[test-suite] RETRY browser tests/flaky.test.mjs after: tests/flaky.test.mjs exited with code 1',
      '[test-suite] FLAKY browser tests/flaky.test.mjs',
      '::warning title=FLAKY test::tests/flaky.test.mjs failed once (tests/flaky.test.mjs exited with code 1) and passed on the single retry',
      '[test-suite] START browser tests/stable.test.mjs',
      '[test-suite] PASS browser tests/stable.test.mjs',
      '[test-suite] SUMMARY executed=2 registered=2 excluded=0 flaky=1 reported-failures=1',
    ]);
    const markdown = readFileSync(summaryPath, 'utf8');
    assert.match(markdown, /Reported failures: 1 \(FAIL 0 \+ FLAKY 1; a retry-pass counts as a failure in this report but does not fail the job\)\./);
    assert.match(markdown, /\*\*FLAKY\*\* \(failed once, passed on the single retry\): `tests\/flaky\.test\.mjs`/);
    assert.match(markdown, /\| ⚠️ FLAKY \| `tests\/flaky\.test\.mjs` \| 1\.5s \(first attempt: tests\/flaky\.test\.mjs exited with code 1\) \|/);
    assert.match(markdown, /\| ✅ PASS \| `tests\/stable\.test\.mjs` \| 1\.5s \|/);
  });
});

test('a second failure after the retry fails the run and leaves later files unrun', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/broken.test.mjs');
    writeFixture(repositoryRoot, 'tests/later.test.mjs');
    const summaryPath = path.join(repositoryRoot, 'summary.md');
    const exitCodes = [3, 4];
    const messages = [];

    await assert.rejects(
      runTestRegistry(registry([], {
        suites: [{ id: 'browser', files: ['tests/broken.test.mjs', 'tests/later.test.mjs'] }],
      }), {
        repositoryRoot,
        suiteIds: ['browser'],
        retryFailedOnce: true,
        summaryPath,
        spawnImpl: () => completedChild(exitCodes.shift()),
        logger: message => messages.push(message),
      }),
      error => error.exitCode === 4 && error.testFile === 'tests/broken.test.mjs',
    );
    assert.deepEqual(exitCodes, [], 'exactly one retry');
    assert.deepEqual(messages, [
      '[test-suite] START browser tests/broken.test.mjs',
      '[test-suite] RETRY browser tests/broken.test.mjs after: tests/broken.test.mjs exited with code 3',
      '[test-suite] FAIL browser tests/broken.test.mjs',
      '[test-suite] SUMMARY executed=1 registered=2',
    ]);
    const markdown = readFileSync(summaryPath, 'utf8');
    assert.match(markdown, /\| ❌ FAIL \| `tests\/broken\.test\.mjs` \| [0-9.]+s \(tests\/broken\.test\.mjs exited with code 4\) \|/);
    assert.match(markdown, /\| ⏭️ NOT RUN \| `tests\/later\.test\.mjs` \| - \|/);
  });
});

test('a test process that cannot start is not retried', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/missing-runtime.test.mjs');
    let calls = 0;
    await assert.rejects(
      runTestRegistry(registry(['tests/missing-runtime.test.mjs']), {
        repositoryRoot,
        retryFailedOnce: true,
        spawnImpl: () => {
          calls += 1;
          const child = new EventEmitter();
          queueMicrotask(() => child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
          return child;
        },
        logger: () => {},
      }),
      /spawn ENOENT/,
    );
    assert.equal(calls, 1);
  });
});

test('continue-on-failure runs every file and then fails naming each failing file', async () => {
  await withRepository(async repositoryRoot => {
    const files = ['tests/a.test.mjs', 'tests/b.test.mjs', 'tests/c.test.mjs', 'tests/d.test.mjs'];
    for (const file of files) writeFixture(repositoryRoot, file);
    const summaryPath = path.join(repositoryRoot, 'summary.md');
    const exitCodes = { 'tests/a.test.mjs': [2, 5], 'tests/b.test.mjs': [0], 'tests/c.test.mjs': [1, 0], 'tests/d.test.mjs': [6, 7] };
    const messages = [];

    await assert.rejects(
      runTestRegistry(registry([], { suites: [{ id: 'browser', files }] }), {
        repositoryRoot,
        suiteIds: ['browser'],
        retryFailedOnce: true,
        continueOnFailure: true,
        summaryPath,
        spawnImpl: (command, args) => completedChild(exitCodes[args.at(-1)].shift()),
        logger: message => messages.push(message),
      }),
      error => error.exitCode === 5
        && error.message === '2 test files failed: tests/a.test.mjs, tests/d.test.mjs',
    );
    assert.deepEqual(Object.values(exitCodes).flat(), [], 'every file ran, each failure retried once');
    assert.deepEqual(messages.filter(message => /\] (?:PASS|FAIL|FLAKY|SUMMARY)/.test(message)), [
      '[test-suite] FAIL browser tests/a.test.mjs',
      '[test-suite] PASS browser tests/b.test.mjs',
      '[test-suite] FLAKY browser tests/c.test.mjs',
      '[test-suite] FAIL browser tests/d.test.mjs',
      '[test-suite] SUMMARY executed=4 registered=4 failed=2',
    ]);
    const markdown = readFileSync(summaryPath, 'utf8');
    assert.match(markdown, /Executed 4 of 4 selected files; flaky: 1\./);
    assert.equal((markdown.match(/❌ FAIL/g) || []).length, 2);
    assert.doesNotMatch(markdown, /NOT RUN/);
  });
});

test('continue-on-failure still stops when the runner is interrupted', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/interrupted.test.mjs');
    writeFixture(repositoryRoot, 'tests/unreached.test.mjs');
    const signalEmitter = new EventEmitter();
    let calls = 0;
    await assert.rejects(
      runTestRegistry(registry(['tests/interrupted.test.mjs', 'tests/unreached.test.mjs']), {
        repositoryRoot,
        retryFailedOnce: true,
        continueOnFailure: true,
        signalEmitter,
        killImpl: child => queueMicrotask(() => child.emit('close', null, 'SIGTERM')),
        spawnImpl: () => {
          calls += 1;
          queueMicrotask(() => signalEmitter.emit('SIGTERM'));
          return new EventEmitter();
        },
        logger: () => {},
      }),
      error => error.interrupted === true && error.signal === 'SIGTERM',
    );
    assert.equal(calls, 1, 'neither retried nor continued');
  });
});

test('a test process killed by a signal is retried once', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/oom.test.mjs');
    const outcomes = [[null, 'SIGKILL'], [0, null]];
    const messages = [];
    const summary = await runTestRegistry(registry(['tests/oom.test.mjs']), {
      repositoryRoot,
      retryFailedOnce: true,
      spawnImpl: () => completedChild(...outcomes.shift()),
      logger: message => messages.push(message),
    });
    assert.deepEqual(summary.flaky, ['tests/oom.test.mjs']);
    assert.ok(messages.includes('[test-suite] RETRY unit tests/oom.test.mjs after: tests/oom.test.mjs terminated by SIGKILL'));
  });
});

test('an interruption after earlier failures reports the interruption', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/failed.test.mjs');
    writeFixture(repositoryRoot, 'tests/interrupted.test.mjs');
    const signalEmitter = new EventEmitter();
    let calls = 0;
    await assert.rejects(
      runTestRegistry(registry(['tests/failed.test.mjs', 'tests/interrupted.test.mjs']), {
        repositoryRoot,
        continueOnFailure: true,
        signalEmitter,
        killImpl: child => queueMicrotask(() => child.emit('close', null, 'SIGTERM')),
        spawnImpl: () => {
          calls += 1;
          if (calls === 1) return completedChild(3);
          queueMicrotask(() => signalEmitter.emit('SIGTERM'));
          return new EventEmitter();
        },
        logger: () => {},
      }),
      error => error.interrupted === true && error.signal === 'SIGTERM'
        && error.message === 'tests/interrupted.test.mjs interrupted by SIGTERM',
    );
  });
});

test('validates quarantine entries: classified file, issue URL, reason, once each', async t => {
  await withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/flaky.test.mjs');
    writeFixture(repositoryRoot, 'tests/stable.test.mjs');
    const files = ['tests/flaky.test.mjs', 'tests/stable.test.mjs'];
    const entry = {
      file: 'tests/flaky.test.mjs',
      issue: 'https://github.com/Manacost-Labs/HeartPulse/issues/1',
      reason: 'Times out under load.',
    };
    assert.deepEqual(validateTestRegistry(registry(files), { repositoryRoot }).quarantined, []);
    assert.deepEqual(
      validateTestRegistry(registry(files, { quarantine: [entry] }), { repositoryRoot }).quarantined,
      ['tests/flaky.test.mjs'],
    );
    for (const [label, quarantine, message] of [
      ['not an array', {}, /quarantine must be an array/],
      ['unclassified file', [{ ...entry, file: 'tests/missing.test.mjs' }], /quarantined test is not classified: tests\/missing/],
      ['missing issue', [{ ...entry, issue: undefined }], /quarantine issue must be a GitHub issue URL/],
      ['TODO instead of issue', [{ ...entry, issue: 'TODO' }], /quarantine issue must be a GitHub issue URL/],
      ['pull request link', [{ ...entry, issue: 'https://github.com/o/r/pull/2' }], /GitHub issue URL/],
      ['blank reason', [{ ...entry, reason: ' ' }], /quarantine reason is required/],
      ['duplicate entry', [entry, entry], /quarantined more than once: tests\/flaky/],
    ]) {
      t.diagnostic(label);
      assert.throws(() => validateTestRegistry(registry(files, { quarantine }), { repositoryRoot }), message, label);
    }
  });
});

test('quarantine exclude and only split the selected files before sharding', async () => {
  await withRepository(async repositoryRoot => {
    const browserFiles = Array.from({ length: 5 }, (_, index) => `tests/b${index}.test.mjs`);
    for (const file of browserFiles) writeFixture(repositoryRoot, file);
    const quarantine = ['tests/b1.test.mjs', 'tests/b3.test.mjs'].map(file => ({
      file, issue: 'https://github.com/Manacost-Labs/HeartPulse/issues/2', reason: 'flaky',
    }));
    const fixture = registry([], { suites: [{ id: 'browser', files: browserFiles }], quarantine });
    const run = async (mode, shard = null) => {
      const executed = [];
      const messages = [];
      await runTestRegistry(fixture, {
        repositoryRoot,
        suiteIds: ['browser'],
        quarantine: mode,
        shard,
        spawnImpl: (command, args) => {
          executed.push(args.at(-1));
          return completedChild();
        },
        logger: message => messages.push(message),
      });
      return { executed, messages };
    };
    const blocking = [];
    for (let index = 1; index <= 2; index += 1) blocking.push(...(await run('exclude', { index, total: 2 })).executed);
    assert.deepEqual(blocking.sort(), ['tests/b0.test.mjs', 'tests/b2.test.mjs', 'tests/b4.test.mjs']);
    const only = await run('only');
    assert.deepEqual(only.executed, ['tests/b1.test.mjs', 'tests/b3.test.mjs']);
    assert.equal(only.messages[0], '[test-suite] QUARANTINE only files=2 quarantined=2');
    assert.deepEqual((await run(null)).executed, browserFiles);
    await assert.rejects(run('skip'), /unknown quarantine mode: skip/);
  });
});

test('the quarantine run reports retry-passes and failures as failures in its summary', async () => {
  await withRepository(async repositoryRoot => {
    const files = ['tests/flaky.test.mjs', 'tests/broken.test.mjs'];
    for (const file of files) writeFixture(repositoryRoot, file);
    const summaryPath = path.join(repositoryRoot, 'summary.md');
    const exitCodes = { 'tests/flaky.test.mjs': [1, 0], 'tests/broken.test.mjs': [1, 1] };
    await assert.rejects(runTestRegistry(registry([], {
      suites: [{ id: 'browser', files }],
      quarantine: files.map(file => ({ file, issue: 'https://github.com/Manacost-Labs/HeartPulse/issues/3', reason: 'flaky' })),
    }), {
      repositoryRoot,
      suiteIds: ['browser'],
      quarantine: 'only',
      retryFailedOnce: true,
      continueOnFailure: true,
      summaryPath,
      spawnImpl: (command, args) => completedChild(exitCodes[args.at(-1)].shift()),
      logger: () => {},
    }), /exited with code 1/);
    const markdown = readFileSync(summaryPath, 'utf8');
    assert.match(markdown, /^### Test suites: browser · quarantine \(non-blocking\)$/m);
    assert.match(markdown, /Reported failures: 2 \(FAIL 1 \+ FLAKY 1;/);
  });
});

test('parses --only-files as a path and rejects it without one or twice', () => {
  assert.equal(parseRunnerArguments(['--suite', 'unit', '--only-files', 'picked.json']).onlyFilesPath, 'picked.json');
  assert.equal(parseRunnerArguments(['--suite', 'unit']).onlyFilesPath, undefined);
  for (const args of [
    ['--suite', 'unit', '--only-files'],
    ['--suite', 'unit', '--only-files', '--shard', '1/2'],
    ['--suite', 'unit', '--only-files', 'a.json', '--only-files', 'b.json'],
  ]) {
    assert.throws(() => parseRunnerArguments(args), /usage:/, args.join(' '));
  }
});

test('reads --only-files from the selection JSON, a bare suite map, an array or one path per line', () => {
  const expected = ['tests/a.test.ts', 'tests/b.test.mjs'];
  const selection = JSON.stringify({
    mode: 'subset',
    reason: 'x',
    files: { unit: ['tests/a.test.ts'], browser: ['tests/b.test.mjs'], contract: [] },
  });
  assert.deepEqual([...parseOnlyFiles(selection)], expected);
  assert.deepEqual([...parseOnlyFiles(JSON.stringify({ unit: ['tests/a.test.ts'], browser: ['tests/b.test.mjs'] }))], expected);
  assert.deepEqual([...parseOnlyFiles(JSON.stringify(expected))], expected);
  assert.deepEqual([...parseOnlyFiles('tests/a.test.ts\n\n  tests/b.test.mjs  \n')], expected);
  assert.deepEqual([...parseOnlyFiles('')], []);
  assert.deepEqual([...parseOnlyFiles('{"files":{"unit":[]}}')], []);
  assert.throws(() => parseOnlyFiles('{"files": '), /not valid JSON/);
  assert.throws(() => parseOnlyFiles('{"files":{"unit":[1]}}'), /strings/);
});

test('only-files keeps just the listed files of the selected suites, before quarantine and sharding', async () => {
  await withRepository(async repositoryRoot => {
    const unitFiles = ['tests/u0.test.ts', 'tests/u1.test.ts'];
    const browserFiles = Array.from({ length: 6 }, (_, index) => `tests/b${index}.test.mjs`);
    for (const file of [...unitFiles, ...browserFiles]) writeFixture(repositoryRoot, file);
    const fixture = registry([], {
      suites: [{ id: 'unit', files: unitFiles }, { id: 'browser', files: browserFiles }],
      quarantine: ['tests/b1.test.mjs'].map(file => ({
        file, issue: 'https://github.com/Manacost-Labs/HeartPulse/issues/2', reason: 'flaky',
      })),
    });
    const onlyFiles = new Set([
      'tests/u1.test.ts', 'tests/b1.test.mjs', 'tests/b2.test.mjs', 'tests/b4.test.mjs', 'tests/not-registered.test.ts',
    ]);
    const run = async options => {
      const executed = [];
      const messages = [];
      const summary = await runTestRegistry(fixture, {
        repositoryRoot,
        spawnImpl: (command, args) => {
          executed.push(args.at(-1));
          return completedChild();
        },
        logger: message => messages.push(message),
        ...options,
      });
      return { executed, messages, summary };
    };

    const browserOnly = await run({ suiteIds: ['browser'], onlyFiles });
    assert.deepEqual(browserOnly.executed, ['tests/b1.test.mjs', 'tests/b2.test.mjs', 'tests/b4.test.mjs']);
    assert.ok(
      browserOnly.messages.includes('[test-suite] ONLY-FILES selected 3 of 6 files in the suites'),
      browserOnly.messages.join('\n'),
    );

    const blocking = await run({ suiteIds: ['unit', 'browser'], onlyFiles, quarantine: 'exclude' });
    assert.deepEqual(blocking.executed, ['tests/u1.test.ts', 'tests/b2.test.mjs', 'tests/b4.test.mjs']);

    const quarantined = await run({ suiteIds: ['unit', 'browser'], onlyFiles, quarantine: 'only' });
    assert.deepEqual(quarantined.executed, ['tests/b1.test.mjs']);

    const shardsRun = [];
    for (let index = 1; index <= 2; index += 1) {
      shardsRun.push(...(await run({ suiteIds: ['browser'], onlyFiles, shard: { index, total: 2 } })).executed);
    }
    assert.deepEqual(shardsRun.sort(), ['tests/b1.test.mjs', 'tests/b2.test.mjs', 'tests/b4.test.mjs']);

    const everything = await run({ suiteIds: ['browser'] });
    assert.deepEqual(everything.executed, browserFiles);
  });
});

test('only-files with nothing for the suite succeeds without running a test and says so', async () => {
  await withRepository(async repositoryRoot => {
    const files = ['tests/u0.test.ts', 'tests/u1.test.ts'];
    for (const file of files) writeFixture(repositoryRoot, file);
    const summaryPath = path.join(repositoryRoot, 'summary.md');
    const messages = [];
    let spawned = 0;
    const summary = await runTestRegistry(registry(files), {
      repositoryRoot,
      suiteIds: ['unit'],
      onlyFiles: new Set(['tests/elsewhere.test.mjs']),
      summaryPath,
      spawnImpl: () => {
        spawned += 1;
        return completedChild();
      },
      logger: message => messages.push(message),
    });
    assert.equal(spawned, 0);
    assert.equal(summary.executed, 0);
    assert.ok(messages.includes('[test-suite] ONLY-FILES selected 0 files; nothing to run'), messages.join('\n'));
    assert.match(readFileSync(summaryPath, 'utf8'), /Executed 0 of 0 selected files/);
  });
});

test('the runner CLI exits successfully when --only-files selects nothing', () => {
  withRepository(directory => {
    const listPath = path.join(directory, 'none.json');
    writeFileSync(listPath, JSON.stringify({ mode: 'none', reason: 'only documentation changed', files: { unit: [] } }));
    const result = spawnSync(
      process.execPath,
      ['scripts/test-suite-runner.mjs', '--suite', 'unit', '--only-files', listPath],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ONLY-FILES selected 0 files; nothing to run/);
    assert.match(result.stdout, /SUMMARY executed=0 /);
  });
});
