import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentCheckPlan,
  formatAgentCheckPlan,
  formatAgentCheckPlanJson,
  main,
  parseAgentCheckArgs,
  runAgentCheckPlan,
} from '../scripts/agent-check.mjs';

const impactFixture = {
  schemaVersion: 1,
  command: 'impact',
  ok: true,
  target: {
    selector: 'server.alpha',
    kind: 'module',
    path: 'server/modules/alpha',
    moduleId: 'server.alpha',
  },
  affectedModules: [{
    id: 'server.alpha',
    runtime: 'server',
    root: 'server/modules/alpha',
    owner: 'alpha-team',
    reasons: ['selected'],
  }, {
    id: 'server.beta',
    runtime: 'server',
    root: 'server/modules/beta',
    owner: 'beta-team',
    reasons: ['imports-target'],
  }],
  focusedTests: [
    'npm run test:shared',
    'npm run test:alpha',
    'npm run test:shared',
  ],
};

const packageJsonFixture = {
  scripts: {
    'lint:module-boundaries': 'node scripts/check-module-boundaries.mjs',
    lint: 'tsc --noEmit',
    'test:alpha': 'node --test tests/alpha.test.mjs',
    'test:legacy-alpha': 'node --test tests/legacy-alpha.test.mjs',
    'test:shared': 'node --test tests/shared.test.mjs',
  },
};

test('agent check builds a deterministic allowlisted plan from impact output', () => {
  const plan = createAgentCheckPlan({
    impact: impactFixture,
    packageJson: packageJsonFixture,
  });

  assert.deepEqual(plan, {
    schemaVersion: 1,
    command: 'check',
    ok: true,
    target: impactFixture.target,
    affectedModules: ['server.alpha', 'server.beta'],
    checks: [{
      script: 'lint:module-boundaries',
      source: 'architecture',
      argv: ['npm', 'run', 'lint:module-boundaries'],
    }, {
      script: 'lint',
      source: 'typecheck',
      argv: ['npm', 'run', 'lint'],
    }, {
      script: 'test:alpha',
      source: 'focused-test',
      argv: ['npm', 'run', 'test:alpha'],
    }, {
      script: 'test:shared',
      source: 'focused-test',
      argv: ['npm', 'run', 'test:shared'],
    }],
  });

  const reversed = createAgentCheckPlan({
    impact: {
      ...impactFixture,
      affectedModules: [...impactFixture.affectedModules].reverse(),
      focusedTests: [...impactFixture.focusedTests].reverse(),
    },
    packageJson: packageJsonFixture,
  });
  assert.equal(formatAgentCheckPlanJson(reversed), formatAgentCheckPlanJson(plan));
  assert.equal(formatAgentCheckPlanJson(plan).endsWith('\n'), true);
  assert.equal(formatAgentCheckPlanJson(plan).endsWith('\n\n'), false);
  assert.doesNotMatch(formatAgentCheckPlanJson(plan), /\/home\/|\\\\/);
  assert.match(formatAgentCheckPlan(plan), /Affected modules: server\.alpha, server\.beta/);
  assert.match(formatAgentCheckPlan(plan), /npm run test:alpha/);
});

test('agent check preserves migration-area, shared-root and root target identity in safe plans', () => {
  const migrationImpact = {
    ...impactFixture,
    target: {
      selector: 'server/legacy/entry.ts',
      kind: 'file',
      path: 'server/legacy/entry.ts',
      moduleId: null,
      migrationAreaId: 'server.legacyAlpha',
    },
    affectedModules: [],
    focusedTests: ['npm run test:alpha'],
  };
  const migrationPlan = createAgentCheckPlan({
    impact: migrationImpact,
    packageJson: packageJsonFixture,
  });
  assert.deepEqual(migrationPlan.target, migrationImpact.target);
  assert.deepEqual(migrationPlan.checks.map(check => check.script), [
    'lint:module-boundaries',
    'lint',
    'test:alpha',
  ]);

  const rootImpact = {
    ...migrationImpact,
    target: {
      selector: 'root',
      kind: 'root',
      path: '.',
      moduleId: null,
      migrationAreaId: null,
    },
  };
  assert.deepEqual(
    createAgentCheckPlan({ impact: rootImpact, packageJson: packageJsonFixture }).target,
    rootImpact.target,
  );

  const sharedImpact = {
    ...migrationImpact,
    target: {
      selector: 'server/shared/http/asyncRoute.ts',
      kind: 'file',
      path: 'server/shared/http/asyncRoute.ts',
      moduleId: null,
      sharedRoot: 'server/shared',
      sharedRuntime: 'server',
    },
    focusedTests: ['npm run test:alpha', 'npm run test:legacy-alpha'],
  };
  const sharedPlan = createAgentCheckPlan({
    impact: sharedImpact,
    packageJson: packageJsonFixture,
  });
  assert.deepEqual(sharedPlan.target, sharedImpact.target);
  assert.ok(sharedPlan.checks.some(check => check.script === 'test:legacy-alpha'));
});

