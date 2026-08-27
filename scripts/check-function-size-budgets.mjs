import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const PRODUCT_ROOTS = ['src', 'server', 'shared'];
const CODE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
]);

function relativePath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
}

function collectCodeFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) collectCodeFiles(path.join(directory, entry.name), files);
      continue;
    }
    if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  return null;
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    const method = propertyName(node.name);
    if (!method) return null;
    const owner = node.parent && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent))
      ? node.parent.name?.text
      : null;
    return owner ? `${owner}.${method}` : method;
  }
  if (ts.isConstructorDeclaration(node)) {
    const owner = node.parent && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent))
      ? node.parent.name?.text
      : null;
    return owner ? `${owner}.constructor` : null;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (node.name) return node.name.text;
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
    if (ts.isPropertyAssignment(node.parent) || ts.isPropertyDeclaration(node.parent)) {
      return propertyName(node.parent.name);
    }
  }
  return null;
}

export function collectFunctionSizes(repositoryRoot) {
  const absoluteRoot = path.resolve(repositoryRoot);
  const files = [];
  for (const productRoot of PRODUCT_ROOTS) {
    const directory = path.join(absoluteRoot, productRoot);
    if (existsSync(directory)) collectCodeFiles(directory, files);
  }

  const functions = [];
  for (const file of files.sort()) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
    const visit = node => {
      if (ts.isFunctionLike(node) && node.body) {
        const name = functionName(node);
        if (name) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
          const end = sourceFile.getLineAndCharacterOfPosition(node.end).line;
          functions.push({
            file: relativePath(absoluteRoot, file),
            name,
            lines: end - start + 1,
            sourceOrder: node.getStart(sourceFile),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  functions.sort((left, right) => (
    left.file.localeCompare(right.file, 'en')
    || left.name.localeCompare(right.name, 'en')
    || left.sourceOrder - right.sourceOrder
  ));
  const totals = new Map();
  for (const entry of functions) {
    const key = `${entry.file}#${entry.name}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const ordinals = new Map();
  return functions.map(({ sourceOrder: _sourceOrder, ...entry }) => {
    const key = `${entry.file}#${entry.name}`;
    if (totals.get(key) === 1) return entry;
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);
    return { ...entry, name: `${entry.name}@${ordinal}` };
  });
}

export function validateFunctionSizeBudgets(functions, registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('function size registry must be an object');
  }
  if (registry.version !== 1) throw new Error('function size registry version must be 1');
  if (!Number.isInteger(registry.defaultMaxLines) || registry.defaultMaxLines < 1) {
    throw new Error('function size defaultMaxLines must be a positive integer');
  }
  if (!registry.exceptions || typeof registry.exceptions !== 'object' || Array.isArray(registry.exceptions)) {
    throw new Error('function size exceptions must be an object');
  }
  for (const [key, maximum] of Object.entries(registry.exceptions)) {
    if (!key.includes('#')) throw new Error(`invalid function size exception key: ${key}`);
    if (!Number.isInteger(maximum) || maximum <= registry.defaultMaxLines) {
      throw new Error(`function size exception ${key} must exceed the default budget`);
    }
  }

  const seen = new Set();
  const errors = [];
  let largestLines = 0;
  for (const entry of functions) {
    const key = `${entry.file}#${entry.name}`;
    if (seen.has(key)) throw new Error(`ambiguous function identity: ${key}`);
    seen.add(key);
    largestLines = Math.max(largestLines, entry.lines);
    const maximum = registry.exceptions[key] ?? registry.defaultMaxLines;
    if (entry.lines > maximum) errors.push(`${key}: ${entry.lines} / ${maximum}`);
  }
  if (errors.length > 0) throw new Error(`function size budget exceeded:\n${errors.join('\n')}`);

  return {
    functions: functions.length,
    exceptions: Object.keys(registry.exceptions).length,
    largestLines,
  };
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = JSON.parse(readFileSync(
    path.join(repositoryRoot, 'config', 'function-size-budgets.json'),
    'utf8',
  ));
  const summary = validateFunctionSizeBudgets(collectFunctionSizes(repositoryRoot), registry);
  console.log(`[function-size] ok functions=${summary.functions} exceptions=${summary.exceptions} largest=${summary.largestLines} lines`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`[function-size] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
