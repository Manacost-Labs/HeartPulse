import {
  assertNonNegativeInteger,
  assertSafePath,
  isRecord,
  SOURCE_DEBT_METRICS,
  validateCleanCodeBaseline,
  validateFunctionSizeRegistry,
  validateSourceDebtRegistry,
} from './validation.mjs';

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

function fileFindings(entry, baselineFile, baseline, sourceDebtRegistry) {
  const findings = [];
  const maximum = baseline.legacy.fileLines[baselineFile] ?? baseline.rules.newFileMaxLines;
  if (entry.lines > maximum) {
    findings.push(violation(
      `file-lines:${entry.file}`,
      'file-lines',
      entry.file,
      entry.lines,
      maximum,
      `${entry.file} has ${entry.lines} lines; maximum is ${maximum}`,
    ));
  }
  for (const diagnostic of entry.parseDiagnostics ?? []) {
    findings.push(violation(
      `parse:${entry.file}:${diagnostic.line}:${diagnostic.character}:${diagnostic.code}`,
      'parse',
      entry.file,
      1,
      0,
      `${entry.file}:${diagnostic.line}:${diagnostic.character} TS${diagnostic.code}: ${diagnostic.message}`,
    ));
  }
  for (const metric of SOURCE_DEBT_METRICS) {
    const actual = entry.metrics?.[metric] ?? 0;
    assertNonNegativeInteger(actual, `${metric} snapshot for ${entry.file}`);
    const maximumDebt = sourceDebtRegistry.budgets[metric][baselineFile] ?? 0;
    if (actual > maximumDebt) {
      findings.push(violation(
        `source-debt:${metric}:${entry.file}`,
        `source-debt:${metric}`,
        entry.file,
        actual,
        maximumDebt,
        `${metric} debt grew in ${entry.file}: ${actual} / ${maximumDebt}`,
      ));
    }
  }
  return findings;
}

function functionFindings(functions, selectedFiles, baselinePathByFile, registry) {
  const findings = [];
  for (const entry of functions) {
    if (!selectedFiles.has(entry.file)) continue;
    const baselineIdentity = `${baselinePathByFile.get(entry.file)}#${entry.name}`;
    const maximum = registry.exceptions[baselineIdentity] ?? registry.defaultMaxLines;
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
  return findings;
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
  const findings = mappings.flatMap(({ file, baselineFile }) => (
    fileFindings(filesByPath.get(file), baselineFile, baseline, options.sourceDebtRegistry)
  ));
  findings.push(...functionFindings(
    snapshot.functions,
    selectedFiles,
    baselinePathByFile,
    options.functionSizeRegistry,
  ));
  findings.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const exceptions = new Map(baseline.exceptions.map(entry => [entry.id, entry]));
  const suppressed = findings.filter(finding => exceptions.has(finding.id))
    .map(finding => ({ ...finding, exception: exceptions.get(finding.id) }));
  const violations = findings.filter(finding => !exceptions.has(finding.id));
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

export function createCleanCodeBaselineCandidate(snapshot, currentBaseline, today) {
  const baseline = validateCleanCodeBaseline(currentBaseline, today);
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
    baseline: { ...baseline, legacy: { ...baseline.legacy, fileLines } },
  };
}
