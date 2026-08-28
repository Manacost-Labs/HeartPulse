import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  SOURCE_DEBT_METRICS,
  validateCleanCodeBaseline,
  validateFunctionSizeRegistry,
  validateSourceDebtRegistry,
} from './core.mjs';

function ordered(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => (
    left.localeCompare(right, 'en')
  )));
}

function finding(id, rule, file, actual, maximum, message) {
  return { id, rule, file, actual, maximum, message };
}

function conflict(oldPath, newPath, registry) {
  return finding(
    `rename-conflict:${registry}:${oldPath}->${newPath}`,
    'rename-conflict',
    newPath,
    1,
    0,
    `${registry} already contains a budget for rename destination ${newPath}`,
  );
}

function migrateBudget({ budgets, oldKey, newKey, actual, defaultMaximum, rule, violations }) {
  if (!(oldKey in budgets)) return;
  if (newKey in budgets) {
    violations.push(conflict(oldKey, newKey, rule));
    return;
  }
  const maximum = budgets[oldKey];
  delete budgets[oldKey];
  if (actual > maximum) {
    violations.push(finding(
      `${rule}:${newKey}`,
      rule,
      newKey,
      actual,
      maximum,
      `${rule} debt grew during rename of ${oldKey} to ${newKey}`,
    ));
    return;
  }
  if (actual > defaultMaximum) budgets[newKey] = actual;
}

function rewriteExceptionId(id, oldPath, newPath) {
  if (id === `file-lines:${oldPath}`) return `file-lines:${newPath}`;
  if (id.startsWith(`parse:${oldPath}:`)) return `parse:${newPath}:${id.slice(`parse:${oldPath}:`.length)}`;
  if (id.startsWith('source-debt:') && id.endsWith(`:${oldPath}`)) {
    return `${id.slice(0, -oldPath.length)}${newPath}`;
  }
  if (id.startsWith(`function-lines:${oldPath}#`)) {
    return `function-lines:${newPath}#${id.slice(`function-lines:${oldPath}#`.length)}`;
  }
  return id;
}

function migrateExceptions(exceptions, renames, violations) {
  const migrated = exceptions.map(exception => {
    let id = exception.id;
    for (const { oldPath, newPath } of renames) id = rewriteExceptionId(id, oldPath, newPath);
    return { ...exception, id };
  }).sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const seen = new Set();
  for (const exception of migrated) {
    if (seen.has(exception.id)) {
      violations.push(conflict(exception.id, exception.id, 'exception-id'));
    }
    seen.add(exception.id);
  }
  return migrated;
}

function confirmedRenames(mappings, snapshot, violations) {
  const currentFiles = new Set(snapshot.files.map(entry => entry.file));
  const renames = mappings
    .filter(entry => entry.file !== entry.baselineFile && currentFiles.has(entry.file))
    .map(entry => ({ oldPath: entry.baselineFile, newPath: entry.file }))
    .sort((left, right) => (
      left.oldPath.localeCompare(right.oldPath, 'en')
      || left.newPath.localeCompare(right.newPath, 'en')
    ));
  const oldPaths = new Set();
  const newPaths = new Set();
  for (const rename of renames) {
    if (oldPaths.has(rename.oldPath) || newPaths.has(rename.newPath)) {
      violations.push(conflict(rename.oldPath, rename.newPath, 'rename-map'));
    }
    oldPaths.add(rename.oldPath);
    newPaths.add(rename.newPath);
  }
  return renames;
}

export function createBudgetMigration(input) {
  const baseline = structuredClone(validateCleanCodeBaseline(input.baseline, input.today));
  validateSourceDebtRegistry(input.sourceDebtRegistry);
  validateFunctionSizeRegistry(input.functionSizeRegistry);
  const sourceDebtRegistry = structuredClone(input.sourceDebtRegistry);
  const functionSizeRegistry = structuredClone(input.functionSizeRegistry);
  const violations = [];
  const renames = confirmedRenames(input.mappings, input.snapshot, violations);
  const files = new Map(input.snapshot.files.map(entry => [entry.file, entry]));
  const functions = new Map(input.snapshot.functions.map(entry => [`${entry.file}#${entry.name}`, entry]));

  for (const { oldPath, newPath } of renames) {
    const current = files.get(newPath);
    migrateBudget({
      budgets: baseline.legacy.fileLines,
      oldKey: oldPath,
      newKey: newPath,
      actual: current.lines,
      defaultMaximum: baseline.rules.newFileMaxLines,
      rule: 'file-lines',
      violations,
    });
    for (const metric of SOURCE_DEBT_METRICS) {
      migrateBudget({
        budgets: sourceDebtRegistry.budgets[metric],
        oldKey: oldPath,
        newKey: newPath,
        actual: current.metrics?.[metric] ?? 0,
        defaultMaximum: 0,
        rule: `source-debt:${metric}`,
        violations,
      });
    }
    for (const [identity] of Object.entries(functionSizeRegistry.exceptions)) {
      if (!identity.startsWith(`${oldPath}#`)) continue;
      const name = identity.slice(oldPath.length + 1);
      const currentFunction = functions.get(`${newPath}#${name}`);
      migrateBudget({
        budgets: functionSizeRegistry.exceptions,
        oldKey: identity,
        newKey: `${newPath}#${name}`,
        actual: currentFunction?.lines ?? 0,
        defaultMaximum: functionSizeRegistry.defaultMaxLines,
        rule: 'function-lines',
        violations,
      });
    }
  }

  baseline.legacy.fileLines = ordered(baseline.legacy.fileLines);
  baseline.exceptions = migrateExceptions(baseline.exceptions, renames, violations);
  for (const metric of SOURCE_DEBT_METRICS) {
    sourceDebtRegistry.budgets[metric] = ordered(sourceDebtRegistry.budgets[metric]);
  }
  functionSizeRegistry.exceptions = ordered(functionSizeRegistry.exceptions);
  violations.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  return {
    schemaVersion: 1,
    canAccept: violations.length === 0,
    renames,
    violations,
    baseline,
    sourceDebtRegistry,
    functionSizeRegistry,
  };
}

function configPath(repositoryRoot, relativePath) {
  const normalized = path.posix.normalize(relativePath);
  if (!relativePath.startsWith('config/') || normalized !== relativePath || relativePath.includes('\\')) {
    throw new Error(`unsafe clean-code registry path: ${relativePath}`);
  }
  return path.join(repositoryRoot, relativePath);
}

export function acceptBudgetMigration(repositoryRoot, plan) {
  if (!plan.canAccept) throw new Error('clean-code budget migration contains blocking violations');
  const updates = [
    ['config/clean-code-baseline.json', plan.baseline],
    [plan.baseline.budgetSources.sourceDebt, plan.sourceDebtRegistry],
    [plan.baseline.budgetSources.functionSize, plan.functionSizeRegistry],
  ].map(([relativePath, value], index) => {
    const target = configPath(repositoryRoot, relativePath);
    return {
      target,
      temporary: `${target}.clean-code-${process.pid}-${index}.tmp`,
      original: readFileSync(target),
      contents: `${JSON.stringify(value, null, 2)}\n`,
    };
  });
  try {
    for (const update of updates) writeFileSync(update.temporary, update.contents, { flag: 'wx' });
    for (const update of updates) renameSync(update.temporary, update.target);
  } catch (error) {
    for (const update of updates) {
      rmSync(update.temporary, { force: true });
      if (readFileSync(update.target).compare(update.original) !== 0) writeFileSync(update.target, update.original);
    }
    throw error;
  }
}
