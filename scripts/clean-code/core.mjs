import path from 'node:path';

const SOURCE_DEBT_METRICS = [
  'explicitAny',
  'typeScriptSuppressions',
  'nonNullAssertions',
  'frontendRawFetch',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function assertSafePath(value, label) {
  const normalized = typeof value === 'string' ? path.posix.normalize(value) : '';
  if (typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || value.includes('\0')
    || path.posix.isAbsolute(value)
    || normalized !== value
    || value.startsWith('../')) {
    throw new Error(`unsafe ${label}: ${String(value)}`);
  }
}

function validateBudgetSource(value, label) {
  assertSafePath(value, `${label} budget source`);
  if (!value.startsWith('config/') || !value.endsWith('.json')) {
    throw new Error(`${label} budget source must be a config JSON path`);
  }
}

export function validateCleanCodeBaseline(baseline, today = new Date().toISOString().slice(0, 10)) {
  if (!isRecord(baseline)) throw new Error('clean-code baseline must be an object');
  if (baseline.schemaVersion !== 1) throw new Error('clean-code baseline schemaVersion must be 1');
  if (!isRecord(baseline.rules)) throw new Error('clean-code baseline rules must be an object');
  if (!Number.isInteger(baseline.rules.newFileMaxLines) || baseline.rules.newFileMaxLines < 1) {
    throw new Error('newFileMaxLines must be a positive integer');
  }
  if (!isRecord(baseline.budgetSources)) throw new Error('budgetSources must be an object');
  validateBudgetSource(baseline.budgetSources.sourceDebt, 'source debt');
  validateBudgetSource(baseline.budgetSources.functionSize, 'function size');
  if (!isRecord(baseline.legacy) || !isRecord(baseline.legacy.fileLines)) {
    throw new Error('legacy.fileLines must be an object');
  }
  for (const [file, maximum] of Object.entries(baseline.legacy.fileLines)) {
    assertSafePath(file, 'baseline path');
    assertNonNegativeInteger(maximum, `file line budget for ${file}`);
    if (maximum <= baseline.rules.newFileMaxLines) {
      throw new Error(`legacy file budget must exceed newFileMaxLines: ${file}`);
    }
  }
  if (!Array.isArray(baseline.exceptions)) throw new Error('exceptions must be an array');
  const exceptionIds = new Set();
  for (const exception of baseline.exceptions) {
    if (!isRecord(exception) || typeof exception.id !== 'string' || exception.id.trim() === '') {
      throw new Error('each clean-code exception requires an id');
    }
    if (exceptionIds.has(exception.id)) throw new Error(`duplicate clean-code exception: ${exception.id}`);
    exceptionIds.add(exception.id);
    if (typeof exception.owner !== 'string' || exception.owner.trim() === '') {
      throw new Error(`clean-code exception owner is required: ${exception.id}`);
    }
    if (typeof exception.reason !== 'string' || exception.reason.trim() === '') {
      throw new Error(`clean-code exception reason is required: ${exception.id}`);
    }
    if (typeof exception.expires !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires)) {
      throw new Error(`clean-code exception expiry must be YYYY-MM-DD: ${exception.id}`);
    }
    if (exception.expires < today) {
      throw new Error(`expired clean-code exception: ${exception.id} (${exception.expires})`);
    }
  }
  return baseline;
}

function validateSourceDebtRegistry(registry) {
  if (!isRecord(registry) || registry.version !== 1 || !isRecord(registry.budgets)) {
    throw new Error('source debt registry version must be 1');
  }
  for (const metric of SOURCE_DEBT_METRICS) {
    const budgets = registry.budgets[metric];
    if (!isRecord(budgets)) throw new Error(`${metric} budgets must be an object`);
    for (const [file, maximum] of Object.entries(budgets)) {
      assertSafePath(file, `${metric} budget path`);
      assertNonNegativeInteger(maximum, `${metric} budget for ${file}`);
    }
  }
}

