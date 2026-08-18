#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAgentImpact } from './agent-impact.mjs';
import {
  AGENT_CHECK_BASE_SCRIPTS,
  FOCUSED_TEST_SCRIPT_PATTERN,
  focusedTestScriptId,
  packageScriptExists,
  packageScriptLifecycleHooks,
} from './lib/npm-script-policy.mjs';
import {
  repositoryRoot,
  resolveRepositoryFile,
  singleLineErrorMessage,
} from './lib/module-inventory.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readPackageJson(root) {
  const packageFile = resolveRepositoryFile(root, 'package.json', { required: true });
  try {
    const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'));
    if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
      throw new Error('package.json must contain an object.');
    }
    return packageJson;
  } catch (error) {
    throw new Error(
      `package.json is not valid JSON: ${singleLineErrorMessage(error)}`,
    );
  }
}

function assertImpact(impact) {
  if (!impact || typeof impact !== 'object'
    || impact.schemaVersion !== 1
    || impact.command !== 'impact'
    || impact.ok !== true
    || !impact.target || typeof impact.target !== 'object'
    || !Array.isArray(impact.affectedModules)
    || !Array.isArray(impact.focusedTests)) {
    throw new Error('Agent check requires valid schemaVersion 1 impact output.');
  }
}

function checkEntry(script, source) {
  return {
    script,
    source,
    argv: ['npm', 'run', script],
  };
}

function assertNoLifecycleHooks(packageJson, script) {
  const hooks = packageScriptLifecycleHooks(packageJson, script);
  if (hooks.length > 0) {
    throw new Error(`Package script lifecycle hooks are not allowed for agent check: ${hooks.join(', ')}`);
  }
}

export function createAgentCheckPlan({ impact, packageJson }) {
  assertImpact(impact);
  for (const { script } of AGENT_CHECK_BASE_SCRIPTS) {
    if (!packageScriptExists(packageJson, script)) {
      throw new Error(`Required package script does not exist: ${script}`);
    }
    assertNoLifecycleHooks(packageJson, script);
  }

  const focusedScripts = [];
  for (const command of impact.focusedTests) {
    const script = focusedTestScriptId(command);
    if (!script) throw new Error(`Focused test command is not allowlisted: ${String(command)}`);
    if (!packageScriptExists(packageJson, script)) {
      throw new Error(`Package script does not exist: ${script}`);
    }
    assertNoLifecycleHooks(packageJson, script);
    focusedScripts.push(script);
  }
  const affectedModules = [...new Set(impact.affectedModules.map(module => module.id))]
    .sort(compareText);
  if (affectedModules.some(moduleId => typeof moduleId !== 'string' || !moduleId)) {
    throw new Error('Agent check impact contains an invalid affected module id.');
  }
  const checks = [
    ...AGENT_CHECK_BASE_SCRIPTS.map(({ script, source }) => checkEntry(script, source)),
    ...[...new Set(focusedScripts)].sort(compareText)
      .map(script => checkEntry(script, 'focused-test')),
  ];

  return {
    schemaVersion: 1,
    command: 'check',
    ok: true,
    target: {
      selector: impact.target.selector,
      kind: impact.target.kind,
      path: impact.target.path,
      moduleId: impact.target.moduleId,
      ...(Object.hasOwn(impact.target, 'migrationAreaId')
        ? { migrationAreaId: impact.target.migrationAreaId }
        : {}),
      ...(impact.target.sharedRoot
        ? {
            sharedRoot: impact.target.sharedRoot,
            sharedRuntime: impact.target.sharedRuntime,
          }
        : {}),
    },
    affectedModules,
    checks,
  };
}

function assertRunnablePlan(plan) {
  if (!plan || typeof plan !== 'object'
    || plan.schemaVersion !== 1
    || plan.command !== 'check'
    || plan.ok !== true
    || !Array.isArray(plan.checks)) {
    throw new Error('Agent check plan is invalid.');
  }
  const allowedBase = new Set(AGENT_CHECK_BASE_SCRIPTS.map(entry => entry.script));
  const seen = new Set();
  for (const [index, check] of plan.checks.entries()) {
    const expectedBase = AGENT_CHECK_BASE_SCRIPTS[index];
    const validScript = typeof check?.script === 'string'
      && (allowedBase.has(check.script) || FOCUSED_TEST_SCRIPT_PATTERN.test(check.script));
    const validArgv = Array.isArray(check?.argv)
      && check.argv.length === 3
      && check.argv[0] === 'npm'
      && check.argv[1] === 'run'
      && check.argv[2] === check.script;
    const validSource = expectedBase
      ? check.script === expectedBase.script && check.source === expectedBase.source
      : check.source === 'focused-test' && !allowedBase.has(check.script);
    if (!validScript || !validArgv || !validSource || seen.has(check.script)) {
      throw new Error('Agent check plan contains an unsafe or duplicate command.');
    }
    seen.add(check.script);
  }
  if (plan.checks.length < AGENT_CHECK_BASE_SCRIPTS.length) {
    throw new Error('Agent check plan is missing required base commands.');
  }
}