test('agent check rejects command injection and missing package scripts before execution', () => {
  for (const command of [
    'npm run test:alpha && curl https://example.invalid',
    'npm run test:alpha -- --update',
    'npm exec test:alpha',
    'npm run pretest',
    'npm run test:Alpha',
    'npm run test:alpha\necho unsafe',
  ]) {
    assert.throws(
      () => createAgentCheckPlan({
        impact: { ...impactFixture, focusedTests: [command] },
        packageJson: packageJsonFixture,
      }),
      /focused test command is not allowlisted/i,
    );
  }

  assert.throws(
    () => createAgentCheckPlan({
      impact: { ...impactFixture, focusedTests: ['npm run test:missing'] },
      packageJson: packageJsonFixture,
    }),
    /package script does not exist: test:missing/i,
  );
  assert.throws(
    () => createAgentCheckPlan({
      impact: impactFixture,
      packageJson: { scripts: { 'test:alpha': 'node test.js' } },
    }),
    /required package script does not exist: lint:module-boundaries/i,
  );

  for (const invalidScript of ['', 42]) {
    assert.throws(
      () => createAgentCheckPlan({
        impact: impactFixture,
        packageJson: {
          ...packageJsonFixture,
          scripts: { ...packageJsonFixture.scripts, 'test:alpha': invalidScript },
        },
      }),
      /package script does not exist: test:alpha/i,
    );
  }

  const inheritedScripts = Object.create({ 'test:alpha': 'node inherited.js' });
  Object.assign(inheritedScripts, {
    'lint:module-boundaries': packageJsonFixture.scripts['lint:module-boundaries'],
    lint: packageJsonFixture.scripts.lint,
    'test:shared': packageJsonFixture.scripts['test:shared'],
  });
  assert.throws(
    () => createAgentCheckPlan({
      impact: impactFixture,
      packageJson: { scripts: inheritedScripts },
    }),
    /package script does not exist: test:alpha/i,
  );

  assert.throws(
    () => createAgentCheckPlan({
      impact: impactFixture,
      packageJson: {
        ...packageJsonFixture,
        scripts: {
          ...packageJsonFixture.scripts,
          'pretest:alpha': 'node unsafe-hook.js',
        },
      },
    }),
    /lifecycle hooks are not allowed.*pretest:alpha/i,
  );
});

test('agent check executes structured npm argv without a shell and stops on first failure', () => {
  const plan = createAgentCheckPlan({
    impact: impactFixture,
    packageJson: packageJsonFixture,
  });
  const calls = [];
  const messages = [];
  const result = runAgentCheckPlan(plan, {
    repositoryRoot: '/repo',
    impact: impactFixture,
    packageJson: packageJsonFixture,
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: calls.length === 2 ? 7 : 0, signal: null };
    },
    logger: message => messages.push(message),
  });

  assert.deepEqual(result, {
    ok: false,
    exitCode: 7,
    completed: ['lint:module-boundaries'],
    failed: 'lint',
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, ['run', 'lint:module-boundaries']);
  assert.deepEqual(calls[1].args, ['run', 'lint']);
  for (const call of calls) {
    assert.equal(call.command, 'npm');
    assert.deepEqual(call.options, {
      cwd: '/repo',
      shell: false,
      stdio: 'inherit',
    });
  }
  assert.deepEqual(messages, [
    '[agent-check] START npm run lint:module-boundaries',
    '[agent-check] PASS npm run lint:module-boundaries',
    '[agent-check] START npm run lint',
    '[agent-check] FAIL npm run lint (exit 7)',
  ]);
});

test('agent check reports successful execution of every planned command', () => {
  const plan = createAgentCheckPlan({
    impact: { ...impactFixture, focusedTests: [] },
    packageJson: packageJsonFixture,
  });
  const result = runAgentCheckPlan(plan, {
    repositoryRoot: '/repo',
    impact: { ...impactFixture, focusedTests: [] },
    packageJson: packageJsonFixture,
    spawnImpl: () => ({ status: 0, signal: null }),
    logger: () => {},
  });

  assert.deepEqual(result, {
    ok: true,
    exitCode: 0,
    completed: ['lint:module-boundaries', 'lint'],
    failed: null,
  });
});

