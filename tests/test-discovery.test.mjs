import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
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

const SUITE_IDS = [
  'unit',
  'integration',
  'contract',
  'browser',
  'production-smoke',
];

function withRepository(run) {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'hearthpulse-test-discovery-'));
  const cleanup = () => rmSync(repositoryRoot, { recursive: true, force: true });
  try {
    const result = run(repositoryRoot);
    if (result && typeof result.then === 'function') return result.finally(cleanup);
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function writeFixture(repositoryRoot, relativePath, contents = '') {
  const absolutePath = path.join(repositoryRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function registry(classifiedFiles, overrides = {}) {
  return {
    version: 1,
    exclusions: [],
    fileEnvironment: {},
    suites: SUITE_IDS.map(id => ({
      id,
      files: classifiedFiles[id] ?? [],
    })),
    ...overrides,
  };
}

function completedChild(exitCode = 0, signal = null) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('close', exitCode, signal));
  return child;
}

test('discovers supported tests repository-wide and ignores generated trees', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/model.test.ts');
    writeFixture(repositoryRoot, 'src/modules/cards/view.spec.tsx');
    writeFixture(repositoryRoot, 'server/modules/auth/routes.test.mjs');
    writeFixture(repositoryRoot, 'server/jobs/refresh.spec.cjs');
    writeFixture(repositoryRoot, 'tests/browser.test.js');
    writeFixture(repositoryRoot, 'tests/backup.test.sh');
    writeFixture(repositoryRoot, 'tests/helper.ts');
    writeFixture(repositoryRoot, 'node_modules/pkg/vendor.test.ts');
    writeFixture(repositoryRoot, 'build/generated.test.mjs');
    writeFixture(repositoryRoot, 'dist/assets/generated.spec.mjs');
    writeFixture(repositoryRoot, '.codegraph/index.test.mjs');

    assert.deepEqual(discoverTestFiles(repositoryRoot), [
      'server/jobs/refresh.spec.cjs',
      'server/modules/auth/routes.test.mjs',
      'src/modules/cards/view.spec.tsx',
      'tests/backup.test.sh',
      'tests/browser.test.js',
      'tests/model.test.ts',
    ]);
  });
});

test('requires every discovered test to have exactly one supported category', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/unit.test.ts');
    writeFixture(repositoryRoot, 'tests/route.test.ts');

    assert.throws(
      () => validateTestRegistry(registry({ unit: ['tests/unit.test.ts'] }), { repositoryRoot }),
      /unclassified test files: tests\/route\.test\.ts/,
    );

    assert.throws(
      () => validateTestRegistry(registry({
        unit: ['tests/unit.test.ts', 'tests/route.test.ts'],
        integration: ['tests/route.test.ts'],
      }), { repositoryRoot }),
      /classified more than once: tests\/route\.test\.ts/,
    );
  });
});

test('rejects stale classifications and exclusions without a reason', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/current.test.ts');

    assert.throws(
      () => validateTestRegistry(registry({
        unit: ['tests/current.test.ts', 'tests/removed.test.ts'],
      }), { repositoryRoot }),
      /classified test does not exist: tests\/removed\.test\.ts/,
    );

    assert.throws(
      () => validateTestRegistry(registry({}, {
        exclusions: [{ file: 'tests/current.test.ts', reason: '' }],
      }), { repositoryRoot }),
      /exclusion reason is required: tests\/current\.test\.ts/,
    );
  });
});

test('accepts a justified central exclusion and reports category totals', () => {
  withRepository(repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/unit.test.ts');
    writeFixture(repositoryRoot, 'tests/manual.test.mjs');

    const result = validateTestRegistry(registry({ unit: ['tests/unit.test.ts'] }, {
      exclusions: [{
        file: 'tests/manual.test.mjs',
        reason: 'Requires an external certification device unavailable in CI.',
      }],
    }), { repositoryRoot });

    assert.deepEqual(result.counts, {
      unit: 1,
      integration: 0,
      contract: 0,
      browser: 0,
      'production-smoke': 0,
    });
    assert.equal(result.excluded, 1);
    assert.equal(result.discovered, 2);
  });
});

test('runs TypeScript, JavaScript, and shell tests sequentially with isolated file environment', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/unit.test.ts');
    writeFixture(repositoryRoot, 'tests/contract.test.mjs');
    writeFixture(repositoryRoot, 'tests/smoke.test.sh');
    const calls = [];
    let childRunning = false;

    const result = await runTestRegistry(registry({
      unit: ['tests/unit.test.ts'],
      contract: ['tests/contract.test.mjs'],
      'production-smoke': ['tests/smoke.test.sh'],
    }, {
      fileEnvironment: {
        'tests/unit.test.ts': { TIERLIST_TEST_SKIP_HANDLER: '1' },
      },
    }), {
      repositoryRoot,
      parentEnv: { INHERITED: 'yes' },
      spawnImpl: (command, args, options) => {
        assert.equal(childRunning, false);
        childRunning = true;
        calls.push({ command, args, options });
        const child = completedChild();
        child.once('close', () => { childRunning = false; });
        return child;
      },
      logger: () => {},
    });

    assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
      [process.execPath, ['--import', 'tsx', 'tests/unit.test.ts']],
      [process.execPath, ['tests/contract.test.mjs']],
      ['bash', ['tests/smoke.test.sh']],
    ]);
    assert.equal(calls[0].options.env.TIERLIST_TEST_SKIP_HANDLER, '1');
    assert.equal(calls[1].options.env.TIERLIST_TEST_SKIP_HANDLER, undefined);
    assert.equal(calls[2].options.env.INHERITED, 'yes');
    assert.equal(calls.every(call => call.options.shell === false), true);
    assert.deepEqual(result, { executed: 3, registered: 3, excluded: 0 });
  });
});

test('stops at the first failing test and preserves its exit code', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/failing.test.ts');
    writeFixture(repositoryRoot, 'tests/not-run.test.ts');
    let calls = 0;

    await assert.rejects(
      runTestRegistry(registry({
        unit: ['tests/failing.test.ts', 'tests/not-run.test.ts'],
      }), {
        repositoryRoot,
        spawnImpl: () => {
          calls += 1;
          return completedChild(17);
        },
        logger: () => {},
      }),
      error => error.exitCode === 17 && error.testFile === 'tests/failing.test.ts',
    );
    assert.equal(calls, 1);
  });
});

test('forwards termination to the child process group', async () => {
  await withRepository(async repositoryRoot => {
    writeFixture(repositoryRoot, 'tests/slow.test.mjs');
    const signalEmitter = new EventEmitter();
    const child = new EventEmitter();
    child.pid = 321;
    const signals = [];

    const run = runTestRegistry(registry({ unit: ['tests/slow.test.mjs'] }), {
      repositoryRoot,
      spawnImpl: () => {
        queueMicrotask(() => signalEmitter.emit('SIGTERM'));
        return child;
      },
      killImpl: (_child, signal) => {
        signals.push(signal);
        queueMicrotask(() => child.emit('close', null, signal));
      },
      signalEmitter,
      logger: () => {},
    });

    await assert.rejects(run, error => error.signal === 'SIGTERM');
    assert.deepEqual(signals, ['SIGTERM']);
  });
});