export function runAgentCheckPlan(plan, {
  repositoryRoot: root,
  impact,
  packageJson,
  spawnImpl = spawnSync,
  logger = message => console.log(message),
}) {
  assertRunnablePlan(plan);
  const expectedPlan = createAgentCheckPlan({ impact, packageJson });
  if (formatAgentCheckPlanJson(plan) !== formatAgentCheckPlanJson(expectedPlan)) {
    throw new Error('Agent check plan no longer matches the validated impact and package scripts.');
  }
  const completed = [];
  for (const check of plan.checks) {
    logger(`[agent-check] START npm run ${check.script}`);
    const result = spawnImpl('npm', ['run', check.script], {
      cwd: root,
      shell: false,
      stdio: 'inherit',
    });
    const validStatus = Number.isInteger(result?.status)
      && result.status >= 0
      && result.status <= 255;
    const exitCode = result?.error || result?.signal || !validStatus
      ? 1
      : result.status;
    if (exitCode !== 0) {
      const suffix = result?.signal
        ? `signal ${result.signal}`
        : result?.error ? 'spawn error' : `exit ${exitCode}`;
      logger(`[agent-check] FAIL npm run ${check.script} (${suffix})`);
      return {
        ok: false,
        exitCode,
        completed,
        failed: check.script,
      };
    }
    completed.push(check.script);
    logger(`[agent-check] PASS npm run ${check.script}`);
  }
  return {
    ok: true,
    exitCode: 0,
    completed,
    failed: null,
  };
}

export function loadAgentCheckContext({ repositoryRoot: root, selector }) {
  const resolvedRoot = realpathSync(path.resolve(root));
  const impact = loadAgentImpact({ repositoryRoot: resolvedRoot, selector });
  const packageJson = readPackageJson(resolvedRoot);
  return {
    impact,
    packageJson,
    plan: createAgentCheckPlan({ impact, packageJson }),
  };
}

export function loadAgentCheckPlan(options) {
  return loadAgentCheckContext(options).plan;
}

export function formatAgentCheckPlan(plan) {
  return [
    `Check target: ${plan.target.path}`,
    `Owning module: ${plan.target.moduleId ?? '(none)'}`,
    `Migration area: ${plan.target.migrationAreaId ?? '(none)'}`,
    `Shared root: ${plan.target.sharedRoot ?? '(none)'}`,
    `Affected modules: ${plan.affectedModules.length > 0 ? plan.affectedModules.join(', ') : '(none)'}`,
    'Checks:',
    ...plan.checks.map(check => `  - ${check.argv.join(' ')} [${check.source}]`),
  ].join('\n');
}

export function formatAgentCheckPlanJson(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function parseAgentCheckArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    if (args.length !== 1) return { error: true };
    return { help: true };
  }
  const knownFlags = new Set(['--list', '--json']);
  const flags = args.filter(argument => argument.startsWith('-'));
  const selectors = args.filter(argument => !argument.startsWith('-'));
  if (selectors.length !== 1
    || flags.some(flag => !knownFlags.has(flag))
    || flags.some((flag, index) => flags.indexOf(flag) !== index)) {
    return { error: true };
  }
  const json = flags.includes('--json');
  return {
    selector: selectors[0],
    list: json || flags.includes('--list'),
    json,
  };
}

export function main(
  args = process.argv.slice(2),
  cwd = process.cwd(),
  {
    resolveRoot = repositoryRoot,
    loadContext = loadAgentCheckContext,
    runPlan = runAgentCheckPlan,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const parsed = parseAgentCheckArgs(args);
  const usage = 'Usage: node scripts/agent-check.mjs <module-id-or-path-or-root> [--list] [--json]\n';
  if (parsed.error) {
    stderr.write(usage);
    return 2;
  }
  if (parsed.help) {
    stdout.write(usage);
    return 0;
  }
  const root = resolveRoot(cwd);
  const context = loadContext({ repositoryRoot: root, selector: parsed.selector });
  const { plan } = context;
  if (parsed.json) {
    stdout.write(formatAgentCheckPlanJson(plan));
    return 0;
  }
  stdout.write(`${formatAgentCheckPlan(plan)}\n`);
  if (parsed.list) return 0;
  return runPlan(plan, {
    repositoryRoot: root,
    impact: context.impact,
    packageJson: context.packageJson,
  }).exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[agent-check] ${singleLineErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