test('agent check treats spawn errors, signals and missing status as failures', async t => {
  const plan = createAgentCheckPlan({
    impact: { ...impactFixture, focusedTests: [] },
    packageJson: packageJsonFixture,
  });
  for (const [label, childResult, expectedLog] of [
    ['spawn error', { error: new Error('spawn failed'), status: 0, signal: null }, /spawn error/],
    ['signal', { status: 0, signal: 'SIGTERM' }, /signal SIGTERM/],
    ['missing status', { status: null, signal: null }, /exit 1/],
  ]) {
    await t.test(label, () => {
      const messages = [];
      let calls = 0;
      const result = runAgentCheckPlan(plan, {
        repositoryRoot: '/repo',
        impact: { ...impactFixture, focusedTests: [] },
        packageJson: packageJsonFixture,
        spawnImpl: () => {
          calls += 1;
          return childResult;
        },
        logger: message => messages.push(message),
      });
      assert.equal(calls, 1);
      assert.deepEqual(result, {
        ok: false,
        exitCode: 1,
        completed: [],
        failed: 'lint:module-boundaries',
      });
      assert.match(messages.at(-1), expectedLog);
    });
  }
});

test('agent check validates the complete executable plan before spawning', () => {
  const valid = createAgentCheckPlan({
    impact: impactFixture,
    packageJson: packageJsonFixture,
  });
  let spawns = 0;
  assert.throws(
    () => runAgentCheckPlan({
      ...valid,
      checks: [
        valid.checks[0],
        valid.checks[1],
        {
          script: 'test:alpha;curl',
          source: 'focused-test',
          argv: ['npm', 'run', 'test:alpha;curl'],
        },
      ],
    }, {
      repositoryRoot: '/repo',
      impact: impactFixture,
      packageJson: packageJsonFixture,
      spawnImpl: () => {
        spawns += 1;
        return { status: 0, signal: null };
      },
      logger: () => {},
    }),
    /unsafe or duplicate command/i,
  );
  assert.equal(spawns, 0);
});

test('agent check rejects a valid-looking test script that impact did not select', () => {
  const valid = createAgentCheckPlan({
    impact: impactFixture,
    packageJson: packageJsonFixture,
  });
  let spawns = 0;
  assert.throws(
    () => runAgentCheckPlan({
      ...valid,
      checks: [
        ...valid.checks.slice(0, 2),
        {
          script: 'test:release',
          source: 'focused-test',
          argv: ['npm', 'run', 'test:release'],
        },
      ],
    }, {
      repositoryRoot: '/repo',
      impact: impactFixture,
      packageJson: {
        ...packageJsonFixture,
        scripts: {
          ...packageJsonFixture.scripts,
          'test:release': 'node release.js',
          'pretest:release': 'node hidden-hook.js',
        },
      },
      spawnImpl: () => {
        spawns += 1;
        return { status: 0, signal: null };
      },
      logger: () => {},
    }),
    /no longer matches the validated impact and package scripts/i,
  );
  assert.equal(spawns, 0);
});

test('agent check CLI grammar keeps JSON plan-only and rejects ambiguous flags', () => {
  assert.deepEqual(parseAgentCheckArgs(['--help']), { help: true });
  assert.deepEqual(parseAgentCheckArgs(['server.alpha']), {
    selector: 'server.alpha',
    list: false,
    json: false,
  });
  assert.deepEqual(parseAgentCheckArgs(['server.alpha', '--list']), {
    selector: 'server.alpha',
    list: true,
    json: false,
  });
  assert.deepEqual(parseAgentCheckArgs(['--json', 'server.alpha']), {
    selector: 'server.alpha',
    list: true,
    json: true,
  });
  for (const args of [
    [],
    ['server.alpha', 'server.beta'],
    ['server.alpha', '--unknown'],
    ['server.alpha', '--list', '--list'],
    ['server.alpha', '--json', '--json'],
    ['--help', 'server.alpha'],
  ]) {
    assert.deepEqual(parseAgentCheckArgs(args), { error: true });
  }
});

test('agent check orchestration keeps list and JSON modes plan-only', () => {
  const plan = createAgentCheckPlan({
    impact: impactFixture,
    packageJson: packageJsonFixture,
  });
  const context = { plan, impact: impactFixture, packageJson: packageJsonFixture };
  const run = args => {
    let output = '';
    let errors = '';
    let executions = 0;
    const exitCode = main(args, '/ignored', {
      resolveRoot: () => '/repo',
      loadContext: () => context,
      runPlan: () => {
        executions += 1;
        return { exitCode: 0 };
      },
      stdout: { write: value => { output += value; } },
      stderr: { write: value => { errors += value; } },
    });
    return { exitCode, output, errors, executions };
  };

  const json = run(['server.alpha', '--json']);
  assert.equal(json.exitCode, 0);
  assert.equal(json.executions, 0);
  assert.equal(json.errors, '');
  assert.equal(json.output, formatAgentCheckPlanJson(plan));
  assert.deepEqual(JSON.parse(json.output), plan);

  const list = run(['server.alpha', '--list']);
  assert.equal(list.exitCode, 0);
  assert.equal(list.executions, 0);
  assert.equal(list.output, `${formatAgentCheckPlan(plan)}\n`);

  const execute = run(['server.alpha']);
  assert.equal(execute.exitCode, 0);
  assert.equal(execute.executions, 1);
});