function validateFunctionSizeRegistry(registry) {
  if (!isRecord(registry) || registry.version !== 1) {
    throw new Error('function size registry version must be 1');
  }
  if (!Number.isInteger(registry.defaultMaxLines) || registry.defaultMaxLines < 1) {
    throw new Error('function size defaultMaxLines must be a positive integer');
  }
  if (!isRecord(registry.exceptions)) throw new Error('function size exceptions must be an object');
  for (const [identity, maximum] of Object.entries(registry.exceptions)) {
    if (!identity.includes('#')) throw new Error(`invalid function size exception key: ${identity}`);
    assertNonNegativeInteger(maximum, `function size exception for ${identity}`);
    if (maximum <= registry.defaultMaxLines) {
      throw new Error(`function size exception must exceed the default: ${identity}`);
    }
  }
}

function scopeMappings(snapshot, scope) {
  const files = new Set(snapshot.files.map(entry => entry.file));
  if (!isRecord(scope) || !['full', 'changed', 'module'].includes(scope.mode)) {
    throw new Error('clean-code scope must be full, changed, or module');
  }
  if (scope.mode === 'full') {
    return [...files].sort().map(file => ({ file, baselineFile: file }));
  }
  if (scope.mode === 'module') {
    assertSafePath(scope.module, 'module scope');
    const prefix = scope.module.replace(/\/$/, '');
    return [...files]
      .filter(file => file === prefix || file.startsWith(`${prefix}/`))
      .sort()
      .map(file => ({ file, baselineFile: file }));
  }
  if (!Array.isArray(scope.files)) throw new Error('changed scope files must be an array');
  const mappings = new Map();
  for (const entry of scope.files) {
    if (!isRecord(entry)) throw new Error('changed scope entry must be an object');
    assertSafePath(entry.file, 'changed file path');
    assertSafePath(entry.baselineFile, 'changed baseline path');
    if (files.has(entry.file)) mappings.set(entry.file, entry.baselineFile);
  }
  return [...mappings].sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([file, baselineFile]) => ({ file, baselineFile }));
}

function violation(id, rule, file, actual, maximum, message) {
  return { id, rule, file, actual, maximum, message };
}

