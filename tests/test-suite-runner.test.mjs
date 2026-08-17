import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  discoverTestFiles,
  runTestRegistry,
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
  return {
    version: 1,
    suites: [{
      id: 'unit',
      env: { TIERLIST_TEST_SKIP_HANDLER: '1' },
      files,
    }],
    ...overrides,
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
      /missing from registry: tests\/missing\.test\.tsx/,
    );
  });
});

test('rejects authored tests outside the tests directory with an actionable error', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/listed.test.ts');
    writeFixture(repositoryRoot, 'src/module/misplaced.test.ts');

    assert.throws(
      () => validateTestRegistry(registry(['tests/listed.test.ts']), { repositoryRoot }),
      /test files must live under tests\/: src\/module\/misplaced\.test\.ts/,
    );
  });
});

test('rejects duplicate registrations across suites', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/duplicate.test.ts');

    assert.throws(
      () => validateTestRegistry({
        version: 1,
        suites: [
          { id: 'first', env: {}, files: ['tests/duplicate.test.ts'] },
          { id: 'second', env: {}, files: ['tests/duplicate.test.ts'] },
        ],
      }, { repositoryRoot }),
      /registered more than once: tests\/duplicate\.test\.ts/,
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
      /registered test does not exist: tests\/nonexistent\.test\.mjs/,
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
      assert.throws(
        () => validateTestRegistry(registry([], {
          suites: [{ id: 'unit', env: { 'BAD-NAME': '1' }, files: [] }],
        }), { repositoryRoot }),
        /invalid environment variable name: BAD-NAME/,
      );
    });
  });

  await t.test('non-string value', () => {
    withRepository(repositoryRoot => {
      assert.throws(
        () => validateTestRegistry(registry([], {
          suites: [{ id: 'unit', env: { RETRIES: 2 }, files: [] }],
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
    assert.deepEqual(summary, { executed: 2, registered: 2 });
    assert.deepEqual(messages, [
      '[test-suite] START unit tests/first.test.ts',
      '[test-suite] PASS unit tests/first.test.ts',
      '[test-suite] START unit tests/second.test.mjs',
      '[test-suite] PASS unit tests/second.test.mjs',
      '[test-suite] SUMMARY executed=2 registered=2',
    ]);
  });
});

test('applies environment only to the suite that declares it', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/tierlist.test.ts');
    writeFixture(repositoryRoot, 'tests/regular.test.ts');
    const calls = [];

    await runTestRegistry({
      version: 1,
      suites: [
        { id: 'tierlist', env: { TIERLIST_TEST_SKIP_HANDLER: '1' }, files: ['tests/tierlist.test.ts'] },
        { id: 'regular', env: {}, files: ['tests/regular.test.ts'] },
      ],
    }, {
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
