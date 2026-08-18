import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LIB_ROOT = join(REPOSITORY_ROOT, 'scripts/lib');
const EXPECTED_BOUNDARY_TESTS = [
  'module-boundary-architecture.test.mjs',
  'module-boundary-contracts.test.mjs',
  'module-boundary-exceptions.test.mjs',
  'module-boundary-graph.test.mjs',
  'module-boundary-inventory.test.mjs',
  'module-boundary-path-policy.test.mjs',
];

const LIBRARY_LAYERS = new Map([
  ['diagnostic-text-policy.mjs', 0],
  ['module-boundary-contracts.mjs', 0],
  ['module-boundary-edges.mjs', 0],
  ['module-import-parser.mjs', 0],
  ['npm-script-policy.mjs', 0],
  ['module-boundary-cli.mjs', 1],
  ['repository-path-policy.mjs', 1],
  ['module-boundary-exceptions.mjs', 2],
  ['module-boundary-graph.mjs', 2],
  ['module-boundary-report.mjs', 1],
  ['module-boundary-source-scan.mjs', 2],
  ['module-import-graph.mjs', 2],
  ['module-inventory.mjs', 2],
  ['public-route-inventory.mjs', 2],
  ['module-inventory-validation.mjs', 3],
]);

function lineCount(path) {
  const source = readFileSync(path, 'utf8');
  return source.endsWith('\n')
    ? source.slice(0, -1).split('\n').length
    : source.split('\n').length;
}

function moduleSpecifiersFromSource(fileName, source) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assert.deepEqual(sourceFile.parseDiagnostics, [], `${fileName} must parse without diagnostics`);
  const specifiers = [];
  const visit = node => {
    const forbiddenLoaderProperty = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : null;
    assert.ok(
      !['createRequire', 'getBuiltinModule'].includes(forbiddenLoaderProperty),
      `${fileName} must not create an untracked require alias`,
    );
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.fail(`${fileName} must use static imports instead of import()`);
    }
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require') {
      assert.fail(`${fileName} must use ESM imports instead of require()`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const specifier of specifiers) {
    const hasForbiddenScheme = /^[A-Za-z][A-Za-z+.-]*:/.test(specifier)
      && !specifier.startsWith('node:');
    assert.ok(
      !specifier.startsWith('#')
        && !specifier.startsWith('/')
        && !/^[A-Za-z]:[\\/]/.test(specifier)
        && !hasForbiddenScheme,
      `${fileName} must not bypass the relative import graph with ${specifier}`,
    );
    assert.ok(
      specifier !== 'node:module' && specifier !== 'module',
      `${fileName} must not create an untracked require alias`,
    );
  }
  return specifiers;
}

function moduleSpecifiers(path) {
  return moduleSpecifiersFromSource(path, readFileSync(path, 'utf8'));
}

function siblingImports(fileName) {
  return moduleSpecifiers(join(LIB_ROOT, fileName))
    .filter(specifier => specifier.startsWith('.'))
    .map(specifier => {
      assert.match(specifier, /^\.\/[^/]+\.mjs$/, `${fileName} must use a direct sibling import`);
      return specifier.slice(2);
    });
}

test('module boundary facade and characterization suites stay focused', () => {
  assert.ok(
    lineCount(join(REPOSITORY_ROOT, 'scripts/check-module-boundaries.mjs')) < 500,
    'module boundary facade must stay below 500 lines',
  );

  const boundaryTests = readdirSync(join(REPOSITORY_ROOT, 'tests'))
    .filter(file => /^module-boundar.*\.test\.mjs$/.test(file))
    .sort();
  assert.deepEqual(boundaryTests, EXPECTED_BOUNDARY_TESTS);
  for (const file of boundaryTests) {
    assert.ok(
      lineCount(join(REPOSITORY_ROOT, 'tests', file)) < 500,
      `${file} must stay below 500 lines`,
    );
  }
});

test('module boundary libraries depend only on lower policy layers', () => {
  assert.equal(
    existsSync(join(LIB_ROOT, 'module-boundary-paths.mjs')),
    false,
    'repository path safety must have one canonical owner',
  );

  const facadeSpecifiers = moduleSpecifiers(
    join(REPOSITORY_ROOT, 'scripts/check-module-boundaries.mjs'),
  );
  const facadeRelativeSpecifiers = facadeSpecifiers.filter(specifier => specifier.startsWith('.'));
  for (const specifier of facadeRelativeSpecifiers) {
    assert.match(
      specifier,
      /^\.\/lib\/[^/]+\.mjs$/,
      `facade local imports must be classified direct library imports: ${specifier}`,
    );
  }
  const facadeDependencies = facadeRelativeSpecifiers
    .map(specifier => specifier.slice('./lib/'.length));
  for (const dependency of facadeDependencies) {
    assert.ok(LIBRARY_LAYERS.has(dependency), `facade imports unclassified ${dependency}`);
  }

  const libraryDependencies = new Map();
  for (const [file, layer] of LIBRARY_LAYERS) {
    assert.ok(existsSync(join(LIB_ROOT, file)), `${file} must exist`);
    const dependencies = siblingImports(file);
    libraryDependencies.set(file, dependencies);
    for (const dependency of dependencies) {
      assert.ok(LIBRARY_LAYERS.has(dependency), `${file} imports unclassified ${dependency}`);
      assert.ok(
        LIBRARY_LAYERS.get(dependency) < layer,
        `${file} (layer ${layer}) must not depend on ${dependency} (layer ${LIBRARY_LAYERS.get(dependency)})`,
      );
    }
  }

  const reachable = new Set();
  const visit = file => {
    if (reachable.has(file)) return;
    reachable.add(file);
    for (const dependency of libraryDependencies.get(file) ?? []) visit(dependency);
  };
  for (const dependency of facadeDependencies) visit(dependency);
  assert.deepEqual(
    [...reachable].sort(),
    [...LIBRARY_LAYERS.keys()].sort(),
    'every classified boundary library must be reachable from the facade',
  );
});

test('module boundary layer parser rejects dependency-graph bypasses', () => {
  assert.deepEqual(
    moduleSpecifiersFromSource('static.mjs', "import './side-effect.mjs';\nexport * from './re-export.mjs';\n"),
    ['./side-effect.mjs', './re-export.mjs'],
  );
  assert.throws(
    () => moduleSpecifiersFromSource('dynamic.mjs', "import('./hidden.mjs');\n"),
    /static imports/,
  );
  assert.throws(
    () => moduleSpecifiersFromSource('require.mjs', "require('./hidden.mjs');\n"),
    /ESM imports/,
  );
  assert.throws(
    () => moduleSpecifiersFromSource('create-require.mjs', "import { createRequire } from 'node:module';\n"),
    /require alias/,
  );
  assert.throws(
    () => moduleSpecifiersFromSource('alias.mjs', "import '#hidden';\n"),
    /relative import graph/,
  );
  assert.throws(
    () => moduleSpecifiersFromSource('data.mjs', "import 'data:text/javascript,export default 1';\n"),
    /relative import graph/,
  );
  assert.throws(
    () => moduleSpecifiersFromSource(
      'builtin-loader.mjs',
      "process.getBuiltinModule('module').createRequire(import.meta.url);\n",
    ),
    /require alias/,
  );
  assert.throws(
    () => moduleSpecifiersFromSource('invalid.mjs', 'import {\n'),
    /parse without diagnostics/,
  );
});