export function evaluateCleanCodeSnapshot(snapshot, options) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.files) || !Array.isArray(snapshot.functions)) {
    throw new Error('clean-code snapshot must contain files and functions arrays');
  }
  const baseline = validateCleanCodeBaseline(options.baseline, options.today);
  validateSourceDebtRegistry(options.sourceDebtRegistry);
  validateFunctionSizeRegistry(options.functionSizeRegistry);
  const mappings = scopeMappings(snapshot, options.scope);
  const baselinePathByFile = new Map(mappings.map(entry => [entry.file, entry.baselineFile]));
  const selectedFiles = new Set(baselinePathByFile.keys());
  const filesByPath = new Map(snapshot.files.map(entry => [entry.file, entry]));
  const findings = [];

  for (const { file, baselineFile } of mappings) {
    const entry = filesByPath.get(file);
    const maximum = baseline.legacy.fileLines[baselineFile] ?? baseline.rules.newFileMaxLines;
    if (entry.lines > maximum) {
      findings.push(violation(
        `file-lines:${file}`,
        'file-lines',
        file,
        entry.lines,
        maximum,
        `${file} has ${entry.lines} lines; maximum is ${maximum}`,
      ));
    }
    for (const diagnostic of entry.parseDiagnostics ?? []) {
      findings.push(violation(
        `parse:${file}:${diagnostic.line}:${diagnostic.character}:${diagnostic.code}`,
        'parse',
        file,
        1,
        0,
        `${file}:${diagnostic.line}:${diagnostic.character} TS${diagnostic.code}: ${diagnostic.message}`,
      ));
    }
    for (const metric of SOURCE_DEBT_METRICS) {
      const actual = entry.metrics?.[metric] ?? 0;
      assertNonNegativeInteger(actual, `${metric} snapshot for ${file}`);
      const debtMaximum = options.sourceDebtRegistry.budgets[metric][baselineFile] ?? 0;
      if (actual > debtMaximum) {
        findings.push(violation(
          `source-debt:${metric}:${file}`,
          `source-debt:${metric}`,
          file,
          actual,
          debtMaximum,
          `${metric} debt grew in ${file}: ${actual} / ${debtMaximum}`,
        ));
      }
    }
  }

  for (const entry of snapshot.functions) {
    if (!selectedFiles.has(entry.file)) continue;
    const baselineFile = baselinePathByFile.get(entry.file);
    const baselineIdentity = `${baselineFile}#${entry.name}`;
    const maximum = options.functionSizeRegistry.exceptions[baselineIdentity]
      ?? options.functionSizeRegistry.defaultMaxLines;
    if (entry.lines > maximum) {
      findings.push(violation(
        `function-lines:${entry.file}#${entry.name}`,
        'function-lines',
        entry.file,
        entry.lines,
        maximum,
        `${entry.file}#${entry.name} has ${entry.lines} lines; maximum is ${maximum}`,
      ));
    }
  }

  findings.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const exceptions = new Map(baseline.exceptions.map(entry => [entry.id, entry]));
  const suppressed = [];
  const violations = [];
  for (const finding of findings) {
    const exception = exceptions.get(finding.id);
    if (exception) suppressed.push({ ...finding, exception });
    else violations.push(finding);
  }
  return {
    schemaVersion: 1,
    scope: options.scope.mode,
    status: violations.length === 0 ? 'pass' : 'fail',
    files: mappings,
    violations,
    suppressed,
    summary: {
      files: mappings.length,
      functions: snapshot.functions.filter(entry => selectedFiles.has(entry.file)).length,
      violations: violations.length,
      suppressed: suppressed.length,
    },
  };
}

export function createCleanCodeBaselineCandidate(snapshot, currentBaseline) {
  const baseline = validateCleanCodeBaseline(currentBaseline);
  const fileLines = Object.fromEntries(snapshot.files
    .filter(entry => entry.lines > baseline.rules.newFileMaxLines)
    .sort((left, right) => left.file.localeCompare(right.file, 'en'))
    .map(entry => [entry.file, entry.lines]));
  const increases = Object.entries(fileLines)
    .filter(([file, lines]) => lines > (baseline.legacy.fileLines[file] ?? baseline.rules.newFileMaxLines))
    .map(([file, lines]) => violation(
      `file-lines:${file}`,
      'file-lines',
      file,
      lines,
      baseline.legacy.fileLines[file] ?? baseline.rules.newFileMaxLines,
      `${file} cannot be added to the baseline at ${lines} lines`,
    ));
  return {
    canAccept: increases.length === 0,
    increases,
    baseline: {
      ...baseline,
      legacy: { ...baseline.legacy, fileLines },
    },
  };
}

export function renderCleanCodeReport(report, format = 'human') {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown') {
    const lines = [
      '# Clean-code report',
      '',
      `Status: **${report.status.toUpperCase()}**`,
      '',
      `Scope: \`${report.scope}\`; files: ${report.summary.files}; violations: ${report.summary.violations}; suppressed: ${report.summary.suppressed}.`,
    ];
    if (report.violations.length > 0) {
      lines.push('', '## Violations', '');
      for (const entry of report.violations) lines.push(`- \`${entry.id}\` — ${entry.message}`);
    }
    return `${lines.join('\n')}\n`;
  }
  if (format !== 'human') throw new Error(`unsupported clean-code report format: ${format}`);
  const lines = [
    `[clean-code] ${report.status.toUpperCase()} scope=${report.scope} files=${report.summary.files} violations=${report.summary.violations} suppressed=${report.summary.suppressed}`,
  ];
  for (const entry of report.violations) lines.push(`  ${entry.id}: ${entry.message}`);
  return `${lines.join('\n')}\n`;
}
